const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../../lib/engine/entity-identity-review.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  },
}).outputText, filename);
const { planEntityIdentityReview } = mod.exports;
const candidate = { workspaceId: "ws", objectTypeId: "supplier",
  values: { name: "Lacteos Sur" } };
const record = (id, values = { name: "Lacteos Sur" }, changes = {}) => ({
  id, workspaceId: "ws", objectTypeId: "supplier",
  status: "draft", values, ...changes,
});
const review = (records, changed = {}) =>
  planEntityIdentityReview({ candidate: { ...candidate, ...changed }, records });
test("exact normalized label suggests review, not merge", () => {
  const result = review([record("a", { name: "  LACTEOS   SUR " })]);
  assert.equal(result.status, "POSSIBLE_MATCH_REVIEW_REQUIRED");
  assert.deepEqual(result.suggestions, [
    { recordId: "a", reason: "EXACT_NORMALIZED_LABEL" },
  ]);
});
test("different labels are not assumed equal", () => {
  assert.equal(review([record("a", { name: "Lacteos Norte" })]).status, "NO_MATCH");
});
test("cross-workspace records cannot match", () => {
  assert.equal(review([record("a", undefined, { workspaceId: "other" })]).status, "NO_MATCH");
});
test("different types cannot match", () => {
  assert.equal(review([record("a", undefined, { objectTypeId: "product" })]).status, "NO_MATCH");
});
test("archived records cannot match", () => {
  assert.equal(review([record("a", undefined, { status: "archived" })]).status, "NO_MATCH");
});
test("ambiguous multiple matches remain separate suggestions", () => {
  assert.equal(review([record("a"), record("b")]).suggestions.length, 2);
});
test("missing label never generates identity suggestions", () => {
  assert.equal(review([record("a")], { values: { unit_price: 2.5 } }).status, "NO_MATCH");
});
test("malformed and duplicated records fail closed", () => {
  assert.throws(() => review([record("a"), record("a")]));
  assert.throws(() => review([record("a", null)]));
});
