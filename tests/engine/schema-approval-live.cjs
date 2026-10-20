/**
 * Read-only live approval preview for AI-discovered Engine definitions.
 * Calls OpenAI twice and reads existing workspace definitions from Neon.
 * Does NOT persist any definitions, records, or relations.
 *
 * Usage: node tests/engine/schema-approval-live.cjs <workspaceId> <userId> <fileId> [fileId...]
 */
const path = require("node:path");
const Module = require("node:module");
const fs = require("node:fs");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");

const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const [workspaceId, userId, ...knowledgeFileIds] = process.argv.slice(2);
if (!workspaceId || !userId || knowledgeFileIds.length < 1 ||
    knowledgeFileIds.length > 10 || new Set(knowledgeFileIds).size !== knowledgeFileIds.length) {
  console.error("Usage: node tests/engine/schema-approval-live.cjs <workspaceId> <userId> <fileId> [fileId...]");
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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    mod._compile(code, filename);
  };

  (async () => {
    try {
      const { prisma } = require("../../lib/prisma.ts");
      const { discoverAndReviewSemanticEntities } =
        require("../../lib/engine/schema-discovery/semantic-ai.service.ts");
      const { planDiscoveredDefinitionApproval } =
        require("../../lib/engine/schema-discovery/approval-plan.ts");

      const reviewed = await discoverAndReviewSemanticEntities({
        workspaceId, userId, knowledgeFileIds,
      });
      if (!reviewed.discovery.valid || !reviewed.discovery.proposal ||
          !reviewed.semantic?.valid) {
        console.log(JSON.stringify({
          ok: false, discoveryStatus: reviewed.discovery.status,
          discoveryIssues: reviewed.discovery.issues,
          semanticIssues: reviewed.semantic?.issues ?? [],
        }, null, 2));
        process.exitCode = 1;
        return;
      }
      const existing = await prisma.engine_object_types.findMany({
        where: { workspace_id: workspaceId },
        select: { key: true },
      });
      const plan = planDiscoveredDefinitionApproval({
        proposal: reviewed.discovery.proposal,
        semantic: reviewed.semantic,
        selectedEntityKeys: reviewed.discovery.proposal.entities.map((entity) => entity.key),
        existingEntityKeys: existing.map((item) => item.key),
      });
      console.log(JSON.stringify({
        ok: true,
        mode: "READ_ONLY",
        discoveryStatus: reviewed.status,
        approvalStatus: plan.status,
        discoveredEntities: reviewed.discovery.proposal.entities.map((entity) => ({
          key: entity.key, name: entity.name,
          fields: entity.fields.map((field) => ({ key: field.key, type: field.type })),
        })),
        eligibleForApproval: plan.entities.map((entity) => entity.key),
        deferred: plan.deferred,
        semanticComparisons: reviewed.semantic.candidates.map((item) => ({
          leftEntity: item.leftEntity, rightEntity: item.rightEntity,
          decision: item.decision, reason: item.reason,
        })),
        deferredRelations: plan.relationsForLaterReview.map((relation) => relation.key),
        existingKeys: existing.map((item) => item.key),
        warnings: reviewed.discovery.proposal.warnings,
        note: "No definitions, fields, relations or records were written.",
      }, null, 2));
    } catch (error) {
      console.error("Live approval preview failed:", error instanceof Error ? error.stack || error.message : String(error));
      process.exitCode = 1;
    } finally {
      try { await require("../../lib/prisma.ts").prisma.$disconnect(); } catch {}
      Module._resolveFilename = originalResolve;
      if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
      else delete Module._extensions[".ts"];
    }
  })();
}
