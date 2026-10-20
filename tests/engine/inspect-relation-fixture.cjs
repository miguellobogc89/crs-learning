/**
 * READ ONLY: inspect available concrete record-level relation opportunities.
 * No proposals are created and no relationships are inferred from co-occurrence.
 * Run: node tests/engine/inspect-relation-fixture.cjs
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
if (process.argv.length !== 2) {
  console.error("Read-only inspection takes no arguments.");
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
    const [definitions, records, proposals] = await Promise.all([
      prisma.engine_relation_definitions.findMany({
        where: { workspace_id: workspaceId, status: "active" },
        select: {
          id: true, key: true, cardinality: true,
          from_object_type_id: true, to_object_type_id: true,
          from_object_type: { select: { key: true } },
          to_object_type: { select: { key: true } },
        },
        orderBy: { key: "asc" }, take: 101,
      }),
      prisma.engine_records.findMany({
        where: { workspace_id: workspaceId, status: { not: "archived" } },
        select: { id: true, object_type_id: true, status: true, values_json: true },
        take: 501,
      }),
      prisma.engine_relation_proposals.count({
        where: { workspace_id: workspaceId },
      }),
    ]);
    if (definitions.length > 100 || records.length > 500) {
      throw new Error("Inspection limit exceeded; narrow the workspace scan.");
    }
    const opportunities = definitions.map((d) => {
      const from = records.filter((r) => r.object_type_id === d.from_object_type_id);
      const to = records.filter((r) => r.object_type_id === d.to_object_type_id);
      return {
        definitionId: d.id, relationKey: d.key,
        fromType: d.from_object_type.key, toType: d.to_object_type.key,
        cardinality: d.cardinality,
        fromRecords: from.map((r) => ({
          id: r.id, status: r.status,
          label: r.values_json?.name ?? r.values_json?.title ?? null,
        })),
        toRecords: to.map((r) => ({
          id: r.id, status: r.status,
          label: r.values_json?.name ?? r.values_json?.title ?? null,
        })),
        hasBothEndpoints: from.length > 0 && to.length > 0,
      };
    });
    console.log(JSON.stringify({
      ok: true, mode: "READ_ONLY", workspaceId,
      scannedRecords: records.length,
      existingProposalCount: proposals,
      opportunities,
      note: "Endpoint availability is NOT evidence of a relationship. No document evidence checked, no proposal or link created.",
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
