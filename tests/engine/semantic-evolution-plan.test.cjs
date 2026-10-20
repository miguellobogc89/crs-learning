const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const filename = path.resolve(__dirname, "../../lib/engine/schema-discovery/semantic-evolution-plan.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { planSemanticSchemaEvolution: plan } = mod.exports;
const entity = key => ({ key, name: key, description: "", fields: [], evidence: [] });
const base = {
  proposal: { entities: [entity("supplier_product_offer"), entity("product")], relations: [], warnings: [] },
  current: { entities: [{ key: "supply_item", fields: [] }, { key: "product", fields: [] }], relations: [] },
  suggested: [{ kind: "NEW_ENTITY", path: "entities.supplier_product_offer", reason: "New key", evidence: [] }],
  candidates: [{
    sourceEntity: "supplier_product_offer", sourceField: null,
    targetEntity: "supply_item", targetField: null,
    decision: "POSSIBLE_EQUIVALENCE", reason: "Overlapping supply terms",
  }],
};
test("suggests existing supply_item instead of silently creating offer", () => {
  const result = plan(base);
  assert.equal(result[0].kind, "POSSIBLE_ENTITY_ALIAS");
  assert.equal(result[0].target, "supply_item");
  assert.equal(result[0].requiresApproval, true);
});
test("reuses exact key only as pending business review", () => {
  const result = plan(base);
  assert.equal(result[1].kind, "REUSE_EXACT_KEY");
  assert.equal(result[1].requiresApproval, true);
});
test("no AI match does not prove entity is new", () => {
  const result = plan({ ...base, candidates: [] });
  assert.equal(result[0].kind, "NEW_ENTITY_REVIEW");
  assert.equal(result[0].requiresApproval, true);
});
test("distinct comparison is not treated as alias", () => {
  const result = plan({ ...base, candidates: base.candidates.map(c => ({ ...c, decision: "DISTINCT" })) });
  assert.equal(result[0].kind, "NEW_ENTITY_REVIEW");
});
test("relationship proposals still require review", () => {
  const result = plan({ ...base, suggested: [...base.suggested, {
    kind: "NEW_RELATION", path: "relations.supplier_to_offer",
    reason: "Needs endpoint check", evidence: [],
  }] });
  assert.equal(result.at(-1).kind, "NEW_RELATION_REVIEW");
  assert.equal(result.at(-1).requiresApproval, true);
});
