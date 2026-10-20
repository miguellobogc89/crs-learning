import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies = {}) {
  const source = readFileSync(new URL("../../lib/engine/" + path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require: (name) => {
      if (!(name in dependencies)) throw new Error("Unknown dependency " + name);
      return dependencies[name];
    },
  });
  return module.exports;
}
const validation = load("validation.ts");
const preflight = load("import-preflight.ts");
const { validateTypedEngineImport: validate } = load("import-typed-validation.ts", {
  "./validation": validation, "./import-preflight": preflight,
});
const document = { id: "file", workspaceId: "w1", extractedText: "Vainilla cuesta 2,80 EUR" };
const candidate = {
  objectTypeId: "product", documentId: "file", fieldKey: "price",
  evidenceText: "Vainilla cuesta 2,80 EUR",
  values: { name: "Vainilla", price: "2.80" },
};
const field = (key, field_type, is_required = false) => ({
  key, field_type, is_required, status: "active", configuration: {},
});
const definition = {
  id: "product", workspaceId: "w1", status: "active",
  fields: [field("name", "text", true), field("price", "decimal", true)],
};
const run = (candidates = [candidate], definitions = [definition], documents = [document]) =>
  validate({ workspaceId: "w1", candidates, definitions, documents });

test("accepts a grounded, typed candidate", () => {
  const result = run();
  assert.equal(result.accepted.length, 1);
  assert.equal(result.issues.length, 0);
});
test("rejects object definitions from another workspace", () => {
  const result = run([candidate], [{ ...definition, workspaceId: "w2" }]);
  assert.equal(result.issues[0].code, "OBJECT_TYPE_NOT_FOUND");
});
test("rejects inactive object definitions", () => {
  const result = run([candidate], [{ ...definition, status: "archived" }]);
  assert.equal(result.issues[0].code, "OBJECT_TYPE_INACTIVE");
});
test("rejects wrong value type and missing required field", () => {
  const result = run([{ ...candidate, values: { price: "not a number" } }]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.issues.filter((issue) => issue.code === "INVALID_VALUES").length, 2);
});
test("rejects evidence for an undefined field", () => {
  const result = run([{ ...candidate, fieldKey: "cost", values: { ...candidate.values, cost: "2.80" } }]);
  assert.equal(result.issues[0].code, "INVALID_FIELD");
});
test("rejects unsupported unique or reference fields", () => {
  const result = run([candidate], [{ ...definition, fields: [
    ...definition.fields, { ...field("supplier", "record_reference"), is_unique: false },
  ] }]);
  assert.equal(result.issues[0].code, "UNSUPPORTED_FIELD");
});
test("rejects cross-workspace documents before typed validation", () => {
  const result = run([candidate], [definition], [{ ...document, workspaceId: "w2" }]);
  assert.equal(result.issues[0].code, "WORKSPACE_MISMATCH");
});
