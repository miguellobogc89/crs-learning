const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const filename = path.resolve(__dirname, "../../lib/engine/import-record-identity.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { planRecordIdentityReview } = mod.exports;
const make = (values, extra = {}) => ({
  objectTypeId: "product-type", documentId: "doc-1", fieldKey: "name",
  evidenceText: "Vanilla", values, ...extra,
});
test("single candidate stays eligible for review", () => {
  const result = planRecordIdentityReview([make({ name: "Vanilla" })]);
  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.unique.length, 1);
});
test("same type and values across documents require identity review", () => {
  const result = planRecordIdentityReview([
    make({ name: "Vanilla" }),
    make({ name: "Vanilla" }, { documentId: "doc-2" }),
  ]);
  assert.equal(result.status, "NEEDS_IDENTITY_REVIEW");
  assert.equal(result.unique.length, 0);
  assert.equal(result.possibleDuplicates[0].candidates.length, 2);
});
test("key order does not change fingerprint", () => {
  const result = planRecordIdentityReview([
    make({ name: "Vanilla", price: 2.5 }),
    make({ price: 2.5, name: "Vanilla" }, { documentId: "doc-2" }),
  ]);
  assert.equal(result.possibleDuplicates.length, 1);
});
test("different object types are never grouped", () => {
  const result = planRecordIdentityReview([
    make({ name: "Vanilla" }),
    make({ name: "Vanilla" }, { objectTypeId: "supplier-type" }),
  ]);
  assert.equal(result.unique.length, 2);
});
test("different values are not silently merged", () => {
  const result = planRecordIdentityReview([
    make({ name: "Vanilla", price: 2.5 }),
    make({ name: "Vanilla", price: 2.8 }, { documentId: "doc-2" }),
  ]);
  assert.equal(result.unique.length, 2);
});
test("repeated mentions in one document are flagged", () => {
  const result = planRecordIdentityReview([
    make({ name: "Vanilla" }),
    make({ name: "Vanilla" }, { evidenceText: "Vanilla price list" }),
  ]);
  assert.equal(result.possibleDuplicates.length, 1);
});
test("invalid candidate and oversized batch fail closed", () => {
  assert.throws(() => planRecordIdentityReview([{}]));
  assert.throws(() => planRecordIdentityReview(Array.from({ length: 501 }, () => make({ name: "X" }))));
});
