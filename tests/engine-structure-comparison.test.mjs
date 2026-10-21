import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../lib/engine/schema-discovery/compare-structures.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const output = {};
new Function("exports", "module", js)(output, { exports: output });
const compare = output.compareDiscoveredStructures;
const shape = (key, fields) => ({ key, name: key, description: "",
  fields: fields.map(([key, type]) => ({ key, name: key, type,
    required: false, evidence: [] })), evidence: [] });
const schema = (...entities) => ({ entities, relations: [], warnings: [] });
test("detects two compatible distinctive fields as a review candidate", () => {
  const result = compare(schema(shape("schedule", [["weekday", "text"], ["opens_at", "text"]])),
    [{ key: "hours", fields: [{ key: "weekday", type: "text" }, { key: "opens_at", type: "text" }] }]);
  assert.deepEqual(result.map(item => item.existingKey), ["hours"]);
  assert.equal(result[0].compatible, true);
});
test("generic fields alone never establish a structural candidate", () => {
  assert.deepEqual(compare(schema(shape("a", [["name", "text"], ["description", "text"]])),
    [{ key: "b", fields: [{ key: "name", type: "text" }, { key: "description", type: "text" }] }]), []);
});
test("incompatible field types are explicitly flagged", () => {
  const result = compare(schema(shape("a", [["weekday", "text"], ["opens_at", "text"]])),
    [{ key: "b", fields: [{ key: "weekday", type: "integer" }, { key: "opens_at", type: "text" }] }]);
  assert.equal(result[0].compatible, false);
});
test("one distinctive field is insufficient", () => {
  assert.deepEqual(compare(schema(shape("a", [["weekday", "text"], ["name", "text"]])),
    [{ key: "b", fields: [{ key: "weekday", type: "text" }, { key: "name", type: "text" }] }]), []);
});
test("same key is not a competing schema", () => {
  assert.deepEqual(compare(schema(shape("a", [["weekday", "text"], ["opens_at", "text"]])),
    [{ key: "a", fields: [{ key: "weekday", type: "text" }, { key: "opens_at", type: "text" }] }]), []);
});
