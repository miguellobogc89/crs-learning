/**
 * Opt-in live integration test for conflict-aware Knowledge import preparation.
 * Makes OpenAI requests (conflict detection and, if supported Engine types exist,
 * structured extraction); may incur API costs. Persists only validated conflicts,
 * never Engine records.
 *
 * Usage: node tests/engine/value-conflicts-import-live.cjs <workspaceId> <userId> <fileId> [fileId...]
 */
const path = require("node:path");
const Module = require("node:module");
const fs = require("node:fs");
const ts = require("typescript");
const assert = require("node:assert/strict");
const { loadEnvConfig } = require("@next/env");

const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const [workspaceId, userId, ...knowledgeFileIds] = process.argv.slice(2);
if (!workspaceId || !userId || knowledgeFileIds.length < 1 ||
    knowledgeFileIds.length > 10 || new Set(knowledgeFileIds).size !== knowledgeFileIds.length) {
  console.error("Usage: node tests/engine/value-conflicts-import-live.cjs <workspaceId> <userId> <fileId> [fileId...]");
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
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
      },
    }).outputText;
    mod._compile(code, filename);
  };

  (async () => {
    try {
      const { prepareConflictAwareKnowledgeImport } =
        require("../../lib/engine/conflicts/prepare-import.service.ts");
      const { listPendingValueConflicts } =
        require("../../lib/engine/conflicts/persistence.service.ts");
      const before = await listPendingValueConflicts({ workspaceId, userId, take: 100 });
      assert.ok(before.length < 100, "Pending conflict list exceeds safe limit");
      console.log("Preparing conflict-aware Knowledge import (OpenAI calls may incur costs)...");
      const result = await prepareConflictAwareKnowledgeImport({
        workspaceId, userId, knowledgeFileIds,
      });
      const after = await listPendingValueConflicts({ workspaceId, userId, take: 100 });
      assert.notEqual(result.status, "INVALID_CONFLICT_REVIEW", "AI conflict proposal invalid");
      assert.ok(after.length >= before.length, "Previously pending conflicts disappeared");
      assert.ok(result.conflicts.length >= before.length,
        "Existing pending conflicts were omitted from import plan");
      assert.ok(result.ready.length + result.pending.length <= result.proposedCount,
        "Import plan contains more candidates than extraction proposed");
      console.log(JSON.stringify({
        ok: true,
        status: result.status,
        previousPendingConflicts: before.length,
        currentPendingConflicts: after.length,
        protectedConflictsInPlan: result.conflicts.length,
        persistedConflictCount: result.persistedConflictCount,
        proposedCount: result.proposedCount,
        readyForReviewCount: result.ready.length,
        heldForConflictReviewCount: result.pending.length,
        extractionIssues: result.extractionIssues,
        conflictIssues: result.conflictIssues,
        note: "No Engine records were created or published.",
      }, null, 2));
    } catch (error) {
      console.error("Live import preparation failed:",
        error instanceof Error ? error.stack || error.message : String(error));
      process.exitCode = 1;
    } finally {
      try { await require("../../lib/prisma.ts").prisma.$disconnect(); } catch {}
      Module._resolveFilename = originalResolve;
      if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
      else delete Module._extensions[".ts"];
    }
  })();
}
