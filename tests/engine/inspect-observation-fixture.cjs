/**
 * Read-only inspection of the test workspace before selecting a real,
 * evidence-backed observation for reviewed draft persistence.
 * No AI calls or writes. Never prints private full document contents.
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
const fileIds = [
  "1f496a26-2997-4345-ba75-32dfd167d575",
  "6c011fc4-4202-46eb-87f0-79db19d4d30a",
  "c741c1be-03a0-47e3-bb63-c9848886b0ae",
];
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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, filename);
};
(async () => {
  try {
    const { prisma } = require("../../lib/prisma.ts");
    const { knowledgeSourceReadWhere } = require("../../lib/knowledge/access-control.ts");
    const [types, files, conflicts, drafts] = await Promise.all([
      prisma.engine_object_types.findMany({
        where: { workspace_id: workspaceId, status: "active" },
        select: {
          id: true, key: true, schema_version: true,
          engine_field_definitions: {
            where: { status: "active" },
            select: {
              key: true, field_type: true, is_required: true, is_unique: true,
            },
          },
        },
      }),
      prisma.knowledge_files.findMany({
        where: { id: { in: fileIds }, status: "ready",
          knowledge_sources: knowledgeSourceReadWhere(userId, workspaceId) },
        select: { id: true, extracted_text: true },
      }),
      prisma.engine_value_conflicts.findMany({
        where: { workspace_id: workspaceId, status: "pending_review" },
        select: { id: true, subject: true, attribute: true },
        take: 100,
      }),
      prisma.engine_records.count({ where: { workspace_id: workspaceId } }),
    ]);
    if (files.length !== fileIds.length) {
      throw new Error("Missing or inaccessible test documents.");
    }
    console.log(JSON.stringify({
      ok: true, mode: "READ_ONLY", workspaceId,
      types: types.map((t) => ({
        id: t.id, key: t.key, schemaVersion: t.schema_version,
        fields: t.engine_field_definitions,
      })),
      documents: files.map((f) => ({
        id: f.id, length: f.extracted_text.length,
        // Short literal excerpt for manual evidence selection.
        excerpt: f.extracted_text.slice(0, 450),
      })),
      pendingConflicts: conflicts,
      existingRecordCount: drafts,
      note: "No writes. Select a nonconflicting, fully supported observation for approval.",
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    try { await require("../../lib/prisma.ts").prisma.$disconnect(); } catch {}
    Module._resolveFilename = originalResolve;
    if (originalLoader) Module._extensions[".ts"] = originalLoader;
    else delete Module._extensions[".ts"];
  }
})();
