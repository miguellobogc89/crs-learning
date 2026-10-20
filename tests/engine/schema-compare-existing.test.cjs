const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const filename = path.resolve(__dirname, "../../lib/engine/schema-discovery/compare-existing.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { compareDiscoveredSchema } = mod.exports;
const e = [{ documentId: "doc", quote: "Codigo LEC-001" }];
const proposal = {
  entities: [{
    key: "product", name: "Producto", description: "",
    evidence: e,
    fields: [
      { key: "name", name: "Nombre", type: "text", required: false, evidence: e },
      { key: "product_code", name: "Código", type: "text", required: false, evidence: e },
    ],
  }],
  relations: [], warnings: [],
};
test("reuses existing field and suggests missing product code", () => {
  const r = compareDiscoveredSchema({
    proposal,
    current: { entities: [{ key: "product", fields: [{ key: "name", type: "text" }] }],
      relations: [] },
  });
  assert.deepEqual(r.reused, ["entities.product", "entities.product.fields.name"]);
  assert.deepEqual(r.suggested.map((s) => s.kind), ["NEW_FIELD"]);
  assert.equal(r.status, "REVIEW_REQUIRED");
});
test("does not duplicate identical schema", () => {
  const r = compareDiscoveredSchema({
    proposal,
    current: { entities: [{ key: "product", fields: [
      { key: "name", type: "text" }, { key: "product_code", type: "text" },
    ] }], relations: [] },
  });
  assert.equal(r.status, "NO_CHANGES");
  assert.equal(r.suggested.length, 0);
});
test("type mismatch blocks silent reuse", () => {
  const r = compareDiscoveredSchema({
    proposal,
    current: { entities: [{ key: "product", fields: [
      { key: "name", type: "text" }, { key: "product_code", type: "integer" },
    ] }], relations: [] },
  });
  assert.equal(r.suggested[0].kind, "REVIEW_FIELD_TYPE");
});
test("new invoice type remains a suggestion, not a write", () => {
  const r = compareDiscoveredSchema({
    proposal: { ...proposal, entities: [{
      ...proposal.entities[0], key: "invoice",
    }] },
    current: { entities: [], relations: [] },
  });
  assert.equal(r.suggested[0].kind, "NEW_ENTITY");
});
test("relation cardinality mismatch requires review", () => {
  const r = compareDiscoveredSchema({
    proposal: { entities: [], warnings: [], relations: [{
      key: "invoice_has_lines", fromEntity: "invoice",
      toEntity: "invoice_line", cardinality: "one_to_many",
      description: "", evidence: e,
    }] },
    current: { entities: [], relations: [{
      key: "invoice_has_lines", fromEntity: "invoice",
      toEntity: "invoice_line", cardinality: "many_to_many",
    }] },
  });
  assert.equal(r.suggested[0].kind, "REVIEW_RELATION");
});
