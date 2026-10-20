const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../../lib/engine/relation-review-plan.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  },
}).outputText, filename);
const { planEngineRelation } = mod.exports;
const base = {
  workspaceId: "ws",
  definition: { id: "d", workspaceId: "ws", fromObjectTypeId: "supplier",
    toObjectTypeId: "product", cardinality: "many_to_many", status: "active" },
  from: { id: "s", workspaceId: "ws", objectTypeId: "supplier", status: "draft" },
  to: { id: "p", workspaceId: "ws", objectTypeId: "product", status: "draft" },
  document: { id: "doc", workspaceId: "ws", extractedText: "Supplier S supplies product P." },
  existingRelations: [],
  proposal: { relationDefinitionId: "d", fromRecordId: "s", toRecordId: "p",
    documentId: "doc", evidenceText: "Supplier S supplies product P." },
};
const plan = (overrides = {}) => planEngineRelation({ ...base, ...overrides });
test("valid evidence produces review only, never an approved link", () => {
  assert.deepEqual(plan().issues, []);
  assert.equal(plan().status, "REVIEW_REQUIRED");
});
test("document must contain exact evidence", () => {
  assert.ok(plan({ proposal: { ...base.proposal, evidenceText: "invented" } })
    .issues.includes("EVIDENCE_NOT_IN_DOCUMENT"));
});
test("cross workspace rejected", () => {
  assert.ok(plan({ to: { ...base.to, workspaceId: "other" } })
    .issues.includes("WORKSPACE_MISMATCH"));
});
test("type mismatch rejected", () => {
  assert.ok(plan({ from: { ...base.from, objectTypeId: "business" } })
    .issues.includes("OBJECT_TYPE_MISMATCH"));
});
test("archived definition rejected", () => {
  assert.equal(plan({ definition: { ...base.definition, status: "archived" } }).status, "HELD");
});
test("mismatched proposal references rejected", () => {
  assert.ok(plan({ proposal: { ...base.proposal, toRecordId: "other" } })
    .issues.includes("PROPOSAL_REFERENCE_MISMATCH"));
});
test("duplicate relation rejected", () => {
  assert.ok(plan({ existingRelations: [{ relationDefinitionId: "d",
    fromRecordId: "s", toRecordId: "p" }] }).issues.includes("RELATION_ALREADY_EXISTS"));
});
test("one to one prevents second source or target", () => {
  const definition = { ...base.definition, cardinality: "one_to_one" };
  assert.ok(plan({ definition, existingRelations: [{ relationDefinitionId: "d",
    fromRecordId: "other", toRecordId: "p" }] }).issues.includes("CARDINALITY_CONFLICT"));
});
test("one to many prevents a target from having two sources", () => {
  const definition = { ...base.definition, cardinality: "one_to_many" };
  assert.ok(plan({ definition, existingRelations: [{ relationDefinitionId: "d",
    fromRecordId: "other", toRecordId: "p" }] }).issues.includes("CARDINALITY_CONFLICT"));
});
test("many to many allows distinct links", () => {
  assert.equal(plan({ existingRelations: [{ relationDefinitionId: "d",
    fromRecordId: "other", toRecordId: "p" }] }).status, "REVIEW_REQUIRED");
});
