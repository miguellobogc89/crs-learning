import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/conflicts/import-plan.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports });
const { planConflictAwareImport } = module.exports;
const fact = (documentId, evidenceText) => ({
  documentId, evidenceText, objectTypeId: "product", fieldKey: "price",
  values: { price: 2.5 },
});
const conflict = () => ({
  subject: "Product A", attribute: "price", context: "current tariff",
  status: "PENDING_REVIEW", scope: "AFFECTED_VALUE_ONLY",
  alternatives: [
    { value: "2,50", evidence: [{ documentId: "doc1", quote: "Price 2,50 EUR" }] },
    { value: "2,80", evidence: [{ documentId: "doc2", quote: "Price 2,80 EUR" }] },
  ],
});

test("unrelated facts remain eligible for review", () => {
  const result = planConflictAwareImport({
    accepted: [fact("doc1", "Chocolate 3,00 EUR"), fact("doc1", "Price 2,50 EUR")],
    conflicts: [conflict()],
  });
  assert.equal(result.ready.length, 1);
  assert.equal(result.pending.length, 1);
  assert.equal(result.status, "PARTIAL_REVIEW_REQUIRED");
  assert.equal(result.pending[0].conflictIndexes[0], 0);
});

test("same text in another document does not falsely overlap", () => {
  const result = planConflictAwareImport({
    accepted: [fact("doc3", "Price 2,50 EUR")], conflicts: [conflict()],
  });
  assert.equal(result.ready.length, 1);
  assert.equal(result.pending.length, 0);
});

test("smaller evidence excerpts overlapping a conflict are held", () => {
  const result = planConflictAwareImport({
    accepted: [fact("doc1", "2,50")], conflicts: [conflict()],
  });
  assert.equal(result.pending.length, 1);
  assert.equal(result.status, "CONFLICT_REVIEW_REQUIRED");
});

test("all independent candidates continue despite pending conflicts", () => {
  const result = planConflictAwareImport({
    accepted: [fact("doc3", "Supplier: Example")], conflicts: [conflict()],
  });
  assert.equal(result.ready.length, 1);
  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.conflicts.length, 1);
});

test("no conflicts keeps accepted candidates ready for review", () => {
  const result = planConflictAwareImport({
    accepted: [fact("doc1", "Price 2,50 EUR")], conflicts: [],
  });
  assert.equal(result.ready.length, 1);
  assert.equal(result.pending.length, 0);
  assert.equal(result.status, "READY_FOR_REVIEW");
});

test("does not mutate input candidate or conflict arrays", () => {
  const accepted = [fact("doc1", "Price 2,50 EUR")];
  const conflicts = [conflict()];
  const result = planConflictAwareImport({ accepted, conflicts });
  assert.equal(accepted.length, 1);
  assert.equal(conflicts.length, 1);
  assert.equal(result.pending[0].candidate, accepted[0]);
});
