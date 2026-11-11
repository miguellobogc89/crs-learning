// Copia de agentes en el bróker: qué se compra, qué se omite y qué se vende.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const M = load("lib/trading/mirror/logic.ts");
const MIN = 60_000;
const now = 1_000 * MIN;
const pos = (o = {}) => ({ id: "p1", symbol: "SOL-EUR", quantity: 0.2, price: 100, openedAt: now - 3 * MIN, ...o });
const base = { legs: [], agentEquity: 20, budget: 20, startedAt: now - 60 * MIN, now };

test("mirror: kamikaze con todo dentro → todo el presupuesto", () => {
  const p = M.planMirror({ ...base, open: [pos()] });
  assert.equal(p.buys.length, 1);
  assert.equal(p.buys[0].amount, 20);
  assert.equal(p.sells.length, 0);
});

test("mirror: proporción del agente sobre tu presupuesto y nunca por encima de lo libre", () => {
  // Agente de 5.000 € que mete 1.000 € (20 %) → 20 % de 50 € = 10 €.
  const p = M.planMirror({ ...base, budget: 50, agentEquity: 5000, open: [pos({ quantity: 10, price: 100 })] });
  assert.equal(p.buys[0].amount, 10);
  // Dos balas del 50 % con 20 € → 10 € cada una; una tercera ya no cabe.
  const two = M.planMirror({ ...base, open: [pos({ id: "a", quantity: 0.1 }), pos({ id: "b", quantity: 0.1, openedAt: now - 2 * MIN }), pos({ id: "c", quantity: 0.1, openedAt: now - MIN })] });
  assert.deepEqual(two.buys.map((b) => [b.source.id, b.amount]), [["a", 10], ["b", 10]]);
  assert.match(two.skips[0].reason, /ya está invertido/);
});

test("mirror: omite lo tardío, lo anterior a empezar, lo que no es cripto y lo que no llega al mínimo", () => {
  const p = M.planMirror({
    ...base,
    open: [
      pos({ id: "tarde", openedAt: now - 45 * MIN }),
      pos({ id: "antes", openedAt: now - 90 * MIN }),
      pos({ id: "bolsa", symbol: "REP.MC" }),
      pos({ id: "poco", quantity: 0.01 }),
    ],
  });
  assert.equal(p.buys.length, 0);
  const why = Object.fromEntries(p.skips.map((s) => [s.source.id, s.reason]));
  assert.match(why.tarde, /más de 30 min/);
  assert.match(why.antes, /cuando empezaste/);
  assert.match(why.bolsa, /No es cripto/);
  assert.match(why.poco, /mínimo de Binance/);
});

test("mirror: vende cuando el agente sale y no repite tramos ya registrados", () => {
  const legs = [
    { sourceId: "p1", status: "abierta", amount: 20 },
    { sourceId: "p2", status: "omitida", amount: null },
    { sourceId: "p3", status: "cerrada", amount: 20 },
  ];
  const p = M.planMirror({ ...base, legs, open: [pos({ id: "p2" })] });
  assert.deepEqual(p.sells, ["p1"]);
  assert.equal(p.buys.length, 0, "p2 ya se omitió una vez: no se reintenta");
  const still = M.planMirror({ ...base, legs, open: [pos({ id: "p1" })] });
  assert.deepEqual(still.sells, []);
});

test("mirror: cantidad ajustada al paso de Binance y resultado neto de comisiones", () => {
  assert.equal(M.stepQuantity(20, 137.37, 0.001), 0.145);
  assert.equal(M.stepQuantity(20, 0.5, 1), 40);
  assert.equal(M.stepQuantity(0, 10, 0.1), 0);
  const r = M.legResult(1, 100, 110);
  assert.ok(Math.abs(r - (10 - 0.21)) < 1e-9);
});
