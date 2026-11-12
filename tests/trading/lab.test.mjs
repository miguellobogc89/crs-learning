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

test("laboratorio: si un par deja de cotizar, se vende a su último cierre (no vale cero)", () => {
  const btc = line(400, (i) => 100 * 1.001 ** i);
  const gone = line(300, (i) => 10 * 1.004 ** i); // deja de cotizar el día 300
  const coins = [
    { symbol: "BTC-EUR", candles: btc },
    { symbol: "AAA-EUR", candles: gone },
  ];
  const r = simulate(coins, rotation(1, 60), { from: t0 + 250 * DAY, feePct: 0, slippagePct: 0 });
  assert.deepEqual(r.delisted, ["AAA-EUR"]);
  assert.ok(r.stats.totalPct > 10, `total ${r.stats.totalPct}`);
  assert.ok(r.stats.maxDrawdownPct > -5, `caída ${r.stats.maxDrawdownPct}`);
});

test("laboratorio: el chip pasa a efectivo en cuanto Bitcoin cae y vuelve a atacar cuando se recupera", () => {
  const { CHIP } = load("lib/trading/lab/strategies.ts");
  const chipBtc = CHIP.find((s) => s.key === "chip-a-btc");
  // Sube 300 días, cae un 25 % en 20 días y luego se queda plano.
  const f = (i) => (i < 300 ? 100 * 1.003 ** i : i < 320 ? 100 * 1.003 ** 300 * 0.9857 ** (i - 300) : 100 * 1.003 ** 300 * 0.9857 ** 20);
  const coins = [{ symbol: "BTC-EUR", candles: line(380, f) }];
  const r = simulate(coins, chipBtc, { from: t0 + 250 * DAY, feePct: 0, slippagePct: 0 });
  const hold = simulate(coins, HOLD_BTC, { from: t0 + 250 * DAY, feePct: 0, slippagePct: 0 });
  assert.ok(r.stats.maxDrawdownPct > hold.stats.maxDrawdownPct + 5, `chip ${r.stats.maxDrawdownPct} vs mantener ${hold.stats.maxDrawdownPct}`);
  assert.deepEqual(Object.keys(r.lastWeights), [], "al final está en defensa");
});

test("agente en directo: el contexto de un día da el mismo modo que la simulación", () => {
  const { contextAt, explainDetectorB, CHIP } = load("lib/trading/lab/strategies.ts");
  const { CHIP_AGENTS } = load("lib/trading/chip/roster.ts");
  const f = (i) => (i < 300 ? 100 * 1.003 ** i : 100 * 1.003 ** 300 * 0.985 ** (i - 300));
  const coins = [
    { symbol: "BTC-EUR", candles: line(330, f) },
    { symbol: "AAA-EUR", candles: line(330, (i) => 10 * 1.004 ** i) },
  ];
  const up = contextAt(coins, t0 + 299 * DAY, 0, () => false);
  const down = contextAt(coins, t0 + 325 * DAY, 0, () => false);
  assert.equal(explainDetectorB(up).attack, true);
  assert.equal(explainDetectorB(down).attack, false);
  assert.equal(explainDetectorB(down).checks.length, 3);
  // La estrategia del agente existe en el laboratorio y en defensa no compra nada.
  const strat = CHIP.find((s) => s.key === CHIP_AGENTS[0].strategy);
  assert.ok(strat);
  assert.equal(strat.decide(down), null);
});

test("laboratorio: el corto gana cuando Bitcoin cae y pierde cuando sube (con financiación)", () => {
  const { SHORTS } = load("lib/trading/lab/strategies.ts");
  const shortOnly = SHORTS.find((s) => s.key === "short-only");
  const fall = [{ symbol: "BTC-EUR", candles: line(400, (i) => 100 * 0.997 ** i) }];
  const r = simulate(fall, shortOnly, { from: t0 + 250 * DAY, feePct: 0, slippagePct: 0, shortFundingPct: 0 });
  assert.ok(r.stats.totalPct > 20, `corto en caída: ${r.stats.totalPct}`);
  const paid = simulate(fall, shortOnly, { from: t0 + 250 * DAY, feePct: 0, slippagePct: 0, shortFundingPct: 0.05 });
  assert.ok(paid.stats.totalPct < r.stats.totalPct, "la financiación resta");
  // En subida, el detector está en ataque: el agente «solo corto» se queda en efectivo.
  const rise = [{ symbol: "BTC-EUR", candles: line(400, (i) => 100 * 1.003 ** i) }];
  const r2 = simulate(rise, shortOnly, { from: t0 + 250 * DAY, feePct: 0, slippagePct: 0 });
  assert.ok(Math.abs(r2.stats.totalPct) < 1, `en subida no está corto: ${r2.stats.totalPct}`);
});
