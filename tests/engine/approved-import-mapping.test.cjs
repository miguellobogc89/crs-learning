const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const filename = path.resolve(__dirname, "../../lib/engine/schema-discovery/approved-import-mapping.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { planApprovedImportMapping: plan } = mod.exports;
const field = (key, type = "text") => ({ key, name: key, type, required: false, evidence: [] });
const input = {
  proposal: { entities: [{ key: "product_supply_offer", name: "Offer", description: "",
    fields: [field("price_per_unit", "decimal"), field("price_unit")], evidence: [] }],
    relations: [], warnings: [] },
  current: { entities: [{ key: "supply_item", fields: [
    { key: "unit_price", type: "decimal" }, { key: "unit", type: "text" },
  ] }], relations: [] },
  semanticCandidates: [],
  approvedEntities: [{ sourceEntity: "product_supply_offer", targetEntity: "supply_item" }],
  approvedFields: [
    { sourceEntity: "product_supply_offer", sourceField: "price_per_unit", targetEntity: "supply_item", targetField: "unit_price" },
    { sourceEntity: "product_supply_offer", sourceField: "price_unit", targetEntity: "supply_item", targetField: "unit" },
  ],
};
test("explicit approval maps supply offer price and its unit", () => {
  const result = plan(input);
  assert.equal(result.status, "READY");
  assert.deepEqual(result.issues, []);
  assert.equal(result.fields.length, 2);
});
test("missing approval blocks mapping", () => {
  const result = plan({ ...input, approvedFields: input.approvedFields.slice(0, 1) });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("UNAPPROVED_FIELD:product_supply_offer.price_unit"));
});
test("type mismatch blocks mapping", () => {
  const result = plan({ ...input, current: { ...input.current, entities: [{
    key: "supply_item", fields: [{ key: "unit_price", type: "text" }, { key: "unit", type: "text" }],
  }] } });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.some(i => i.startsWith("TYPE_MISMATCH:")));
});
test("uncertain semantic pair blocks mapping", () => {
  const result = plan({ ...input, semanticCandidates: [{
    sourceEntity: "product_supply_offer", sourceField: "price_per_unit",
    targetEntity: "supply_item", targetField: "unit_price",
    decision: "UNCERTAIN", reason: "Price context unknown",
  }] });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.some(i => i.startsWith("SEMANTIC_CONFLICT:")));
});
test("unknown target entity blocks mapping", () => {
  const result = plan({ ...input, approvedEntities: [{ sourceEntity: "product_supply_offer", targetEntity: "unknown" }] });
  assert.equal(result.status, "BLOCKED");
});
test("duplicate source approvals block mapping", () => {
  const result = plan({ ...input, approvedFields: [...input.approvedFields, input.approvedFields[0]] });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.some(i => i.startsWith("DUPLICATE_FIELD_APPROVAL:")));
});
test("two fields cannot overwrite the same target", () => {
  const result = plan({
    ...input,
    proposal: { ...input.proposal, entities: [{ ...input.proposal.entities[0],
      fields: [field("price_unit"), field("other_unit")] }] },
    approvedFields: [
      { sourceEntity: "product_supply_offer", sourceField: "price_unit", targetEntity: "supply_item", targetField: "unit" },
      { sourceEntity: "product_supply_offer", sourceField: "other_unit", targetEntity: "supply_item", targetField: "unit" },
    ],
  });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("TARGET_FIELD_COLLISION:supply_item.unit"));
});
