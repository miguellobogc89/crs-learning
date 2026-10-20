/**
 * Controlled first document observation test. READ_ONLY by default.
 * --apply requires explicit user action and writes exactly one draft.
 * A second --apply must return created:false with the same record id.
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
const candidate = Object.freeze({
  objectTypeId: "26fd37dd-68e0-4921-b788-78a1659a98a5",
  documentId: "c741c1be-03a0-47e3-bb63-c9848886b0ae",
  fieldKey: "name",
  evidenceText: "Proveedor: Lacteos Sur",
  values: { name: "Lacteos Sur" },
});
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
  console.error("Only optional --apply is supported.");
  process.exit(1);
}
const apply = args[0] === "--apply";
const originalResolve = Module._resolveFilename;
const originalLoader = Module._extensions[".ts"];
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith("@/")) {
    const local = path.join(root, request.slice(2));
    if (fs.existsSync(local + ".ts")) return local + ".ts";
    if (fs.existsSync(local + ".js")) return local + ".js";
  }
  return originalResolve.call(this, request, parent, ...rest);
};
Module._extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};
(async () => {
  try {
    const { prisma } = require("../../lib/prisma.ts");
    const { knowledgeSourceReadWhere } = require("../../lib/knowledge/access-control.ts");
    const { extractionObservationKey } =
      require("../../lib/engine/import-observation-identity.ts");
    const { preflightEngineImportCandidates } =
      require("../../lib/engine/import-preflight.ts");
    const { validateEngineRecordValues } =
      require("../../lib/engine/validation.ts");
    const { persistReviewedKnowledgeObservation } =
      require("../../lib/engine/persist-reviewed-observation.service.ts");
    const [workspace, file, type, pending] = await Promise.all([
      prisma.workspaces.findFirst({
        where: { id: workspaceId, status: "active" },
        select: { owner_user_id: true, workspace_members: {
          where: { user_id: userId, status: "active" },
          select: { role: true },
        } },
      }),
      prisma.knowledge_files.findFirst({
        where: { id: candidate.documentId, status: "ready",
          knowledge_sources: knowledgeSourceReadWhere(userId, workspaceId) },
        select: { id: true, extracted_text: true, knowledge_source_id: true },
      }),
      prisma.engine_object_types.findFirst({
        where: { id: candidate.objectTypeId, workspace_id: workspaceId,
          status: "active", key: "supplier" },
        select: { id: true, key: true, engine_field_definitions: {
          where: { status: "active" },
          select: { key: true, field_type: true, is_required: true,
            is_unique: true, status: true, configuration: true },
        } },
      }),
      prisma.engine_value_conflicts.findMany({
        where: { workspace_id: workspaceId, status: "pending_review" },
        select: { alternatives_json: true }, take: 100,
      }),
    ]);
    const role = workspace?.workspace_members[0]?.role;
    if (!workspace || (workspace.owner_user_id !== userId &&
        !["owner", "admin"].includes(role ?? ""))) {
      throw new Error("Owner or admin permission required.");
    }
    if (!file || !type) throw new Error("Reviewed source or type unavailable.");
    const preflight = preflightEngineImportCandidates({
      workspaceId,
      documents: [{ id: file.id, workspaceId, extractedText: file.extracted_text }],
      candidates: [candidate],
    });
    if (preflight.issues.length || preflight.accepted.length !== 1) {
      throw new Error("Evidence validation failed: " + JSON.stringify(preflight.issues));
    }
    const fields = type.engine_field_definitions;
    if (fields.some((field) => field.is_unique ||
        ["entity_reference", "record_reference"].includes(field.field_type))) {
      throw new Error("Unsupported field definition.");
    }
    const checked = validateEngineRecordValues(candidate.values, fields);
    if (!checked.ok) throw new Error("Values invalid: " + JSON.stringify(checked.issues));
    if (pending.length === 100) throw new Error("Pending conflict list may be truncated.");
    for (const conflict of pending) {
      if (!Array.isArray(conflict.alternatives_json)) throw new Error("Malformed conflict.");
      for (const alternative of conflict.alternatives_json) {
        if (!alternative || typeof alternative !== "object" ||
            !Array.isArray(alternative.evidence)) throw new Error("Malformed alternative.");
        for (const evidence of alternative.evidence) {
          if (!evidence || typeof evidence !== "object" ||
              typeof evidence.documentId !== "string" ||
              typeof evidence.quote !== "string" || !evidence.quote.trim()) {
            throw new Error("Malformed conflict evidence.");
          }
          if (evidence.documentId === candidate.documentId &&
              (candidate.evidenceText.includes(evidence.quote) ||
                evidence.quote.includes(candidate.evidenceText))) {
            throw new Error("Selected observation overlaps pending conflict.");
          }
        }
      }
    }
    const externalKey = extractionObservationKey({ workspaceId, candidate });
    const before = await prisma.engine_records.findFirst({
      where: { workspace_id: workspaceId, object_type_id: type.id, external_key: externalKey },
      select: { id: true, status: true, revision: true },
    });
    if (!apply) {
      console.log(JSON.stringify({
        ok: true, mode: "READ_ONLY", type: type.key, candidate,
        pendingConflictCount: pending.length,
        existingObservation: before,
        note: "No writes. Use --apply only after approving this exact candidate.",
      }, null, 2));
      return;
    }
    const result = await persistReviewedKnowledgeObservation({
      workspaceId, userId, candidate, approved: true,
    });
    const [record, provenance, revision] = await Promise.all([
      prisma.engine_records.findFirst({
        where: { id: result.id, workspace_id: workspaceId },
        select: { id: true, status: true, revision: true, external_key: true, values_json: true },
      }),
      prisma.engine_record_provenance.findMany({
        where: { workspace_id: workspaceId, record_id: result.id, revision: 1 },
        select: { knowledge_file_id: true, knowledge_source_id: true,
          field_key: true, evidence_text: true, origin_type: true },
      }),
      prisma.engine_record_revisions.findFirst({
        where: { workspace_id: workspaceId, record_id: result.id, revision: 1 },
        select: { revision: true, status: true, values_json: true },
      }),
    ]);
    if (!record || record.status !== "draft" || record.revision !== 1 ||
        record.external_key !== externalKey ||
        !revision || revision.status !== "draft" ||
        !provenance.some((p) => p.knowledge_file_id === candidate.documentId &&
          p.knowledge_source_id === file.knowledge_source_id &&
          p.field_key === candidate.fieldKey &&
          p.evidence_text === candidate.evidenceText &&
          p.origin_type === "document")) {
      throw new Error("Persisted record, revision or provenance verification failed.");
    }
    console.log(JSON.stringify({
      ok: true, mode: "APPLIED", created: result.created,
      record, revision, provenance,
      note: "Draft only. Re-run --apply to verify idempotency.",
    }, null, 2));
  } catch (error) {
    console.error("Observation fixture failed:",
      error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    try { await require("../../lib/prisma.ts").prisma.$disconnect(); } catch {}
    Module._resolveFilename = originalResolve;
    if (originalLoader) Module._extensions[".ts"] = originalLoader;
    else delete Module._extensions[".ts"];
  }
})();
