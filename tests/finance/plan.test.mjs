// CRS Finance · Planificación: cuadre, semanas del ciclo, límite semanal, transferencias y deseos.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "../trading/helpers.mjs";

const P = load("lib/finance/plan.ts");

const tx = (id, account, date, amount, kind = "gasto", category = "ocio", extra = {}) => ({
  id, accountId: account, date, amount, description: id, counterparty: null, counterpartyIbanHash: null,
  category, kind, source: "ia", extraordinary: false, transferPairId: null, ...extra,
});
const cycle = { start: "2026-11-25", end: "2026-12-24", label: "nov–dic" };

test("Semanas de lunes a domingo recortadas al ciclo", () => {
  const w = P.cycleWeeks(cycle);
  assert.deepEqual(w[0], { start: "2026-11-25", end: "2026-11-29", days: 5 }); // miércoles → domingo
  assert.equal(w[1].start, "2026-11-30");
  assert.equal(w.at(-1).end, "2026-12-24");
  assert.equal(w.reduce((s, x) => s + x.days, 0), 30);
});

test("Límite semanal: lo que sobra o te pasas se reparte en las semanas siguientes", () => {
  const b = { categories: ["ocio", "restaurantes"], amount: 300 };
  const txs = [
    tx("a", "R", "2026-11-26", -20),
    tx("b", "B", "2026-11-28", -30, "gasto", "restaurantes"), // otra cuenta: cuenta por categoría
    tx("c", "R", "2026-11-27", -500, "gasto", "vivienda"), // otra categoría: no cuenta
    tx("d", "R", "2026-11-27", -100, "interna", "transferencia_interna"), // traspaso: no cuenta
    tx("e", "R", "2026-12-01", -120),
    tx("f", "R", "2026-12-02", 20, "devolucion"),
  ];
  const weeks = P.budgetWeeks(b, txs, cycle, "2026-12-02");
  assert.equal(weeks[0].limit, 50); // 300 × 5/30
  assert.equal(weeks[0].spent, 50);
  assert.equal(weeks[0].status, "cerca");
  assert.equal(weeks[1].limit, 70); // (300 − 50) × 7/25
  assert.equal(weeks[1].spent, 100);
  assert.equal(weeks[1].status, "superado");
  assert.equal(weeks[1].current, true);
  assert.equal(weeks[2].status, "previsto");
  assert.equal(weeks[2].limit, 58.33); // (300 − 150) × 7/18 → te pasaste: menos límite
});

test("Cuadre del plan con partidas fijas o, si no hay, con los fijos detectados", () => {
  const budgets = [{ id: "1", name: "Ocio", categories: [], amount: 650, kind: "variable" }];
  const a = P.planBalance({ expectedIncome: null, detectedIncome: 2000, savingsGoal: 500, budgets, detectedFixed: 700 });
  assert.equal(a.fixedSource, "detectado");
  assert.equal(a.unassigned, 150);
  const b = P.planBalance({ expectedIncome: 1800, detectedIncome: 2000, savingsGoal: 500, budgets: [...budgets, { id: "2", name: "Casa", categories: [], amount: 800, kind: "fijo" }], detectedFixed: 700 });
  assert.equal(b.incomeSource, "manual");
  assert.equal(b.unassigned, -150);
});

test("Ingreso habitual: mediana de los últimos ciclos con ingresos", () => {
  const h = [{ income: 2100 }, { income: 0 }, { income: 1900 }, { income: 2600 }, { income: 1000 }];
  assert.equal(P.detectIncome(h), 2100);
  assert.equal(P.detectIncome([]), null);
});

test("Transferencias del día de cobro: por cuenta, sin la de nómina y descontando lo ya movido", () => {
  const budgets = [
    { id: "1", name: "Ocio", categories: [], amount: 650, kind: "variable", accountId: "R" },
    { id: "2", name: "Casa", categories: [], amount: 900, kind: "fijo", accountId: "B" },
    { id: "3", name: "Comida", categories: [], amount: 300, kind: "variable", accountId: "N" },
  ];
  const txs = [tx("t1", "R", "2026-11-25", 400, "interna", "transferencia_interna"), tx("t0", "R", "2026-11-20", 999, "interna")];
  const plan = P.transferPlan({ budgets, savingsGoal: 500, savingsAccountId: "S", incomeAccountId: "N", txs, cycle });
  assert.deepEqual(plan.map((p) => p.accountId), ["B", "R", "S"]);
  const r = plan.find((p) => p.accountId === "R");
  assert.equal(r.done, 400);
  assert.equal(r.pending, 250);
  assert.equal(plan.find((p) => p.accountId === "S").items[0], "Ahorro");
});

test("Deseos: lo que falta y si cabe en lo disponible", () => {
  const item = { id: "w", title: "Cascos", price: 200, saved: 50, url: null, priority: 1, purchasedAt: null, createdAt: "" };
  assert.equal(P.wishStatus(item, 160).affordableNow, true);
  assert.equal(P.wishStatus(item, 100).affordableNow, false);
  assert.equal(P.wishStatus(item, null).progress, 25);
});
