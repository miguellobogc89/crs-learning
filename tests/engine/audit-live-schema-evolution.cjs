/**
 * Read-only live Knowledge -> AI discovery -> schema comparison -> semantic
 * suggestions audit. Does NOT call approval/persistence functions.
 * Set ENGINE_AUDIT_DOCUMENT_ID to an accessible ready Knowledge file.
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");
const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const workspaceId = process.env.ENGINE_FIXTURE_WORKSPACE_ID ||
  "9cb8b07f-7da2-4178-87bb-4e8e2f6d41d7";
const userId = process.env.ENGINE_FIXTURE_USER_ID ||
  "ee893ecb-c740-4b93-a9d9-211e5c6f3f1c";
const documentId = process.env.ENGINE_AUDIT_DOCUMENT_ID ||
  "c741c1be-03a0-47e3-bb63-c9848886b0ae";
if (process.argv.length !== 2) {
  console.error("This audit accepts no command line arguments.");
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
    const { previewDynamicSchemaEvolutionWithSemanticReview } =
      require("../../lib/engine/schema-discovery/preview-evolution.service.ts");
    const result = await previewDynamicSchemaEvolutionWithSemanticReview({
      workspaceId, userId, knowledgeFileIds: [documentId],
    });
    console.log(JSON.stringify({
      ok: result.status === "NEEDS_HUMAN_SCHEMA_APPROVAL",
      mode: "READ_ONLY_AI",
      documentId,
      status: result.status,
      discoveryIssues: result.discovery.issues,
      discoveredEntities: result.discovery.proposal?.entities.map(e => ({
        key: e.key, fields: e.fields.map(f => f.key),
      })) ?? [],
      suggestedChanges: result.comparison?.suggested ?? [],
      semantic: result.semantic ?? null,
      writesPerformed: false,
      limitations: [
        "AI results require review and are not semantic proof.",
        "No new fields, types, records or relations are persisted.",
        "An existing document may contain no novel fields.",
      ],
    }, null, 2));
    if (result.status !== "NEEDS_HUMAN_SCHEMA_APPROVAL") process.exitCode = 1;
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
