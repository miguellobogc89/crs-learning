/**
 * Explicitly authorized one-time creation of six approved test-workspace
 * definitions. Re-discovers source evidence, verifies exact approved shape,
 * reviews semantic ambiguity, then commits atomically through the Engine service.
 *
 * Usage: node tests/engine/schema-approved-create-live.cjs <workspaceId> <userId> <fileId> [fileId...]
 * This script WRITES Engine object types and field definitions to Neon.
 * It does not create relations or business records. Do not rerun after success.
 */
const path = require("node:path");
const Module = require("node:module");
const fs = require("node:fs");
const ts = require("typescript");
const assert = require("node:assert/strict");
const { loadEnvConfig } = require("@next/env");

const EXPECTED = {
  business: { name: "Business", fields: [["name", "text"], ["hours_text", "long_text"]] },
  price_list: { name: "Price List", fields: [["period", "text"]] },
  product: { name: "Product", fields: [["name", "text"]] },
  price_list_item: { name: "Price List Item", fields: [["price_amount", "decimal"], ["currency", "text"]] },
  supplier: { name: "Supplier", fields: [["name", "text"]] },
  supply_item: { name: "Supply Item", fields: [
    ["product_name", "text"], ["unit_price_amount", "decimal"],
    ["unit_price_currency", "text"], ["unit_for_price", "text"],
    ["minimum_order_quantity", "integer"], ["minimum_order_unit", "text"],
    ["delivery_days_text", "long_text"],
  ] },
};
const EXPECTED_RELATIONS = [
  "business_to_price_list", "price_list_to_price_list_item",
  "product_to_price_list_item", "supplier_to_supply_item", "business_to_supply_item",
].sort();
const EXPECTED_WORKSPACE = "9cb8b07f-7da2-4178-87bb-4e8e2f6d41d7";
const EXPECTED_FILES = [
  "1f496a26-2997-4345-ba75-32dfd167d575",
  "6c011fc4-4202-46eb-87f0-79db19d4d30a",
  "c741c1be-03a0-47e3-bb63-c9848886b0ae",
].sort();

const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const [workspaceId, userId, ...knowledgeFileIds] = process.argv.slice(2);
if (workspaceId !== EXPECTED_WORKSPACE || !userId ||
    JSON.stringify([...knowledgeFileIds].sort()) !== JSON.stringify(EXPECTED_FILES)) {
  console.error("Only the explicitly approved test workspace and three source documents are allowed.");
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
      const { persistApprovedDiscoveredDefinitions } =
        require("../../lib/engine/schema-discovery/persist-approved.service.ts");

      console.log("Verifying approved schema against source evidence and Neon...");
      const reviewed = await discoverAndReviewSemanticEntities({
        workspaceId, userId, knowledgeFileIds,
      });
      assert.equal(reviewed.discovery.valid, true, "Schema discovery invalid");
      assert.equal(reviewed.semantic?.valid, true, "Semantic review invalid");
      assert.ok(reviewed.discovery.proposal, "Missing validated proposal");
      const proposal = reviewed.discovery.proposal;
      assert.deepEqual(proposal.entities.map((e) => e.key).sort(),
        Object.keys(EXPECTED).sort(), "Discovered entities changed since approval");
      for (const entity of proposal.entities) {
        const expected = EXPECTED[entity.key];
        assert.equal(entity.name, expected.name, "Entity name changed: " + entity.key);
        assert.deepEqual(entity.fields.map((f) => [f.key, f.type]).sort((a, b) => a[0].localeCompare(b[0])),
          [...expected.fields].sort((a, b) => a[0].localeCompare(b[0])),
          "Entity fields changed: " + entity.key);
        assert.ok(entity.fields.every((f) => f.required === false),
          "A field has become required: " + entity.key);
      }
      assert.deepEqual(proposal.relations.map((r) => r.key).sort(), EXPECTED_RELATIONS,
        "Discovered relationships changed since approval");
      const existing = await prisma.engine_object_types.findMany({
        where: { workspace_id: workspaceId },
        select: { key: true },
      });
      const selectedEntityKeys = Object.keys(EXPECTED);
      const plan = planDiscoveredDefinitionApproval({
        proposal, semantic: reviewed.semantic, selectedEntityKeys,
        existingEntityKeys: existing.map((item) => item.key),
      });
      assert.equal(plan.status, "READY_FOR_APPROVAL",
        "The proposed schema now needs clarification");
      assert.equal(plan.entities.length, selectedEntityKeys.length,
        "Not all approved entities are eligible");
      const created = await persistApprovedDiscoveredDefinitions({
        workspaceId, userId, proposal,
        semanticCandidates: reviewed.semantic.candidates.map((item) => ({
          leftEntity: item.leftEntity, rightEntity: item.rightEntity,
          decision: item.decision, reason: item.reason,
        })),
        selectedEntityKeys,
      });
      assert.equal(created.count, 6, "Unexpected created definition count");
      console.log(JSON.stringify({
        ok: true, workspaceId, created: created.created,
        deferredRelations: created.deferredRelations,
        note: "Created approved object types and fields only. No business records or relations created.",
      }, null, 2));
    } catch (error) {
      console.error("Approved definition creation aborted:",
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
