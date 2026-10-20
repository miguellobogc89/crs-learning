/**
 * Read-only identity review against records in the selected workspace.
 * Usage: node tests/engine/inspect-entity-identity-fixture.cjs
 * Requires ENGINE_FIXTURE_WORKSPACE_ID and ENGINE_FIXTURE_OBJECT_TYPE_ID.
 * No writes, merges or links.
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");
const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const workspaceId = process.env.ENGINE_FIXTURE_WORKSPACE_ID;
const objectTypeId = process.env.ENGINE_FIXTURE_OBJECT_TYPE_ID;
const label = process.env.ENGINE_FIXTURE_IDENTITY_NAME || "LACTEOS SUR";
if (process.argv.length !== 2 || !workspaceId || !objectTypeId) {
  console.error("Set ENGINE_FIXTURE_WORKSPACE_ID and ENGINE_FIXTURE_OBJECT_TYPE_ID; no arguments.");
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
  try {
    const { prisma } = require("../../lib/prisma.ts");
    const { planEntityIdentityReview } =
      require("../../lib/engine/entity-identity-review.ts");
    const type = await prisma.engine_object_types.findFirst({
      where: { id: objectTypeId, workspace_id: workspaceId, status: "active" },
      select: { id: true, key: true },
    });
    if (!type) throw new Error("Active object type unavailable.");
    const rows = await prisma.engine_records.findMany({
      where: { workspace_id: workspaceId, object_type_id: objectTypeId },
      select: { id: true, workspace_id: true, object_type_id: true,
        status: true, values_json: true },
      take: 501,
    });
    if (rows.length > 500) throw new Error("More than 500 records; narrow the scan.");
    const result = planEntityIdentityReview({
      candidate: { workspaceId, objectTypeId, values: { name: label } },
      records: rows.map((r) => ({
        id: r.id, workspaceId: r.workspace_id,
        objectTypeId: r.object_type_id,
        status: r.status, values: r.values_json,
      })),
    });
    console.log(JSON.stringify({
      ok: true, mode: "READ_ONLY", objectType: type.key,
      searchedLabel: label, scannedRecords: rows.length, ...result,
      note: "Suggestions only; no database writes or entity merges.",
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    try { await require("../../lib/prisma.ts").prisma.$disconnect(); } catch {}
    Module._resolveFilename = oldResolve;
    if (oldLoader) Module._extensions[".ts"] = oldLoader;
    else delete Module._extensions[".ts"];
  }
})();
