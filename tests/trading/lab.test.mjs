import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { simulate, HOLD_BTC, BTC_FILTER, rotation, BREAKOUT } = load("lib/trading/lab/strategies.ts");
const DAY = 86_400_000;
const t0 = Date.UTC(2024, 0, 1);
const line = (n, f) =>
  Array.from({ length: n }, (_, i) => {
    const o = f(i);
    const c = f(i + 1);
    return { t: t0 + i * DAY, o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c, v: 1 };
  });

test("laboratorio: mantener sin comisiones da la subida del activo", () => {
  const coins = [{ symbol: "BTC-EUR", candles: line(300, (i) => 100 * 1.002 ** i) }];
  const r = simulate(coins, HOLD_BTC, { from: t0 + 250 * DAY, feePct: 0, slippagePct: 0 });
  // Compra a la apertura del segundo día; desde ahí sigue al activo.
  const expected = (1.002 ** 50 / 1.002 ** 251 - 1) * 100;
  assert.ok(Math.abs(r.stats.totalPct - (1.002 ** 49 - 1) * 100) < 0.5, `${r.stats.totalPct} vs ~${expected}`);
});

test("laboratorio: el filtro de 200 días deja la cartera en efectivo en caída", () => {
  const coins = [{ symbol: "BTC-EUR", candles: line(400, (i) => 100 * 0.998 ** i) }];
  const r = simulate(coins, BTC_FILTER, { from: t0 + 250 * DAY });
  assert.equal(r.stats.exposurePct, 0);
  assert.ok(Math.abs(r.stats.totalPct) < 1e-9);
});

test("laboratorio: la rotación se queda con la más fuerte", () => {
  const coins = [
    { symbol: "BTC-EUR", candles: line(400, (i) => 100 * 1.001 ** i) },
    { symbol: "AAA-EUR", candles: line(400, (i) => 10 * 1.004 ** i) },
    { symbol: "BBB-EUR", candles: line(400, (i) => 10 * 0.999 ** i) },
  ];
  const r = simulate(coins, rotation(1, 60), { from: t0 + 250 * DAY, feePct: 0, slippagePct: 0 });
  assert.ok(r.stats.totalPct > 40, `total ${r.stats.totalPct}`);
  assert.ok(r.stats.rebalances <= 2);
});

test("laboratorio: las comisiones se notan y las rupturas no fallan con datos cortos", () => {
  const coins = [
    { symbol: "BTC-EUR", candles: line(400, (i) => 100 * 1.001 ** i * (1 + 0.05 * Math.sin(i / 7))) },
    { symbol: "AAA-EUR", candles: line(400, (i) => 10 * 1.002 ** i * (1 + 0.08 * Math.sin(i / 5))) },
  ];
  const free = simulate(coins, BREAKOUT, { from: t0 + 250 * DAY, feePct: 0, slippagePct: 0 });
  const paid = simulate(coins, BREAKOUT, { from: t0 + 250 * DAY, feePct: 0.5, slippagePct: 0.1 });
  assert.ok(paid.stats.totalPct <= free.stats.totalPct);
  assert.ok(Number.isFinite(paid.stats.maxDrawdownPct));
});
