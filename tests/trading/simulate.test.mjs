import test from "node:test";
import assert from "node:assert/strict";
import { load, series, rng } from "./helpers.mjs";

const { analyze, backtestSeries } = load("lib/trading/backtest.ts");
const { indicatorBundle } = load("lib/trading/indicators.ts");
const { simulatePortfolio } = load("lib/trading/simulate.ts");

function walk(seed, n = 300, step = 5) {
  const r = rng(seed);
  const pts = [[0, 50]];
  let p = 50;
  for (let i = 1; i <= n; i++) {
    p = Math.max(5, p * (1 + (r() - 0.48) * 0.12));
    pts.push([i * step, p]);
  }
  return series(pts, { noise: 0.012, seed });
}

const settings = {
  capital: 10_000,
  riskPct: 1,
  maxPositionPct: 25,
  maxOpen: 6,
  minScore: 0,
  allowShort: false,
  breakeven: true,
  patterns: null,
  cost: { commissionPct: 0.1, commissionMin: 3, slippageBps: 5 },
};

function build(count = 8) {
  const list = [];
  for (let s = 1; s <= count; s++) {
    const candles = walk(s);
    const analysis = analyze(candles);
    list.push({ symbol: `S${s}.MC`, name: `Valor ${s}`, candles, analysis, trades: backtestSeries(candles, undefined, analysis) });
  }
  const idx = walk(99);
  return { list, index: { candles: idx, ind: indicatorBundle(idx) } };
}

test("simulador: cuadra la caja, respeta límites y no opera antes del inicio", () => {
  const { list, index } = build();
  const startT = list[0].candles[700].t;
  const r = simulatePortfolio({ series: list, index, startT, settings });
  assert.ok(r.sessions > 100);
  assert.ok(r.trades > 0, "hace operaciones");
  for (const t of r.list) assert.ok(t.entryDay >= r.start, "ninguna entrada antes del inicio");
  // El patrimonio final = capital + suma de resultados (cerradas y abiertas valoradas al cierre).
  const sum = r.list.reduce((s, t) => s + t.pnl, 0);
  assert.ok(Math.abs(r.finalEquity - (r.capital + sum)) < 1, `${r.finalEquity} vs ${r.capital + sum}`);
  // Nunca más posiciones simultáneas que el máximo.
  for (const day of r.curve.map((p) => p.day)) {
    const live = r.list.filter((t) => t.entryDay <= day && (t.exitDay === null || t.exitDay > day)).length;
    assert.ok(live <= settings.maxOpen, `día ${day}: ${live}`);
  }
  // Riesgo por operación acotado al 1 % (más costes y huecos).
  for (const t of r.list.filter((x) => x.reason === "stop")) assert.ok(t.r > -1.6, `R ${t.r}`);
  assert.ok(r.maxDrawdownPct >= 0 && r.maxDrawdownPct < 100);
  assert.ok(r.monthly.length >= 3);
  assert.ok(r.benchmarkPct !== null);
});

test("simulador: un umbral imposible no opera", () => {
  const { list, index } = build(4);
  const r = simulatePortfolio({ series: list, index, startT: list[0].candles[700].t, settings: { ...settings, minScore: 101 } });
  assert.equal(r.trades + r.openTrades, 0);
  assert.equal(Math.round(r.finalEquity), 10_000);
});
