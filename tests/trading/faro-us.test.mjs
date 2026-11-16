// FARO en EE. UU.: velas horarias de Yahoo y su resumen de sesión.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// us.ts usa "server-only" y la red: se prueban solo sus funciones puras, cargadas sin esos imports.
const src = readFileSync("lib/trading/faro/us.ts", "utf8").replace('import "server-only";', "").replace(/import \{[^}]*\} from "\.\.\/market-data";/, "const US_STOCKS = [{ symbol: 'NVDA' }, { symbol: 'QQQ' }]; const eurUsd = async () => [];");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", js)(m, m.exports, () => ({}));
const { parseYahooBars, usTickerOf, isUsPair } = m.exports;

test("FARO EE. UU.: velas de 1 h sin huecos y resumen de la última sesión (7 velas)", () => {
  const n = 14;
  const json = { chart: { result: [{ timestamp: Array.from({ length: n }, (_, i) => 1_700_000_000 + i * 3600), indicators: { quote: [{ open: Array(n).fill(100), high: Array(n).fill(101), low: Array(n).fill(99), close: Array.from({ length: n }, (_, i) => (i === 3 ? null : 100 + i)), volume: Array(n).fill(10) }] } }] } };
  const bars = parseYahooBars(json);
  assert.equal(bars.length, n - 1, "la vela sin cierre se descarta");
  assert.equal(bars[0].qv, 1000, "volumen en dinero = acciones × precio");
  const t = usTickerOf("NVDA", bars);
  assert.equal(t.price, 113);
  assert.equal(t.pair, "NVDA");
  assert.ok(Math.abs(t.ch24h - ((113 - 106) / 106) * 100) < 1e-9, "frente al cierre de hace 7 velas");
  assert.equal(usTickerOf("NVDA", bars.slice(0, 5)), null, "pocas velas: fuera");
  assert.equal(isUsPair("NVDA"), true);
  assert.equal(isUsPair("BTCEUR"), false);
});
