import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../lib/knowledge/import/recommend-route.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const output = {};
new Function("exports", "module", js)(output, { exports: output });
const route = output.recommendImportRoute;
for (const [kind, destination] of [
  ["information", "knowledge"], ["tables", "engine"],
  ["mixed", "both"], ["undetermined", "review"],
]) {
  test(kind + " recommends " + destination + " without persistence", () => {
    assert.equal(route({ kind, confidence: kind === "undetermined" ? "low" : "high",
      structuredLines: 0, narrativeLines: 0 }).destination, destination);
  });
}
