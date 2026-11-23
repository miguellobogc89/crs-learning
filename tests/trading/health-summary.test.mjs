// Avisos (qué está roto) y Resumen de Inicio (familias de agentes, coste de IA).
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const H = load("lib/trading/health.ts");
const S = load("lib/trading/summary-logic.ts");
const MIN = 60_000;
const ok = { now: 100 * 60 * MIN, lastFaroAt: 100 * 60 * MIN - 10 * MIN, lastTickAt: 100 * 60 * MIN - 3 * MIN, brokers: [], ai: { calls: 10, limit: 300 }, mirrorErrors: [] };

test("avisos: todo bien, ningún problema", () => {
  assert.deepEqual(H.healthProblems(ok), []);
});

test("avisos: FARO parado, revisión parada, exchange caído, límite de IA y copia que falla", () => {
  const keys = (o) => H.healthProblems({ ...ok, ...o }).map((p) => p.key);
  assert.deepEqual(keys({ lastFaroAt: ok.now - 150 * MIN }), ["faro-parado"]);
  assert.deepEqual(keys({ lastTickAt: ok.now - 25 * MIN }), ["revision-parada"]);
  assert.deepEqual(keys({ lastTickAt: null, lastFaroAt: null }), ["revision-parada", "faro-parado"]);
  assert.deepEqual(keys({ brokers: [{ provider: "coinbase", name: "Coinbase", error: "clave" }, { provider: "okx", name: "OKX", error: null }] }), ["exchange:coinbase"]);
  assert.deepEqual(keys({ ai: { calls: 300, limit: 300 } }), ["ia-limite"]);
  assert.deepEqual(keys({ mirrorErrors: [{ id: "x", agent: "ROCA", symbol: "SOL-EUR", note: null }] }), ["copia:x"]);
  assert.match(H.healthProblems({ ...ok, lastFaroAt: ok.now - 3 * 60 * MIN })[0].body, /3 horas/);
});

test("resumen: por familia, solo los agentes que han operado, con la media de su rentabilidad", () => {
  const row = (key, returnPct, trades) => ({ key, name: key, color: "slate", equity: 1000 * (1 + returnPct / 100), returnPct, trades });
  const g = S.agentGroups([row("enjambre", 2, 5), row("enjambre-grandes", -1, 3), row("enjambre-rapido", 9, 0), row("roca", 0, 0), row("camaleon", 1, 1)]);
  assert.deepEqual(g.map((x) => x.key), ["enjambres", "reglas"], "«Por riesgo» no sale: ninguno ha operado");
  assert.equal(g[0].returnPct, 0.5);
  assert.equal(g[0].idle, 1);
  assert.deepEqual(g[0].agents.map((a) => a.key), ["enjambre", "enjambre-grandes"]);
});

test("resumen: coste de IA solo si hay precio configurado", () => {
  assert.equal(S.aiCostEur({ input: 1_000_000, output: 500_000 }, null), null);
  assert.equal(S.aiCostEur({ input: 1_000_000, output: 500_000 }, { input: 2, output: 8 }), 6);
});
