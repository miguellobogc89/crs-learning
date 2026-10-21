import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/engine/ingestion/pair-evidence.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const exported = {};
new Function("exports", "module", js)(exported, { exports: exported });
const { findPairEvidence } = exported;

test("recovers a literal line proving both named endpoints", () => {
  const document = "Tarifa de octubre\nHelado Mango | Tarifa Octubre | 3,50 €\n";
  assert.equal(findPairEvidence(document, { name: "Helado Mango" },
    { name: "Tarifa Octubre" }), "Helado Mango | Tarifa Octubre | 3,50 €");
});
test("does not infer a relation from endpoints in separate lines", () => {
  assert.equal(findPairEvidence("Helado Mango\nTarifa Octubre",
    { name: "Helado Mango" }, { name: "Tarifa Octubre" }), null);
});
test("does not accept identical endpoint anchors as pair evidence", () => {
  assert.equal(findPairEvidence("Mango en oferta", { name: "Mango" },
    { name: "Mango" }), null);
});
test("does not use numbers alone as relation evidence", () => {
  assert.equal(findPairEvidence("3.50 5.00", { price: 3.5 },
    { price: 5 }), null);
});
test("does not fabricate a source quote when one endpoint is absent", () => {
  assert.equal(findPairEvidence("Helado Mango | Tarifa Octubre",
    { name: "Helado Mango" }, { name: "Tarifa Noviembre" }), null);
});
