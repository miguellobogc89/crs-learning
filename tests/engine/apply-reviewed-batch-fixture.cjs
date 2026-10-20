/**
 * Explicitly approved two-observation batch fixture.
 * READ_ONLY by default. --apply persists ONLY the two pinned observations.
 * Never publishes records, resolves entity identity or changes conflicts.
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
const expectedKeys = [
  "obs_fac6db90a275fd814ed39034bf106f21f1f665ab4bff51d087412546d4c28e8d",
  "obs_4ab5e7c35ad0c0cbf5e73724eefbb05bd986730987149773a3718278776ed894",
];
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
  }
  return originalResolve.call(this, request, parent, ...rest);
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
    const { extractionObservationKey } =
      require("../../lib/engine/import-observation-identity.ts");
    const keys = candidates.map((candidate) =>
      extractionObservationKey({ workspaceId, candidate }));
    if (keys.some((key, i) => key !== expectedKeys[i])) {
      throw new Error("Pinned observation identity changed; refuse execution.");
    }
    if (!apply) {
      console.log(JSON.stringify({
        ok: true, mode: "READ_ONLY", workspaceId, candidates,
        approvedObservationKeys: keys,
        note: "No writes. --apply explicitly persists these two pinned drafts.",
      }, null, 2));
      return;
    }
    const { persistApprovedKnowledgeBatch } =
      require("../../lib/engine/persist-approved-batch.service.ts");
    const result = await persistApprovedKnowledgeBatch({
      workspaceId, userId, candidates,
      approvedObservationKeys: keys,
    });
    const records = await Promise.all(result.committed.map(async (item) => {
      const [record, revisions, provenance] = await Promise.all([
        prisma.engine_records.findFirst({
          where: { id: item.recordId, workspace_id: workspaceId },
          select: { id: true, status: true, revision: true,
            external_key: true, values_json: true },
        }),
        prisma.engine_record_revisions.findMany({
          where: { workspace_id: workspaceId, record_id: item.recordId },
          select: { revision: true }, orderBy: { revision: "asc" },
        }),
        prisma.engine_record_provenance.findMany({
          where: { workspace_id: workspaceId, record_id: item.recordId },
          select: { knowledge_file_id: true, field_key: true,
            evidence_text: true, origin_type: true },
        }),
      ]);
      if (!record || record.status !== "draft" || record.revision !== 1 ||
          record.external_key !== item.observationKey ||
          revisions.length !== 1 || revisions[0].revision !== 1 ||
          provenance.length !== 1 || provenance[0].knowledge_file_id !== documentId ||
          provenance[0].origin_type !== "document") {
        throw new Error("Record history or evidence verification failed for " + item.recordId);
      }
      return { ...item, record, revisionCount: revisions.length, provenance };
    }));
    console.log(JSON.stringify({
      ...result, mode: "APPLIED", records,
      note: "Drafts only. Each observation commits independently; partial failure is reported.",
    }, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error("Batch fixture failed:",
      error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    try { await require("../../lib/prisma.ts").prisma.$disconnect(); } catch {}
    Module._resolveFilename = originalResolve;
    if (originalLoader) Module._extensions[".ts"] = originalLoader;
    else delete Module._extensions[".ts"];
  }
})();
