// Kamikazes: rondas, ritmo necesario, candidatos de cada estilo, salidas y validación de decisiones.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const L = load("lib/trading/kamikaze/logic.ts");
const { KAMIKAZES } = load("lib/trading/kamikaze/roster.ts");
const DAY = 86_400_000;

test("kamikazes: tres estilos con metas distintas y 20 € por ronda", () => {
  assert.deepEqual(KAMIKAZES.map((k) => [k.key, k.style, k.multiple, k.days]), [
    ["cohete", "impulso", 10, 7],
    ["mecha", "rupturas", 10, 5],
    ["fenix", "rebotes", 8, 10],
  ]);
  assert.ok(KAMIKAZES.every((k) => k.capital === 20 && k.settings.max_open_positions === 1));
});

test("kamikazes: ritmo diario necesario", () => {
  assert.ok(Math.abs(L.requiredDailyPct(20, 200, 7 * DAY) - 38.95) < 0.05, "×10 en 7 días ≈ +39 %/día");
  assert.ok(Math.abs(L.requiredDailyPct(20, 200, 5 * DAY) - 58.49) < 0.05);
  assert.ok(Math.abs(L.requiredDailyPct(20, 160, 10 * DAY) - 23.11) < 0.05);
  assert.equal(L.requiredDailyPct(250, 200, DAY), 0);
  assert.equal(L.requiredDailyPct(0, 200, DAY), Infinity);
});

test("kamikazes: fin de ronda por meta, plazo o sin capital", () => {
  const base = { equity: 30, goal: 200, deadline: 1000, now: 500, holding: false, cash: 30, minOrder: 5 };
  assert.equal(L.roundOutcome(base), null);
  assert.equal(L.roundOutcome({ ...base, equity: 201 }), "meta");
  assert.equal(L.roundOutcome({ ...base, now: 1000 }), "plazo");
  assert.equal(L.roundOutcome({ ...base, equity: 4, cash: 4 }), "arruinado");
  assert.equal(L.roundOutcome({ ...base, equity: 4, cash: 0, holding: true }), null, "con posición abierta aún puede remontar");
});

const tk = (pair, ch24h, price = 1, high24h = 1.05, volume24h = 100_000) => ({ pair, base: pair.replace(/EUR$/, ""), price, ch24h, high24h, low24h: price * 0.8, volume24h });

test("kamikazes: cada estilo mira candidatos distintos (y descarta los poco líquidos)", () => {
  const list = [tk("AEUR", 25, 1, 1.02), tk("BEUR", 12, 1, 1.0), tk("CEUR", -18, 1, 1.4), tk("DEUR", 40, 1, 1.01, 5_000), tk("EEUR", -6, 1, 1.1)];
  assert.deepEqual(L.prefilter("impulso", list).map((t) => t.pair), ["AEUR", "BEUR"], "D tiene poco volumen");
  assert.deepEqual(L.prefilter("rupturas", list).map((t) => t.pair), ["BEUR", "AEUR"], "los más pegados a su máximo");
  assert.deepEqual(L.prefilter("rebotes", list).map((t) => t.pair), ["CEUR", "EEUR"]);
});

test("kamikazes: métricas con velas horarias", () => {
  const bars = Array.from({ length: 72 }, (_, i) => ({ t: i, o: 10, h: i === 30 ? 15 : 10.5, l: 9.5, c: i >= 68 ? 12 : 10, qv: i >= 68 ? 400 : 100 }));
  const m = L.metricsOf(tk("XEUR", 20, 12), bars);
  assert.equal(m.high3d, 15);
  assert.ok(Math.abs(m.fromHigh3d - -20) < 1e-9);
  assert.ok(Math.abs(m.ch4h - 20) < 1e-9, "hace 4 h cerraba a 10");
  assert.equal(m.ch1h, 0);
  assert.ok(Math.abs(m.volSurge - 4) < 1e-9, "las últimas 4 h, 4 veces lo normal");
  assert.deepEqual(L.parseKlines([[1, "1", "2", "0.5", "1.5", "10", 2, "15"], "basura"]), [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, qv: 15 }]);
});

test("kamikazes: salidas sin IA y stop protegido a partir de +30 %", () => {
  assert.equal(L.exitNow({ stop: 9, target: 15 }, 8.9), "stop");
  assert.equal(L.exitNow({ stop: 9, target: 15 }, 15.2), "objetivo");
  assert.equal(L.exitNow({ stop: 9, target: 15 }, 12), null);
  assert.equal(L.protectedStop({ entry: 10, stop: 8 }, 13), 10);
  assert.equal(L.protectedStop({ entry: 10, stop: 8 }, 12.9), 8);
  assert.equal(L.protectedStop({ entry: 10, stop: 11 }, 14), 11, "nunca lo baja");
});

test("kamikazes: cuándo decide la IA (y la pausa tras una pérdida)", () => {
  const b = { now: 10 * 60 * 60_000, holding: false, lastAt: null, lastPrice: null, price: null, cooldownUntil: null, idleMin: 30, holdMin: 60 };
  assert.equal(L.decisionDue(b), true, "nunca ha decidido");
  assert.equal(L.decisionDue({ ...b, lastAt: b.now - 20 * 60_000 }), false);
  assert.equal(L.decisionDue({ ...b, lastAt: b.now - 31 * 60_000 }), true);
  assert.equal(L.decisionDue({ ...b, holding: true, lastAt: b.now - 40 * 60_000, lastPrice: 10, price: 10.5 }), false);
  assert.equal(L.decisionDue({ ...b, holding: true, lastAt: b.now - 10 * 60_000, lastPrice: 10, price: 11 }), true, "+10 % desde la última decisión");
  assert.equal(L.decisionDue({ ...b, cooldownUntil: b.now + 1 }), false);
});

test("kamikazes: la decisión de la IA se valida antes de ejecutarla", () => {
  const ctx = { holding: null, candidates: [{ pair: "SOLEUR", price: 100 }], price: () => 100 };
  const buy = (extra = {}) => ({ action: "comprar", symbol: "SOLEUR", conviction: 4, stop: 80, target: 150, rationale: "r", risks: "", ...extra });
  assert.deepEqual(L.checkDecision(buy(), ctx), { action: "comprar", pair: "SOLEUR", stop: 80, target: 150 });
  assert.equal(L.checkDecision(buy({ symbol: "DOGEEUR" }), ctx).action, "rechazada", "fuera de los candidatos");
  assert.match(L.checkDecision(buy({ stop: 99 }), ctx).reason, /stop/);
  assert.match(L.checkDecision(buy({ stop: 50 }), ctx).reason, /stop/, "más de un 40 % es demasiado");
  assert.match(L.checkDecision(buy({ target: 105 }), ctx).reason, /objetivo/);
  const holding = { ...ctx, holding: { pair: "SOLEUR", entry: 90, stop: 80, target: 150 } };
  assert.equal(L.checkDecision(buy(), holding).action, "rechazada", "todo a una carta: una sola posición");
  assert.deepEqual(L.checkDecision({ ...buy(), action: "mantener", stop: 85, target: 0 }, holding), { action: "mantener", stop: 85, target: null });
  assert.deepEqual(L.checkDecision({ ...buy(), action: "mantener", stop: 70, target: 160 }, holding), { action: "mantener", stop: null, target: 160 }, "el stop nunca baja");
  assert.equal(L.checkDecision({ ...buy(), action: "vender" }, ctx).action, "rechazada");
  assert.equal(L.allInQuantity(20, 100, { commissionPct: 0.1, slippageBps: 15 }), 0.198503, "todo el efectivo con margen para comisión y deslizamiento");
});
