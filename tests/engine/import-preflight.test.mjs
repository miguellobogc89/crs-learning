import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/ingestion/import-preflight.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { planImportPreflight } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const base = { documentId: "recipe-pdf", truncated: false, schemaValid: true };
test("complete and valid documents can proceed autonomously", () => {
  const plan = planImportPreflight(base);
  assert.equal(plan.decision, "APPLY");
  assert.equal(plan.safeToWrite, true);
  assert.deepEqual(plan.conflicts, []);
});
test("truncated documents never authorize partial persistence", () => {
  const plan = planImportPreflight({ ...base, truncated: true });
  assert.equal(plan.safeToWrite, false);
  assert.equal(plan.decision, "PENDING_REVIEW");
  assert.equal(plan.conflicts[0].code, "INCOMPLETE_DOCUMENT");
});
test("invalid schemas block writes with an actionable conflict", () => {
  const plan = planImportPreflight({ ...base, schemaValid: false, schemaIssues: ["unknown entity"] });
  assert.equal(plan.safeToWrite, false);
  assert.match(plan.conflicts[0].reason, /unknown entity/);
});
test("invalid record graphs block writes", () => {
  const plan = planImportPreflight({ ...base, auditErrors: ["missing endpoint"] });
  assert.equal(plan.safeToWrite, false);
  assert.equal(plan.conflicts[0].code, "INVALID_RECORD_GRAPH");
});
test("multiple independent conflicts are retained for review", () => {
  const plan = planImportPreflight({ ...base, truncated: true, schemaValid: false, auditErrors: ["bad link"] });
  assert.deepEqual(plan.conflicts.map(c => c.code), [
    "INCOMPLETE_DOCUMENT", "INVALID_SCHEMA", "INVALID_RECORD_GRAPH",
  ]);
});
