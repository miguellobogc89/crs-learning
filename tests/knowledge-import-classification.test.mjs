import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../lib/knowledge/import/classify-content.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const output = {};
new Function("exports", "module", js)(output, { exports: output });
const classify = output.classifyImportContent;
test("recipe quantity lines are recognized as structured data", () => {
  const result = classify("Leche 250 ml\nAzúcar 125 g\nNata 300 ml");
  assert.equal(result.kind, "tables");
});
test("prose-only documents remain information", () => {
  const line = "Este procedimiento explica las responsabilidades y describe la secuencia de operaciones necesarias.";
  assert.equal(classify(Array(4).fill(line).join("\n")).kind, "information");
});
test("mixed narrative and structured content is not routed as tables-only", () => {
  const line = "Este procedimiento explica las responsabilidades y describe la secuencia de operaciones necesarias.";
  assert.equal(classify([line, line, line, "Leche 250 ml", "Azúcar 125 g", "Nata 300 ml"].join("\n")).kind, "mixed");
});
test("isolated quantities are insufficient for confident classification", () => {
  assert.equal(classify("Un producto cuesta 12 €").kind, "undetermined");
});
