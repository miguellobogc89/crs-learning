const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const filename = path.resolve(__dirname, "../../lib/engine/schema-discovery/existing-semantic-review.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { validateExistingSchemaSemanticCandidates: validate } = mod.exports;
const base = {
  proposal: { entities: [{
    key: "product", name: "Product", description: "", evidence: [],
    fields: [{ key: "product_code", name: "Code", type: "text", required: false, evidence: [] }],
  }], relations: [], warnings: [] },
  current: { entities: [{
    key: "product", fields: [{ key: "sku", type: "text" }],
  }], relations: [] },
};
const suggestion = {
  sourceEntity: "product", sourceField: "product_code",
  targetEntity: "product", targetField: "sku",
  decision: "POSSIBLE_EQUIVALENCE", reason: "Both may be product identifiers",
};
test("accepts possible alias without merging", () => {
  const r = validate({ ...base, candidates: [suggestion] });
  assert.equal(r.valid, true);
  assert.equal(r.candidates[0].decision, "POSSIBLE_EQUIVALENCE");
});
test("rejects hallucinated target field", () => {
  const r = validate({ ...base, candidates: [{ ...suggestion, targetField: "missing" }] });
  assert.equal(r.valid, false);
  assert.equal(r.candidates.length, 0);
});
test("rejects mismatched field and entity comparisons", () => {
  const r = validate({ ...base, candidates: [{ ...suggestion, sourceField: null }] });
  assert.equal(r.valid, false);
});
test("rejects duplicate comparisons", () => {
  const r = validate({ ...base, candidates: [suggestion, suggestion] });
  assert.equal(r.valid, false);
});
test("permits no suggestions", () => {
  const r = validate({ ...base, candidates: [] });
  assert.equal(r.valid, true);
});
