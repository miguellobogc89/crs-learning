import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../lib/engine/schema-discovery/decide-schema-creation.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const output = {};
new Function("exports", "module", js)(output, { exports: output });
const decide = output.decideSchemaCreation;
const match = (proposedKey, existingKey, compatible = true) => ({
  proposedKey, existingKey, compatible, sharedDistinctiveFields: ["weekday", "opens_at"],
});
test("reuses an exact existing schema without competing with other candidates", () => {
  assert.deepEqual(decide("hours", ["hours"], [match("hours", "schedule")]),
    { action: "reuse", candidates: [] });
});
test("blocks creation when a compatible structural duplicate exists", () => {
  assert.deepEqual(decide("schedule", ["hours"], [match("schedule", "hours")]),
    { action: "review", candidates: ["hours"] });
});
test("holds multiple possible structural matches for review", () => {
  assert.deepEqual(decide("schedule", ["hours", "shifts"],
    [match("schedule", "shifts"), match("schedule", "hours")]),
    { action: "review", candidates: ["hours", "shifts"] });
});
test("does not block unrelated entity creation", () => {
  assert.deepEqual(decide("products", ["hours"], [match("schedule", "hours")]),
    { action: "create", candidates: [] });
});
test("incompatible candidates are not automatically merged", () => {
  assert.deepEqual(decide("schedule", ["hours"], [match("schedule", "hours", false)]),
    { action: "create", candidates: [] });
});
