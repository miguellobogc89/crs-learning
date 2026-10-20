const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const filename = path.resolve(__dirname, "../../lib/engine/schema-discovery/field-extension-plan.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { planExistingFieldExtensions: plan } = mod.exports;
const field = { key: "product_code", name: "Código de producto", type: "text", required: false, evidence: [{ documentId: "doc", quote: "LEC-001" }] };
const base = {
  proposal: { entities: [{ key: "product", name: "Producto", description: "", fields: [field], evidence: [] }], relations: [], warnings: [] },
  current: { entities: [{ key: "product", fields: [{ key: "name", type: "text" }] }], relations: [] },
  approvedEntityKeys: ["product"],
  semanticCandidates: [],
};
test("plans optional new field on approved existing entity", () => {
  const result = plan(base);
  assert.equal(result.status, "READY_FOR_APPROVAL");
  assert.equal(result.additions[0].field.key, "product_code");
});
test("blocks possible SKU alias", () => {
  const result = plan({ ...base, semanticCandidates: [{
    sourceEntity: "product", sourceField: "product_code", targetEntity: "product",
    targetField: "name", decision: "POSSIBLE_EQUIVALENCE", reason: "Possible alias",
  }] });
  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.equal(result.additions.length, 0);
});
test("does not recreate existing field", () => {
  const result = plan({ ...base, current: { entities: [{
    key: "product", fields: [{ key: "product_code", type: "text" }],
  }], relations: [] } });
  assert.equal(result.additions.length, 0);
});
test("does not silently change existing field type", () => {
  const result = plan({ ...base, current: { entities: [{
    key: "product", fields: [{ key: "product_code", type: "integer" }],
  }], relations: [] } });
  assert.equal(result.deferred[0].reason, "TYPE_CONFLICT");
});
test("blocks required fields on existing records", () => {
  const result = plan({ ...base, proposal: { ...base.proposal, entities: [{
    ...base.proposal.entities[0], fields: [{ ...field, required: true }],
  }] } });
  assert.equal(result.deferred[0].reason, "NEW_FIELD_CANNOT_BE_REQUIRED_ON_EXISTING_RECORDS");
});
test("rejects unapproved or unknown entity ownership", () => {
  assert.throws(() => plan({ ...base, approvedEntityKeys: ["invoice"] }));
  assert.equal(plan({ ...base, approvedEntityKeys: [] }).additions.length, 0);
});
