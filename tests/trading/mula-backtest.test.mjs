import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { runMula, MULA_DEFAULT } = load("lib/trading/mula/backtest.ts");
const DAY = 86_400_000;
const t0 = Date.UTC(2025, 0, 1);

/** Subida suave con una caída de 3 días cada 20 y rebote: el terreno ideal de la mula. */
function dips(n = 200) {
  const out = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const phase = i % 20;
    const ch = phase >= 15 && phase < 18 ? -0.02 : phase >= 18 ? 0.035 : 0.006;
    const o = p;
    p = p * (1 + ch);
    out.push({ t: t0 + i * DAY, o, h: Math.max(o, p) * 1.01, l: Math.min(o, p) * 0.995, c: p, v: 1 });
  }
  return out;
}

test("mula: en una tendencia con caídas compra los rebotes y gana", () => {
  const r = runMula([{ symbol: "AAA-EUR", candles: dips() }], { ...MULA_DEFAULT, feePct: 0, slippagePct: 0 });
  assert.ok(r.stats.trades >= 3, `operaciones: ${r.stats.trades}`);
  assert.ok(r.stats.totalPct > 0, `total: ${r.stats.totalPct}`);
  assert.ok(r.trades.every((t) => t.entryDay > 0 && t.exitDay >= t.entryDay));
});

test("mula: en caída continua no compra (está bajo su media de 50)", () => {
  const down = Array.from({ length: 150 }, (_, i) => {
    const c = 100 * 0.99 ** i;
    return { t: t0 + i * DAY, o: c / 0.99, h: c / 0.985, l: c * 0.995, c, v: 1 };
  });
  const r = runMula([{ symbol: "BBB-EUR", candles: down }]);
  assert.equal(r.stats.trades, 0);
});

test("mula: si el mismo día toca stop y objetivo, cuenta el stop", () => {
  const c = dips(120);
  const r = runMula([{ symbol: "CCC-EUR", candles: c }], { ...MULA_DEFAULT, feePct: 0, slippagePct: 0 });
  const t = r.trades[0];
  const i = c.findIndex((x) => x.t === t.exitDay);
  // Vela de salida con rango enorme: se repite la simulación forzando que toque ambos.
  const wide = c.map((x, k) => (k === i ? { ...x, h: x.o * 1.2, l: x.o * 0.8 } : x));
  const r2 = runMula([{ symbol: "CCC-EUR", candles: wide }], { ...MULA_DEFAULT, feePct: 0, slippagePct: 0 });
  assert.equal(r2.trades[0].reason, "stop");
  assert.ok(Math.abs(r2.trades[0].netPct + MULA_DEFAULT.slPct) < 1e-9);
});

test("mula: las comisiones restan en cada operación", () => {
  const c = dips();
  const free = runMula([{ symbol: "AAA-EUR", candles: c }], { ...MULA_DEFAULT, feePct: 0, slippagePct: 0 });
  const paid = runMula([{ symbol: "AAA-EUR", candles: c }], { ...MULA_DEFAULT, feePct: 0.25, slippagePct: 0.05 });
  assert.ok(paid.stats.totalPct < free.stats.totalPct);
});
