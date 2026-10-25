// Offline replay of REAL Engine preview runs exported with
// scripts/engine/export-knowledge-preview-fixture.mjs. Re-verifies every stored
// model answer against the stored source text with today's validators, without
// calling the model or the database. Skipped when no private fixture exists.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function load(filename, cache = new Map()) {
  filename = path.resolve(root, filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(id => id.startsWith(".") ? load(path.resolve(path.dirname(filename), id + ".ts"), cache) : require(id), module, module.exports);
  return module.exports;
}
const evidence = load("lib/engine/knowledge-preview/evidence.ts");
const extraction = load("lib/engine/knowledge-preview/extraction.ts");
const reconcile = load("lib/engine/knowledge-preview/reconcile.ts");

const directory = process.env.KNOWLEDGE_PREVIEW_FIXTURES ?? path.join(root, "tests/fixtures/private");
const fixtures = fs.existsSync(directory)
  ? fs.readdirSync(directory).filter(name => /^knowledge-preview-.*\.json$/.test(name)).map(name => path.join(directory, name))
  : [];

if (!fixtures.length) {
  test("real preview replay", { skip: "No hay fixtures privados. Exporta una ejecución real con scripts/engine/export-knowledge-preview-fixture.mjs." }, () => {});
}

for (const file of fixtures) {
  test("real preview replay · " + path.basename(file), () => {
    const fixture = JSON.parse(fs.readFileSync(file, "utf8"));
    const { preview, files } = fixture;
    assert.ok(preview.schema, "the exported run has an accepted schema");
    const calls = new Map(preview.calls.map(call => [call.id, call]));
    const replayed = [];
    for (const document of Object.values(preview.documents)) {
      if (!document.callId || !calls.get(document.callId)?.rawOutput) continue;
      const source = files.find(item => item.id === document.fileId);
      const lines = evidence.sourceLines(source.extracted_text);
      const result = extraction.validateSegmentExtraction(
        JSON.parse(calls.get(document.callId).rawOutput), preview.schema, lines,
        { startLine: document.startLine, endLine: document.endLine });
      const status = result.issues.some(issue => issue.severity === "error") ? "needs_review" : "verified";
      assert.equal(status, document.status, `${document.fileName}: replay reproduces the stored status`);
      assert.equal(result.records.length, document.records.length, `${document.fileName}: same verified records`);
      replayed.push({ segmentId: document.segmentId, fileName: document.fileName, records: result.records, links: result.links });
      console.log(`${document.fileName} · ${document.title}: ${status}, ${result.records.length} registros, ${result.issues.length} incidencias`);
      for (const issue of result.issues) console.log("   - " + issue.message);
    }
    const clusters = reconcile.reconcileBatch(preview.schema, replayed);
    for (const entity of preview.schema.entities.filter(item => !item.ownedBy)) {
      const own = clusters.filter(cluster => cluster.entity === entity.key);
      console.log(`${entity.name}: ${own.length} únicos`);
      for (const cluster of own)
        console.log(`   ${cluster.label} ${JSON.stringify(cluster.identity)} · ${cluster.occurrences.map(o => o.fileName + (o.roles.length ? " (" + o.roles.join(", ") + ")" : "")).join(" · ")}`);
    }
  });
}
