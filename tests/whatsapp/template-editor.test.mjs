import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
// Only the pure rule is tested; the React parts are stubbed out.
const src = readFileSync("components/whatsapp/template-editor.tsx", "utf8");
const code = ts.transpileModule(src, { fileName: "x.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", code)((n) => (n === "react/jsx-runtime" ? { jsx: () => null, jsxs: () => null, Fragment: "f" } : {}), m, m.exports);
const { templateProblems } = m.exports;

test("template rules Meta would reject are caught before sending", () => {
  assert.deepEqual(templateProblems("Hola {{1}} 👋, organizamos eventos en tu zona. ¿Hablamos? 🎉", ""), []);
  assert.match(templateProblems("{{1}}, organizamos eventos en tu zona", "").join(), /empezar/);
  assert.match(templateProblems("Organizamos eventos para {{1}}.", "").join(), /terminar/);
  assert.match(templateProblems("Hola {{1}} {{2}} organizamos eventos en tu zona", "").join(), /seguidas/);
  assert.match(templateProblems("Hola {{2}}, organizamos eventos en tu zona", "").join(), /consecutivas/);
  assert.match(templateProblems("Hola {{nombre}}, organizamos eventos", "").join(), /solo números/);
  assert.match(templateProblems("Hola {{1}} y {{2}} ok", "").join(), /poco texto/);
  assert.match(templateProblems("Hola {{1}}, qué tal estás hoy", "Pie {{1}}").join(), /pie/);
});
