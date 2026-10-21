import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../lib/engine/ingestion/table-pair-evidence.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const output = {};
new Function("exports", "module", js)(output, { exports: output });
const find = output.findAdjacentTablePairEvidence;
const product = { name: "Helado Mango" };
const tariff = { name: "Tarifa Octubre" };

test("finds contiguous table heading and product row", () => {
  assert.equal(find("Tarifa Octubre\nHelado Mango | 3,50 €", product, tariff),
    "Tarifa Octubre\nHelado Mango | 3,50 €");
});
test("does not join a distant heading and row", () => {
  assert.equal(find("Tarifa Octubre\nOtra sección\nHelado Mango | 3,50 €",
    product, tariff), null);
});
test("requires a delimited data row", () => {
  assert.equal(find("Tarifa Octubre\nHelado Mango", product, tariff), null);
});
test("does not infer a relationship when heading is not named", () => {
  assert.equal(find("Lista de precios\nHelado Mango | 3,50 €",
    product, tariff), null);
});
test("preserves exact CRLF evidence", () => {
  assert.equal(find("Tarifa Octubre\r\nHelado Mango | 3,50 €", product, tariff),
    "Tarifa Octubre\r\nHelado Mango | 3,50 €");
});
