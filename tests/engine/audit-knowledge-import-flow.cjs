/**
 * End-to-end READ-ONLY audit of document -> typed preview -> observation
 * persistence state -> entity identity review. No model calls or writes.
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
  { objectTypeId: "26fd37dd-68e0-4921-b788-78a1659a98a5",
    documentId, fieldKey: "name", evidenceText: "Proveedor: Lacteos Sur",
    values: { name: "Lacteos Sur" } },
  { objectTypeId: "a5956242-bbb5-49c3-881d-a68ba9ad9933",
    documentId, fieldKey: "name", evidenceText: "Producto: leche entera",
    values: { name: "leche entera" } },
];
if (process.argv.length !== 2) {
  console.error("This audit is read-only and accepts no arguments.");
  process.exit(1);
}
const oldResolve = Module._resolveFilename;
const oldLoader = Module._extensions[".ts"];
Module._resolveFilename = function(request, parent, ...rest) {
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
  let prisma;
  try {
    ({ prisma } = require("../../lib/prisma.ts"));
    const { previewEngineImportFromKnowledge } =
      require("../../lib/engine/import-knowledge-preview.service.ts");
    const { extractionObservationKey } =
      require("../../lib/engine/import-observation-identity.ts");
    const { planEntityIdentityReview } =
      require("../../lib/engine/entity-identity-review.ts");
    const preview = await previewEngineImportFromKnowledge({
      workspaceId, userId, knowledgeFileIds: [documentId], candidates,
    });
    const records = await prisma.engine_records.findMany({
      where: { workspace_id: workspaceId,
        object_type_id: { in: candidates.map((c) => c.objectTypeId) } },
      select: { id: true, workspace_id: true, object_type_id: true,
        external_key: true, status: true, revision: true, values_json: true },
      take: 501,
    });
    if (records.length > 500) throw new Error("Record limit exceeded.");
    const observations = preview.accepted.map((candidate) => {
      const observationKey = extractionObservationKey({ workspaceId, candidate });
      const persisted = records.find((r) =>
        r.object_type_id === candidate.objectTypeId && r.external_key === observationKey);
      const otherRecords = records.filter((r) => r.id !== persisted?.id);
      const identity = planEntityIdentityReview({
        candidate: { workspaceId, objectTypeId: candidate.objectTypeId,
          values: candidate.values },
        records: otherRecords.map((r) => ({
          id: r.id, workspaceId: r.workspace_id, objectTypeId: r.object_type_id,
          status: r.status, values: r.values_json,
        })),
      });
      return {
        observationKey, objectTypeId: candidate.objectTypeId,
        evidenceText: candidate.evidenceText,
        persisted: persisted ? {
          id: persisted.id, status: persisted.status, revision: persisted.revision,
        } : null,
        identityReview: identity,
      };
    });
    console.log(JSON.stringify({
      ok: preview.issues.length === 0,
      mode: "READ_ONLY", documentId,
      proposedCount: candidates.length, acceptedCount: preview.accepted.length,
      issues: preview.issues, observations,
      relationshipStatus: "NOT_INFERRED_OR_CREATED",
      limitations: [
        "Fixture candidates are pinned; this does not invoke or test AI extraction.",
        "Exact-label identity suggestions are not semantic entity resolution.",
        "No conflict-aware batch approval or record-level relation is executed.",
        "Persisted observations are not proof that entity links exist.",
      ],
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect();
    Module._resolveFilename = oldResolve;
    if (oldLoader) Module._extensions[".ts"] = oldLoader;
    else delete Module._extensions[".ts"];
  }
})();
