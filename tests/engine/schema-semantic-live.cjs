/**
 * Manual, opt-in, read-only live semantic review.
 * Calls OpenAI twice (schema discovery and semantic comparison); API costs apply.
 * Usage: node tests/engine/schema-semantic-live.cjs <workspaceId> <userId> <knowledgeFileId> [knowledgeFileId...]
 */
const path = require("node:path");
const Module = require("node:module");
const fs = require("node:fs");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");

const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const [workspaceId, userId, ...knowledgeFileIds] = process.argv.slice(2);
if (!workspaceId || !userId || knowledgeFileIds.length < 1 || knowledgeFileIds.length > 10 ||
    new Set(knowledgeFileIds).size !== knowledgeFileIds.length) {
  console.error("Usage: node tests/engine/schema-semantic-live.cjs <workspaceId> <userId> <fileId> [fileId...]");
  process.exitCode = 2;
} else {
  const originalResolve = Module._resolveFilename;
  const originalTsLoader = Module._extensions[".ts"];
  Module._resolveFilename = function (request, parent, ...rest) {
    if (request.startsWith("@/")) {
      const localPath = path.join(root, request.slice(2));
      if (fs.existsSync(localPath + ".ts")) return localPath + ".ts";
      if (fs.existsSync(localPath + ".js")) return localPath + ".js";
    }
    return originalResolve.call(this, request, parent, ...rest);
  };
  Module._extensions[".ts"] = (mod, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    const code = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    mod._compile(code, filename);
  };

  (async () => {
    try {
      const { discoverAndReviewSemanticEntities } = require("../../lib/engine/schema-discovery/semantic-ai.service.ts");
      console.log("Discovering architecture and comparing entity meanings (two OpenAI requests)...");
      const result = await discoverAndReviewSemanticEntities({ workspaceId, userId, knowledgeFileIds });
      console.log(JSON.stringify({
        status: result.status,
        discovery: {
          valid: result.discovery.valid,
          status: result.discovery.status,
          issues: result.discovery.issues,
          entityKeys: result.discovery.proposal?.entities.map((entity) => entity.key) ?? [],
          relationKeys: result.discovery.proposal?.relations.map((relation) => relation.key) ?? [],
          warnings: result.discovery.proposal?.warnings ?? [],
        },
        semantic: result.semantic,
      }, null, 2));
      if (!result.discovery.valid || !result.semantic?.valid) process.exitCode = 1;
    } catch (error) {
      console.error("Semantic live test failed:", error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      const { prisma } = require("../../lib/prisma.ts");
      await prisma.$disconnect();
      Module._resolveFilename = originalResolve;
      if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
      else delete Module._extensions[".ts"];
    }
  })();
}
