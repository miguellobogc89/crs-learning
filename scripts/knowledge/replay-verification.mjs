#!/usr/bin/env node
// Re-runs the reading verifier on a bundle copied with "Copiar todo" in the upload modal
// ({ lectura, lecturaIndependiente }), with no upload, database, storage or OCR call.
// Usage: node scripts/knowledge/replay-verification.mjs bundle.json
// Keep bundles out of the repository: they contain customer documents.
import { readFileSync } from "node:fs";
import ts from "typescript";
const load = file => {
  const m = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => ({}), m, m.exports);
  return m.exports;
};
const { verifyPage } = load("lib/knowledge/intake/verifier/compare.ts");
const bundle = JSON.parse(readFileSync(process.argv[2] ?? 0, "utf8"));
if (!bundle.lectura?.archivos || !Array.isArray(bundle.lecturaIndependiente)) throw new Error("Expected a 'Copiar todo' bundle with lectura and lecturaIndependiente");
for (const file of bundle.lectura.archivos) {
  const reference = bundle.lecturaIndependiente.find(r => r.archivoId === file.archivoId);
  for (const [i, page] of file.paginas.entries()) {
    if (!reference) { console.log(`## ${file.archivo} p${page.numero}: sin lectura independiente`); continue; }
    const r = verifyPage(page, reference.paginas[i]);
    console.log(`## ${file.archivo} p${r.numero} (${r.referencia})`);
    for (const l of r.literales) console.log(`  valor    ${l.donde}: ${JSON.stringify(l.modelo)} ${l.estado === "no_encontrado" ? "no encontrado" : JSON.stringify(l.documento ?? l.diferencias)}`);
    for (const c of r.columnas) console.log(`  columna  ${c.donde}: ${JSON.stringify(c.valor)} bajo ${c.columnaDocumento}, no ${c.columnaLectura}`);
    for (const o of r.omisiones) console.log(`  omitido  ${JSON.stringify(o.textoDocumento)}`);
    for (const a of r.avisos) console.log(`  aviso    ${a}`);
  }
}
