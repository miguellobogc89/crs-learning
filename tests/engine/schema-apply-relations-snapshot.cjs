/**
 * Apply the five reviewed relation definitions from the same pinned snapshot.
 * No AI calls. Default is read-only; --apply explicitly writes to Neon.
 *
 * node tests/engine/schema-apply-relations-snapshot.cjs <snapshotPath> <sha256> [--apply]
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Module = require("node:module");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");
const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const [snapshotPath, expectedHash, action] = process.argv.slice(2);
const approvedHash = "1111e707565aad14a7c558f22b7f1831757397c69c9412bc4c6dbbf3117a15ea";
const approvedWorkspace = "9cb8b07f-7da2-4178-87bb-4e8e2f6d41d7";
const approvedUser = "ee893ecb-c740-4b93-a9d9-211e5c6f3f1c";
const approvedFiles = [
  "1f496a26-2997-4345-ba75-32dfd167d575",
  "6c011fc4-4202-46eb-87f0-79db19d4d30a",
  "c741c1be-03a0-47e3-bb63-c9848886b0ae",
].sort();
const approvedRelations = [
  "business_has_price_lists",
  "price_list_has_items",
  "business_has_supply_items",
  "supplier_supplies_supply_items",
  "product_in_supply_items",
].sort();
const approvedTypes = ["business", "price_list", "price_list_item", "supplier", "product", "supply_item"].sort();
let originalResolve;
let originalTsLoader;
(async () => {
  try {
    if (expectedHash !== approvedHash || (action !== undefined && action !== "--apply")) {
      throw new Error("Use the exact reviewed SHA-256; only --apply is supported.");
    }
    const resolved = path.resolve(root, snapshotPath || "");
    const directory = path.resolve(root, "tests/engine/.local");
    if (path.dirname(resolved) !== directory ||
        path.basename(resolved) !== "schema-approval-" + approvedHash.slice(0, 16) + ".json") {
      throw new Error("Unrecognized reviewed snapshot path.");
    }
    const raw = fs.readFileSync(resolved);
    const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
    if (sha256 !== approvedHash) throw new Error("Snapshot hash mismatch; no write.");
    const snapshot = JSON.parse(raw.toString("utf8"));
    if (snapshot.format !== "crs-schema-approval-snapshot-v1" ||
        snapshot.workspaceId !== approvedWorkspace ||
        snapshot.userId !== approvedUser ||
        JSON.stringify([...snapshot.knowledgeFileIds].sort()) !== JSON.stringify(approvedFiles) ||
        JSON.stringify(snapshot.proposal.entities.map((e) => e.key).sort()) !== JSON.stringify(approvedTypes) ||
        JSON.stringify(snapshot.proposal.relations.map((r) => r.key).sort()) !== JSON.stringify(approvedRelations)) {
      throw new Error("Snapshot is not the approved workspace, documents, entities and relations.");
    }
    originalResolve = Module._resolveFilename;
    originalTsLoader = Module._extensions[".ts"];
    Module._resolveFilename = function (request, parent, ...rest) {
      if (request.startsWith("@/")) {
        const localPath = path.join(root, request.slice(2));
        if (fs.existsSync(localPath + ".ts")) return localPath + ".ts";
        if (fs.existsSync(localPath + ".js")) return localPath + ".js";
      }
      return originalResolve.call(this, request, parent, ...rest);
    };
    Module._extensions[".ts"] = (mod, filename) => {
      const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText;
      mod._compile(output, filename);
    };
    const { prisma } = require("../../lib/prisma.ts");
    const { planRelationDefinitions } =
      require("../../lib/engine/schema-discovery/relation-definition-plan.ts");
    const { persistApprovedRelationDefinitions } =
      require("../../lib/engine/schema-discovery/persist-relations.service.ts");
    const types = await prisma.engine_object_types.findMany({
      where: { workspace_id: approvedWorkspace, status: "active" },
      select: { id: true, key: true },
    });
    const existing = await prisma.engine_relation_definitions.findMany({
      where: { workspace_id: approvedWorkspace },
      select: { key: true },
    });
    const plan = planRelationDefinitions({
      relations: snapshot.proposal.relations,
      existingTypeKeys: types.map((type) => type.key),
      existingRelationKeys: existing.map((relation) => relation.key),
    });
    if (!plan.valid || plan.ready.length !== 5) {
      throw new Error("Relations not eligible: " + JSON.stringify(plan.issues));
    }
    if (action !== "--apply") {
      console.log(JSON.stringify({
        ok: true, mode: "READ_ONLY", sha256,
        existingTypes: types.map((type) => type.key).sort(),
        proposedRelations: plan.ready.map((relation) => ({
          key: relation.key, from: relation.fromEntity,
          to: relation.toEntity, cardinality: relation.cardinality,
        })),
        note: "No writes. Re-run with --apply after reviewing this preview.",
      }, null, 2));
      return;
    }
    const result = await persistApprovedRelationDefinitions({
      workspaceId: approvedWorkspace, userId: approvedUser,
      proposal: snapshot.proposal,
      selectedRelationKeys: approvedRelations,
    });
    console.log(JSON.stringify({
      ok: true, mode: "APPLIED", sha256,
      ...result, note: "Relation definitions saved; no business record links created.",
    }, null, 2));
  } catch (error) {
    console.error("Relation approval failed:",
      error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    try { await require("../../lib/prisma.ts").prisma.$disconnect(); } catch {}
    if (originalResolve) Module._resolveFilename = originalResolve;
    if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
    else if (originalResolve) delete Module._extensions[".ts"];
  }
})();
