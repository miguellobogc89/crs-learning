import test from "node:test";
import assert from "node:assert/strict";
import { load, series, rng } from "./helpers.mjs";

const { prepareTrend, simulateTrend, chooseTrendParams, trendPicks, PROFILES } = load("lib/trading/strategy.ts");
const cost = { commissionPct: 0.1, commissionMin: 3, slippageBps: 5 };

function walk(seed, drift, n = 400, step = 4) {
  const r = rng(seed);
  const pts = [[0, 50]];
  let p = 50;
  for (let i = 1; i <= n; i++) {
    p = Math.max(2, p * (1 + drift + (r() - 0.5) * 0.08));
    pts.push([i * step, p]);
  }
  return series(pts, { noise: 0.01, seed });
}

function universe() {
  const drifts = [0.012, 0.008, 0.004, 0, -0.004, -0.008, 0.006, 0.002];
  return prepareTrend(drifts.map((d, k) => ({ symbol: `S${k}`, name: `Valor ${k}`, candles: walk(k + 1, d), lotStep: 1 })));
}

test("tendencia: compra los fuertes, cuadra la caja y no invierte más de lo que permite el perfil", () => {
  const s = universe();
  const bench = { candles: walk(99, 0.003) };
  const startT = s[0].candles[900].t;
  const r = simulateTrend({ series: s, bench, startT, capital: 10_000, cost, params: { lookback: 126, topN: 3, rebalance: 21, exposure: PROFILES.equilibrado.exposure, stopAtr: 3 } });
  assert.ok(r.trades + r.openTrades > 0);
  const sum = r.list.reduce((a, t) => a + t.pnl, 0);
  assert.ok(Math.abs(r.finalEquity - (10_000 + sum)) < 1, `${r.finalEquity} vs ${10_000 + sum}`);
  for (const p of r.curve) assert.ok(p.invested <= p.equity * 0.8 * 1.35 + 1, `exposición ${p.invested}/${p.equity}`);
  // Los que más suben deberían aparecer más que los que bajan.
  const count = (sym) => r.list.filter((t) => t.symbol === sym).length;
  assert.ok(count("S0") >= count("S5"));
  assert.ok(r.benchmarkMaxDrawdownPct !== null);
});

test("tendencia: los parámetros se eligen solo con datos anteriores al inicio", () => {
  const s = universe();
  const bench = { candles: walk(99, 0.003) };
  const startT = s[0].candles[1200].t;
  const chosen = chooseTrendParams({ series: s, bench, market: "bolsa", exposure: 0.8, startT, cost });
  assert.equal(chosen.trained, true);
  assert.ok(chosen.trainFrom < new Date(startT).toISOString().slice(0, 10));
  // Cambiar el futuro no cambia la elección.
  const future = s.map((x) => ({ ...x, candles: x.candles.map((c) => (c.t >= startT ? { ...c, c: c.c * 3, h: c.h * 3 } : c)) }));
  const again = chooseTrendParams({ series: prepareTrend(future), bench, market: "bolsa", exposure: 0.8, startT, cost });
  assert.deepEqual(again.params, chosen.params);
});

test("tendencia: el filtro de mercado vende todo cuando el mercado se gira", () => {
  const s = universe();
  const crash = series([[0, 100], [800, 160], [1000, 60], [1600, 70]], { noise: 0.005 });
  const r = simulateTrend({ series: s, bench: { candles: crash }, startT: s[0].candles[600].t, capital: 10_000, cost, params: { lookback: 126, topN: 3, rebalance: 21, exposure: 1, stopAtr: 3 } });
  assert.ok(r.list.some((t) => t.reason === "mercado bajista" || t.reason === "stop"));
  const picks = trendPicks(s, { candles: crash.slice(0, 1000) }, { lookback: 126, topN: 3 });
  assert.equal(picks.marketOk, false);
  assert.ok(picks.ranked.length > 0);
});
