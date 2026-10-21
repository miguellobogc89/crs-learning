import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/engine/ingestion/progressive-analysis.service.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const stripped = js.replace(/const openai_1 = require\([^;]+;|const discover_service_1 = require\([^;]+;|const validation_1 = require\([^;]+;|const analyze_structured_document_service_1 = require\([^;]+;/g, "");
const output = {};
new Function("exports", "module", stripped)(output, { exports: output });
const split = output.splitEngineDocument;

test("preserves every source character across chunks", () => {
  const source = "Receta A\nAzúcar | 25\nReceta B\nLeche | 10\n";
  assert.equal(split(source, 20).join(""), source);
});
test("does not split a normal row across blocks", () => {
  assert.deepEqual(split("Header\nProduct | 12\nNext\n", 12),
    ["Header\n", "Product | 12\n", "Next\n"]);
});
test("preserves a long single line intact", () => {
  const source = "A".repeat(200);
  assert.deepEqual(split(source, 20), [source]);
});
test("empty source yields no blocks", () => {
  assert.deepEqual(split(""), []);
});
