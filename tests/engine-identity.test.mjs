import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/engine/identity-fields.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", "module", js)(exports, { exports });
const { selectIdentityFields } = exports;
const fields = (...keys) => keys.map(key => ({ key }));

test("explicit external identifier wins over name", () => {
  assert.deepEqual(selectIdentityFields(fields("name", "external_id")), ["external_id"]);
});
test("recognizes semantic product names", () => {
  assert.deepEqual(selectIdentityFields(fields("product_name", "price")), ["product_name"]);
});
test("recognizes a pair of object references", () => {
  assert.deepEqual(selectIdentityFields(fields("product_id", "price", "price_list_id")),
    ["price_list_id", "product_id"]);
});
test("does not derive identity from prices or descriptive attributes", () => {
  assert.deepEqual(selectIdentityFields(fields("price", "description", "start_date")), []);
});
test("does not treat technical provenance as object identity", () => {
  assert.deepEqual(selectIdentityFields(fields("source_id", "product_id", "workspace_id")), []);
});
test("single reference does not prove a junction identity", () => {
  assert.deepEqual(selectIdentityFields(fields("product_id", "price")), []);
});
