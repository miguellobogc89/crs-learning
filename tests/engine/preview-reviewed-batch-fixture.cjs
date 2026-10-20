/**
 * Read-only preview of the first two-observation batch.
 * No --apply mode exists: approvals and writes must be separate operations.
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");
const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const workspaceId = "9cb8b07f-7da2-4178-87bb-4e8e2f6d41d7";
const userId = "ee893ecb-c740-4b93-a9d9-211e5c6f3f1c";
const documentId = "c741c1be-03a0-47e3-bb63-c9848886b0ae";
const candidates = [
  {
    objectTypeId: "26fd37dd-68e0-4921-b788-78a1659a98a5",
    documentId, fieldKey: "name",
    evidenceText: "Proveedor: Lacteos Sur",
    values: { name: "Lacteos Sur" },
  },
  {
    objectTypeId: "a5956242-bbb5-49c3-881d-a68ba9ad9933",
    documentId, fieldKey: "name",
    evidenceText: "Producto: leche entera",
    values: { name: "leche entera" },
  },
];
if (process.argv.length !== 2) {
  console.error("This fixture is read-only and takes no arguments.");
  process.exit(1);
}
const oldResolve = Module._resolveFilename;
const oldLoader = Module._extensions[".ts"];
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith("@/")) {
    const local = path.join(root, request.slice(2));
    if (fs.existsSync(local + ".ts")) return local + ".ts";
  }
  return oldResolve.call(this, request, parent, ...rest);
};
Module._extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, filename);
};
(async () => {
  try {
    const { prisma } = require("../../lib/prisma.ts");
    const { knowledgeSourceReadWhere } =
      require("../../lib/knowledge/access-control.ts");
    const { preflightEngineImportCandidates } =
      require("../../lib/engine/import-preflight.ts");
    const { validateEngineRecordValues } =
      require("../../lib/engine/validation.ts");
    const { planReviewedKnowledgeBatch } =
      require("../../lib/engine/import-reviewed-batch-plan.ts");
    const [workspace, file, types, pending] = await Promise.all([
      prisma.workspaces.findFirst({
        where: { id: workspaceId, status: "active" },
        select: { owner_user_id: true, workspace_members: {
          where: { user_id: userId, status: "active" }, select: { role: true },
        } },
      }),
      prisma.knowledge_files.findFirst({
        where: { id: documentId, status: "ready",
          knowledge_sources: knowledgeSourceReadWhere(userId, workspaceId) },
        select: { id: true, extracted_text: true },
      }),
      prisma.engine_object_types.findMany({
        where: { workspace_id: workspaceId, status: "active",
          id: { in: candidates.map((candidate) => candidate.objectTypeId) } },
        include: { engine_field_definitions: { where: { status: "active" } } },
      }),
      prisma.engine_value_conflicts.findMany({
        where: { workspace_id: workspaceId, status: "pending_review" },
        select: { subject: true, attribute: true, context: true,
          alternatives_json: true }, take: 100,
      }),
    ]);
    const role = workspace?.workspace_members[0]?.role;
    if (!workspace || (workspace.owner_user_id !== userId &&
        !["owner", "admin"].includes(role ?? ""))) {
      throw new Error("Owner or admin required.");
    }
    if (!file || types.length !== 2) throw new Error("Missing authorized evidence or types.");
    const preflight = preflightEngineImportCandidates({
      workspaceId,
      documents: [{ id: file.id, workspaceId, extractedText: file.extracted_text }],
      candidates,
    });
    if (preflight.issues.length) throw new Error(JSON.stringify(preflight.issues));
    for (const candidate of candidates) {
      const fields = types.find((type) => type.id === candidate.objectTypeId)
        ?.engine_field_definitions;
      if (!fields || fields.some((field) => field.is_unique ||
          ["entity_reference", "record_reference"].includes(field.field_type)) ||
          !fields.some((field) => field.key === candidate.fieldKey)) {
        throw new Error("Unsupported type or field.");
      }
      const result = validateEngineRecordValues(candidate.values, fields);
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
    }
    if (pending.length === 100) throw new Error("Pending conflicts may be truncated.");
    const conflicts = pending.map((conflict) => {
      if (!Array.isArray(conflict.alternatives_json) ||
          !conflict.alternatives_json.every((alternative) =>
            alternative && typeof alternative === "object" &&
            typeof alternative.value === "string" &&
            Array.isArray(alternative.evidence) &&
            alternative.evidence.every((evidence) =>
              evidence && typeof evidence.documentId === "string" &&
              typeof evidence.quote === "string" && evidence.quote.trim()))) {
        throw new Error("Malformed conflict evidence.");
      }
      return {
        subject: conflict.subject, attribute: conflict.attribute,
        context: conflict.context, status: "PENDING_REVIEW",
        scope: "AFFECTED_VALUE_ONLY",
        alternatives: conflict.alternatives_json,
      };
    });
    const plan = planReviewedKnowledgeBatch({ workspaceId, candidates, conflicts });
    const observations = await Promise.all(plan.eligible.map(async (item) => {
      const existing = await prisma.engine_records.findFirst({
        where: { workspace_id: workspaceId,
          object_type_id: item.candidate.objectTypeId,
          external_key: item.observationKey },
        select: { id: true, status: true, revision: true },
      });
      return { observationKey: item.observationKey,
        candidate: item.candidate, existing };
    }));
    console.log(JSON.stringify({
      ok: true, mode: "READ_ONLY", status: plan.status,
      pendingConflictCount: pending.length, observations,
      heldForConflict: plan.heldForConflict.length,
      heldForIdentity: plan.heldForIdentity.length,
      repeatedObservations: plan.repeatedObservations.length,
      note: "No writes. Inspect exact candidates before any explicit approval.",
    }, null, 2));
  } catch (error) {
    console.error("Batch preview failed:",
      error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    try { await require("../../lib/prisma.ts").prisma.$disconnect(); } catch {}
    Module._resolveFilename = oldResolve;
    if (oldLoader) Module._extensions[".ts"] = oldLoader;
    else delete Module._extensions[".ts"];
  }
})();
