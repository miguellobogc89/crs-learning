import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/ingestion/partition-import-plan.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { partitionImportPlan } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const base = { version: 1, workspaceId: "ws", writesPerformed: false,
  summary: { create: 0, reuse: 0, review: 0, link: 0 } };

test("seven valid records remain actionable when an eighth needs review", () => {
  const operations = Array.from({ length: 7 }, (_, i) => ({
    action: "create", localId: "recipe_" + i, entityKey: "recipe", values: { name: "Recipe " + i },
  }));
  operations.push({ action: "review", localId: "recipe_7", entityKey: "recipe", reason: "Conflicting identity" });
  const result = partitionImportPlan({ ...base, operations });
  assert.equal(result.ready.length, 7);
  assert.equal(result.pending.length, 1);
});

test("links to unresolved records are deferred without blocking other links", () => {
  const result = partitionImportPlan({ ...base, operations: [
    { action: "create", localId: "a", entityKey: "material", values: {} },
    { action: "reuse", localId: "b", entityKey: "material", recordId: "existing-id" },
    { action: "review", localId: "c", entityKey: "material", reason: "Ambiguous identity" },
    { action: "link", fromLocalId: "a", toLocalId: "b", relationKey: "composition" },
    { action: "link", fromLocalId: "a", toLocalId: "c", relationKey: "composition" },
  ] });
  assert.equal(result.ready.filter(op => op.action === "link").length, 1);
  assert.equal(result.deferredLinks.length, 1);
  assert.equal(result.pending.length, 1);
});
