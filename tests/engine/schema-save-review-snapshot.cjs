/**
 * Create a local, immutable-by-hash snapshot of ONE validated schema discovery.
 * Read-only: no Engine definitions or records are persisted.
 * OpenAI is called during discovery and semantic review.
 *
 * node tests/engine/schema-save-review-snapshot.cjs <workspaceId> <userId> <fileId> [fileId...]
 */
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const crypto = require("node:crypto");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");

const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const [workspaceId, userId, ...knowledgeFileIds] = process.argv.slice(2);
if (!workspaceId || !userId || knowledgeFileIds.length < 1 ||
    knowledgeFileIds.length > 10 ||
    new Set(knowledgeFileIds).size !== knowledgeFileIds.length) {
  console.error("Usage: node tests/engine/schema-save-review-snapshot.cjs <workspaceId> <userId> <fileId> [fileId...]");
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
      const { prisma } = require("../../lib/prisma.ts");
      const { discoverAndReviewSemanticEntities } =
        require("../../lib/engine/schema-discovery/semantic-ai.service.ts");
      const { planDiscoveredDefinitionApproval } =
        require("../../lib/engine/schema-discovery/approval-plan.ts");
      const reviewed = await discoverAndReviewSemanticEntities({
        workspaceId, userId, knowledgeFileIds,
      });
      if (!reviewed.discovery.valid || !reviewed.discovery.proposal || !reviewed.semantic?.valid) {
        throw new Error("Invalid discovery/review: " + JSON.stringify({
          discoveryIssues: reviewed.discovery.issues,
          semanticIssues: reviewed.semantic?.issues,
        }));
      }
      const existing = await prisma.engine_object_types.findMany({
        where: { workspace_id: workspaceId }, select: { key: true },
      });
      const selectedEntityKeys = reviewed.discovery.proposal.entities.map((entity) => entity.key);
      const plan = planDiscoveredDefinitionApproval({
        proposal: reviewed.discovery.proposal,
        semantic: reviewed.semantic,
        selectedEntityKeys,
        existingEntityKeys: existing.map((entity) => entity.key),
      });
      const snapshot = {
        format: "crs-schema-approval-snapshot-v1",
        workspaceId, userId, knowledgeFileIds,
        proposal: reviewed.discovery.proposal,
        semanticCandidates: reviewed.semantic.candidates.map((item) => ({
          leftEntity: item.leftEntity, rightEntity: item.rightEntity,
          decision: item.decision, reason: item.reason,
        })),
        selectedEntityKeys,
      };
      const serialized = JSON.stringify(snapshot, null, 2) + "\n";
      const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
      const directory = path.join(root, "tests", "engine", ".local");
      fs.mkdirSync(directory, { recursive: true });
      const file = path.join(directory, "schema-approval-" + sha256.slice(0, 16) + ".json");
      fs.writeFileSync(file, serialized, { flag: "wx" });
      console.log(JSON.stringify({
        ok: true, mode: "READ_ONLY",
        snapshotPath: path.relative(root, file), sha256,
        approvalStatus: plan.status,
        eligibleForApproval: plan.entities.map((entity) => ({
          key: entity.key, name: entity.name,
          fields: entity.fields.map((field) => ({
            key: field.key, name: field.name, type: field.type, required: field.required,
          })),
        })),
        deferred: plan.deferred,
        semanticComparisons: reviewed.semantic.candidates.map((item) => ({
          leftEntity: item.leftEntity, rightEntity: item.rightEntity,
          decision: item.decision, reason: item.reason,
        })),
        deferredRelations: plan.relationsForLaterReview.map((relation) => relation.key),
        warnings: reviewed.discovery.proposal.warnings,
        note: "Saved one evidence-backed discovery and semantic review. No Neon writes.",
      }, null, 2));
    } catch (error) {
      console.error("Snapshot creation failed:",
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
