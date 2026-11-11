import test from "node:test";
import assert from "node:assert/strict";
import { load, series } from "./helpers.mjs";

const { positionSize, commission, slipped } = load("lib/trading/risk.ts");
const { stepPosition, fillAtOpen, cashDelta, realizedPnl, marketValue } = load("lib/trading/paper.ts");
const { parseYahooChart } = load("lib/trading/market-data.ts");
const { analyze } = load("lib/trading/backtest.ts");
const { recommendForInstrument, rankRecommendations } = load("lib/trading/recommend.ts");

const cost = { commissionPct: 0.1, commissionMin: 3, slippageBps: 0 };
const bar = (o, h, l, c, t = 0) => ({ t, o, h, l, c, v: 1000 });

test("tamaño por riesgo fijo y sus límites", () => {
  // 10.000 € · 1 % = 100 € de riesgo; 2 € por acción → 50 acciones.
  const s = positionSize({ equity: 10_000, cash: 10_000, riskPct: 1, maxPositionPct: 100, entry: 20, stop: 18, cost });
  assert.equal(s.quantity, 50);
  assert.equal(s.riskAmount, 100);
  assert.equal(s.limitedBy, "riesgo");
  // Tope del 5 % de la cartera: 500 € / 20 € = 25 acciones.
  const capped = positionSize({ equity: 10_000, cash: 10_000, riskPct: 1, maxPositionPct: 5, entry: 20, stop: 18, cost });
  assert.equal(capped.quantity, 25);
  assert.equal(capped.limitedBy, "tamaño máximo");
  // Poco efectivo.
  const cash = positionSize({ equity: 10_000, cash: 300, riskPct: 1, maxPositionPct: 100, entry: 20, stop: 18, cost });
  assert.ok(cash.quantity <= 14 && cash.limitedBy === "efectivo");
  assert.equal(commission(1000, cost), 3);
  assert.equal(commission(10_000, cost), 10);
  assert.ok(slipped(100, "buy", { ...cost, slippageBps: 10 }) > 100);
});

test("cartera: stop, objetivo, huecos, break-even y tiempo", () => {
  const p = { direction: "long", quantity: 10, entryPrice: 100, stop: 95, initialStop: 95, target: 110, maxHoldUntil: null, breakeven: true };
  assert.deepEqual(stepPosition(p, bar(100, 104, 96, 103), cost).kind, "hold");
  const st = stepPosition(p, bar(99, 100, 94, 95.5), cost);
  assert.equal(st.kind, "exit");
  assert.equal(st.reason, "stop");
  assert.equal(st.price, 95);
  // Hueco a la baja: sale en la apertura, peor que el stop.
  assert.equal(stepPosition(p, bar(92, 93, 90, 91), cost).price, 92);
  assert.equal(stepPosition(p, bar(105, 111, 104, 109), cost).reason, "objetivo");
  // Gana 1 R (5 €) → el stop sube a la entrada.
  const be = stepPosition(p, bar(101, 105.5, 100.5, 105), cost);
  assert.equal(be.kind, "hold");
  assert.equal(be.stop, 100);
  assert.equal(stepPosition({ ...p, stop: 100 }, bar(101, 101, 99, 99.5), cost).reason, "break-even");
  assert.equal(stepPosition({ ...p, maxHoldUntil: 5 }, bar(101, 102, 100, 101, 5), cost).reason, "tiempo");
  // Cortos.
  const s = { ...p, direction: "short", stop: 105, initialStop: 105, target: 90 };
  assert.equal(stepPosition(s, bar(100, 106, 99, 104), cost).reason, "stop");
  assert.equal(stepPosition(s, bar(95, 96, 89, 90), cost).reason, "objetivo");
});

test("órdenes pendientes en la apertura y efecto en caja", () => {
  assert.equal(fillAtOpen({ direction: "long", quantity: 10, stop: 95, target: 110 }, bar(94, 96, 93, 95), cost).kind, "cancelled");
  const f = fillAtOpen({ direction: "long", quantity: 10, stop: 95, target: 110 }, bar(101, 102, 100, 101), cost);
  assert.equal(f.kind, "filled");
  assert.equal(f.price, 101);
  assert.equal(cashDelta("long", "open", 10, 100, 3), -1003);
  assert.equal(cashDelta("long", "close", 10, 110, 3), 1097);
  assert.equal(cashDelta("short", "open", 10, 100, 3), 997);
  assert.equal(cashDelta("short", "close", 10, 90, 3), -903);
  assert.equal(realizedPnl("short", 10, 100, 90), 100);
  assert.equal(marketValue("short", 10, 90), -900);
});

test("lectura de la respuesta de Yahoo Finance", () => {
  const json = {
    chart: {
      result: [
        {
          meta: { symbol: "SAN.MC", currency: "EUR", longName: "Banco Santander, S.A.", gmtoffset: 3600 },
          timestamp: [1762761600, 1762848000, 1762934400],
          indicators: { quote: [{ open: [8, 8.1, null], high: [8.2, 8.3, 8.4], low: [7.9, 8, 8.1], close: [8.1, 8.2, 8.3], volume: [100, 200, 300] }] },
        },
      ],
      error: null,
    },
  };
  const r = parseYahooChart(json);
  assert.equal(r.symbol, "SAN.MC");
  assert.equal(r.candles.length, 2, "se descarta la vela incompleta");
  assert.equal(new Date(r.candles[0].t).toISOString().slice(0, 10), "2025-11-10");
  assert.throws(() => parseYahooChart({ chart: { error: { description: "No data found" } } }), /No data/);
});

test("recomendaciones: plan con tamaño y orden por puntuación", () => {
  // Doble suelo que acaba de romper en la última sesión.
  const c = series([[0, 140], [30, 100], [50, 120], [70, 100.5], [86, 121.5], [88, 122.5]]);
  const { ind, detections } = analyze(c);
  const account = {
    equity: 10_000,
    cash: 10_000,
    riskPct: 1,
    maxPositionPct: 25,
    allowShort: false,
    minScore: 40,
    cost,
    holdings: {},
  };
  const stats = { double_bottom: { pattern: "double_bottom", trades: 40, wins: 22, winRate: 0.55, avgR: 0.4, adjustedExpectancy: 0.29, profitFactor: 1.6, avgBars: 20, avgPct: 2, maxDrawdownR: 5, bestR: 3, worstR: -1.2 } };
  const recs = recommendForInstrument({ symbol: "TST.MC", name: "Test", candles: c, ind, detections }, stats, "alcista", account);
  const r = recs.find((x) => x.pattern === "double_bottom");
  assert.ok(r, "hay recomendación");
  assert.equal(r.action, "comprar");
  assert.ok(r.sizing.quantity > 0);
  assert.ok(r.sizing.riskAmount <= 100.01);
  assert.match(r.plan, /Compra \d+ acciones de Test/);
  assert.ok(r.score >= 0 && r.score <= 100);
  // Con posición contraria abierta → cerrar.
  const held = recommendForInstrument({ symbol: "TST.MC", name: "Test", candles: c, ind, detections }, stats, "alcista", { ...account, holdings: { "TST.MC": "short" } });
  assert.equal(held.find((x) => x.pattern === "double_bottom").action, "cerrar");
  const ranked = rankRecommendations([{ ...r, score: 10, strong: false }, r]);
  assert.equal(ranked[0].score, r.score);
});

test("recomendaciones: una figura con historial negativo amplio queda vetada", () => {
  const c = series([[0, 140], [30, 100], [50, 120], [70, 100.5], [86, 121.5], [88, 122.5]]);
  const { ind, detections } = analyze(c);
  const account = { equity: 10_000, cash: 10_000, riskPct: 1, maxPositionPct: 25, allowShort: false, minScore: 0, cost, holdings: {} };
  const bad = { double_bottom: { pattern: "double_bottom", trades: 108, wins: 43, winRate: 0.4, avgR: -0.12, adjustedExpectancy: -0.105, profitFactor: 0.85, avgBars: 20, avgPct: -0.3, maxDrawdownR: 14, bestR: 3, worstR: -1.3 } };
  const r = recommendForInstrument({ symbol: "TST.MC", name: "Test", candles: c, ind, detections }, bad, "alcista", account).find((x) => x.pattern === "double_bottom");
  assert.ok(r);
  assert.equal(r.vetoed, true);
  assert.equal(r.strong, false, "aunque la nota mínima sea 0");
  assert.ok(r.score <= 45);
  assert.match(r.plan, /No recomendada/);
  // Con pocas operaciones no se veta (se penaliza en la nota, sin más).
  const few = { double_bottom: { ...bad.double_bottom, trades: 12 } };
  const r2 = recommendForInstrument({ symbol: "TST.MC", name: "Test", candles: c, ind, detections }, few, "alcista", account).find((x) => x.pattern === "double_bottom");
  assert.equal(r2.vetoed, false);
});

test("efectivo reservado: las compras pendientes comprometen su dinero (precio, deslizamiento y comisión)", () => {
  const { reservedFor } = load("lib/trading/risk.ts");
  const cost = { commissionPct: 0.1, commissionMin: 3, slippageBps: 10 };
  const r = reservedFor([{ direction: "long", quantity: 100, planned_entry: 10 }, { direction: "short", quantity: 50, planned_entry: 20 }], cost);
  // 100 × 10,01 = 1001 € + comisión mínima 3 €; las cortas no consumen efectivo.
  assert.ok(Math.abs(r - 1004) < 1e-9, String(r));
  assert.equal(reservedFor([], cost), 0);
});
