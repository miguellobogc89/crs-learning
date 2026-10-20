const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../../lib/engine/import-observation-identity.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { extractionObservationKey } = mod.exports;
const candidate = (overrides = {}) => ({
  documentId: "doc-1", objectTypeId: "product-type", fieldKey: "name",
  evidenceText: "Vanilla 2.50", values: { name: "Vanilla", price: 2.5 },
  ...overrides,
});
const key = (c, workspaceId = "workspace-1") =>
  extractionObservationKey({ workspaceId, candidate: c });
test("same observation yields same key", () => {
  assert.equal(key(candidate()), key(candidate()));
  assert.match(key(candidate()), /^obs_[a-f0-9]{64}$/);
});
test("object value key order does not change observation identity", () => {
  assert.equal(key(candidate()), key(candidate({ values: { price: 2.5, name: "Vanilla" } })));
});
test("workspace changes observation identity", () => {
  assert.notEqual(key(candidate()), key(candidate(), "workspace-2"));
});
test("document changes observation identity", () => {
  assert.notEqual(key(candidate()), key(candidate({ documentId: "doc-2" })));
});
test("evidence changes observation identity", () => {
  assert.notEqual(key(candidate()), key(candidate({ evidenceText: "Vanilla 2.50 EUR" })));
});
test("value changes observation identity", () => {
  assert.notEqual(key(candidate()), key(candidate({ values: { name: "Vanilla", price: 2.8 } })));
});
test("object type and field key change observation identity", () => {
  assert.notEqual(key(candidate()), key(candidate({ objectTypeId: "supplier-type" })));
  assert.notEqual(key(candidate()), key(candidate({ fieldKey: "price" })));
});
test("missing evidence and invalid values fail closed", () => {
  assert.throws(() => key(candidate({ evidenceText: "" })));
  assert.throws(() => key(candidate({ values: { price: Number.NaN } })));
  assert.throws(() => key(candidate(), ""));
});
