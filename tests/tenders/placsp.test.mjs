import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path) {
  const m = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(require, m, m.exports);
  return m.exports;
}

const placsp = load("lib/tenders/placsp.ts");
const xml = readFileSync("tests/tenders/fixtures/feed-page.atom", "utf8");

test("lee una página del feed con sus entradas, borrados y enlace siguiente", () => {
  const page = placsp.parseFeedPage(xml);
  assert.equal(page.tenders.length, 3);
  assert.deepEqual(page.deletedIds, [
    "https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/999",
  ]);
  assert.match(page.nextUrl, /_20261105_090000\.atom$/);
  assert.equal(page.oldestUpdate.toISOString(), "2026-11-04T17:00:00.000Z");
});

test("extrae los datos de una licitación de software abreviada", () => {
  const [app] = placsp.parseFeedPage(xml).tenders;
  assert.equal(app.folderId, "2026/00142");
  assert.equal(app.status, "PUB");
  assert.equal(app.contractingBody, "Ayuntamiento de Ejemplo");
  assert.equal(app.contractType, "2");
  assert.equal(app.procedureCode, "9");
  assert.equal(app.estimatedAmount, 42000);
  assert.equal(app.budgetWithTax, 50820);
  assert.deepEqual(app.cpvCodes, ["72200000", "72212000"]);
  assert.equal(app.province, "Sevilla");
  assert.equal(app.city, "Dos Hermanas");
  assert.equal(app.deadline.toISOString(), "2026-11-20T13:00:00.000Z");
  assert.equal(app.kind, "abreviado");
  assert.equal(app.isSoftware, true);
  assert.match(app.url, /idEvl=abc101$/);
});

test("clasifica simplificado, descarta abiertos ordinarios y lee CPV de los lotes", () => {
  const [, tent, servers] = placsp.parseFeedPage(xml).tenders;
  assert.equal(tent.kind, "simplificado");
  assert.equal(tent.isSoftware, false);
  assert.equal(tent.deadline.toISOString(), "2026-11-15T22:59:59.000Z");
  assert.equal(servers.kind, null);
  assert.deepEqual(servers.cpvCodes, ["72500000"]);
  assert.equal(servers.isSoftware, true);
});

test("solo son oportunidades las publicadas, de los tipos elegidos y en plazo", () => {
  const [app, tent, servers] = placsp.parseFeedPage(xml).tenders;
  const now = new Date("2026-11-16T10:00:00Z");
  assert.equal(placsp.isOpenOpportunity(app, now), true);
  assert.equal(placsp.isOpenOpportunity(tent, now), false, "plazo vencido");
  assert.equal(placsp.isOpenOpportunity(servers, now), false, "adjudicada y abierta ordinaria");
});

test("límites de importe y contratos menores", () => {
  assert.equal(placsp.classifyKind("9", 59999.99), "abreviado");
  assert.equal(placsp.classifyKind("9", 60000), "simplificado");
  assert.equal(placsp.classifyKind("9", 140000), "simplificado");
  assert.equal(placsp.classifyKind("9", 140001), null);
  assert.equal(placsp.classifyKind("9", null), "simplificado");
  assert.equal(placsp.classifyKind("6", 12000), "menor");
  assert.equal(placsp.classifyKind("1", 10000), null);
});

test("detecta software por palabras aunque el CPV no sea informático", () => {
  assert.equal(placsp.isSoftwareTender(["79342000"], "Creación de la página web municipal"), true);
  assert.equal(placsp.isSoftwareTender(["45000000"], "Obras de pavimentación"), false);
});

test("limpia restos de HTML y deduce la provincia del código postal del órgano", () => {
  const [, tent] = placsp.parseFeedPage(xml).tenders;
  assert.equal(tent.title, "Alquiler e instalación de carpa para fiestas");
  assert.equal(tent.province, "Zaragoza");
  assert.equal(tent.city, "Zaragoza");
  assert.equal(placsp.cleanText("&nbsp; &nbsp;Firma&#xD; electrónica &amp; SaaS"), "Firma electrónica & SaaS");
  assert.equal(placsp.provinceFromPostalCode("08001"), "Barcelona");
  assert.equal(placsp.provinceFromPostalCode("99"), null);
});
