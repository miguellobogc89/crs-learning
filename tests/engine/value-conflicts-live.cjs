/**
 * Manual read-only live test for evidence-backed value conflict detection.
 * Calls OpenAI once; may incur API costs.
 * Usage: node tests/engine/value-conflicts-live.cjs <workspaceId> <userId> <fileId> [fileId...]
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
  console.error("Usage: node tests/engine/value-conflicts-live.cjs <workspaceId> <userId> <fileId> [fileId...]");
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
      const { detectKnowledgeValueConflicts } = require("../../lib/engine/conflicts/detect-ai.service.ts");
      console.log("Detecting evidence-backed candidate conflicts (one OpenAI request)...");
      const result = await detectKnowledgeValueConflicts({ workspaceId, userId, knowledgeFileIds });
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exitCode = 1;
    } catch (error) {
      console.error("Live conflict detection failed:", error instanceof Error ? error.message : String(error));
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
