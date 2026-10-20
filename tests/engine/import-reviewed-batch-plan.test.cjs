const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
const oldResolve = Module._resolveFilename;
const oldLoader = Module._extensions[".ts"];
Module._resolveFilename = function(request, parent, ...rest) {
  if (request.startsWith("@/")) {
    const local = path.join(root, request.slice(2));
    if (fs.existsSync(local + ".ts")) return local + ".ts";
  }
  return oldResolve.call(this, request, parent, ...rest);
};
Module._extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, filename);
};
const { planReviewedKnowledgeBatch } = require("../../lib/engine/import-reviewed-batch-plan.ts");
const c = (documentId, values = { name: "Lacteos Sur" }, evidenceText = "Proveedor: Lacteos Sur") => ({
  documentId, objectTypeId: "supplier", fieldKey: "name", evidenceText, values,
});
const plan = (candidates, conflicts = [], workspaceId = "ws1") =>
  planReviewedKnowledgeBatch({ workspaceId, candidates, conflicts });
const conflict = (documentId, quote) => ({
  subject: "Supplier", attribute: "name", context: "test",
  alternatives: [
    { value: "A", evidence: [{ documentId, quote }] },
    { value: "B", evidence: [{ documentId: "another", quote: "different" }] },
  ],
});
test("single evidence-backed candidate is eligible, never automatically approved", () => {
  const result = plan([c("doc1")]);
  assert.equal(result.status, "READY_FOR_EXPLICIT_APPROVAL");
  assert.equal(result.eligible.length, 1);
  assert.match(result.eligible[0].observationKey, /^obs_[a-f0-9]{64}$/);
});
test("repeated exact observation is only eligible once", () => {
  const result = plan([c("doc1"), c("doc1")]);
  assert.equal(result.eligible.length, 1);
  assert.equal(result.repeatedObservations.length, 1);
  assert.equal(result.status, "REVIEW_REQUIRED");
});
test("same values across distinct documents require entity identity review", () => {
  const result = plan([c("doc1"), c("doc2")]);
  assert.equal(result.eligible.length, 0);
  assert.equal(result.heldForIdentity.length, 1);
  assert.equal(result.heldForIdentity[0].candidates.length, 2);
});
test("different values are not silently merged", () => {
  const result = plan([c("doc1"), c("doc2", { name: "Otro" }, "Proveedor: Otro")]);
  assert.equal(result.eligible.length, 2);
});
test("conflicted candidate is held but unrelated one stays eligible", () => {
  const result = plan([
    c("doc1"), c("doc2", { name: "Otro" }, "Proveedor: Otro"),
  ], [conflict("doc1", "Proveedor: Lacteos Sur")]);
  assert.equal(result.heldForConflict.length, 1);
  assert.equal(result.eligible.length, 1);
  assert.equal(result.eligible[0].candidate.documentId, "doc2");
});
test("conflict isolation precedes identity grouping", () => {
  const result = plan([c("doc1"), c("doc2")],
    [conflict("doc1", "Proveedor: Lacteos Sur")]);
  assert.equal(result.heldForConflict.length, 1);
  assert.equal(result.heldForIdentity.length, 0);
  assert.equal(result.eligible.length, 1);
});
test("workspace changes observation keys", () => {
  assert.notEqual(plan([c("doc1")], [], "ws1").eligible[0].observationKey,
    plan([c("doc1")], [], "ws2").eligible[0].observationKey);
});
test("invalid input fails closed", () => {
  assert.throws(() => plan([c("doc1")], [], ""));
  assert.throws(() => plan(Array.from({ length: 501 }, (_, i) => c("d" + i))));
  assert.throws(() => plan([c("doc1", { name: undefined })]));
});
process.on("exit", () => {
  Module._resolveFilename = oldResolve;
  if (oldLoader) Module._extensions[".ts"] = oldLoader;
  else delete Module._extensions[".ts"];
});
