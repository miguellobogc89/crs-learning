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

test("Los extraordinarios (IBI…) no cuentan en la partida ni en la semana, pero se listan", () => {
  const b = { id: "1", name: "Casa", categories: ["impuestos"], amount: 200, kind: "fijo" };
  const txs = [tx("ibi", "B", "2026-11-26", -467.97, "gasto", "impuestos", { extraordinary: true }), tx("tgss", "B", "2026-11-30", -88.56, "gasto", "impuestos")];
  const [s] = P.planBudgetStatus([b], txs, cycle, "2026-12-01");
  assert.equal(s.spent, 88.56);
  assert.equal(s.kind, "fijo");
  assert.equal(P.budgetWeeks(b, txs, cycle, "2026-12-01")[0].spent, 0);
  const moves = P.budgetMovements(b, txs, cycle);
  assert.equal(moves.length, 2);
  assert.equal(moves.find((m) => m.id === "ibi").extraordinary, true);
});

test("Asistente: una partida fija por cuenta con los recibos marcados", () => {
  const fixed = P.fixedPartidas([
    { key: "hipoteca", label: "Hipoteca", category: "vivienda", monthly: 769.55, accountId: "B" },
    { key: "luz", label: "Luz", category: "suministros", monthly: 57.2, accountId: "B" },
    { key: "tgss", label: "TGSS", category: "impuestos", monthly: 88.56, accountId: "S" },
  ], (id) => (id === "B" ? "BBVA" : "Santander"));
  assert.equal(fixed.length, 2);
  assert.deepEqual(fixed[0], { name: "Fijos · BBVA", amount: 826.75, categories: ["vivienda", "suministros"], accountId: "B", recurringKeys: ["hipoteca", "luz"] });
});

test("Concepto de paquete: sin referencias que cambian en cada pago", () => {
  assert.equal(P.conceptKey("Glovo Glovo S1htdleu", "Glovo Glovo S1htdleu"), P.conceptKey("Glovo 04oct Sqsm1a1d", "Glovo 04oct Sqsm1a1d"));
  assert.equal(P.conceptKey("Cabify Es 2646sdctza87", "Cabify Es 2646sdctza87"), P.conceptKey("Cabify Es 26435g1pu8hz", "Cabify Es 26435g1pu8hz"));
  assert.equal(P.conceptKey("Freenow*ebbf70-2", "Freenow*ebbf70-2"), "freenow");
  assert.equal(P.conceptKey("COMPRA Nintendo CB1742648039, Frankfurt am, TARJETA 5489019360941800 , COMISION 0,00", null),
    P.conceptKey("COMPRA Nintendo CC1743127416, Frankfurt am, TARJETA 5489019360941800 , COMISION 0,00", null));
  assert.notEqual(P.conceptKey("Bar Borbolla", "Bar Borbolla"), P.conceptKey("Bar Epoca", "Bar Epoca"));
  assert.ok(P.inPackage({ conceptKeys: ["glovo"], txIds: [] }, { id: "x", concept: "glovo" }));
  assert.ok(P.inPackage({ conceptKeys: [], txIds: ["x"] }, { id: "x", concept: "otro" }));
});

test("Paquetes: cada cargo cuenta en un solo paquete y por ciclo", () => {
  const packs = [{ id: "A", conceptKeys: ["glovo"], txIds: [] }, { id: "B", conceptKeys: [], txIds: ["g2", "x"] }];
  const charges = [
    { id: "g1", concept: "glovo", date: "2026-11-26", amount: -20 },
    { id: "g2", concept: "glovo", date: "2026-11-27", amount: -10 },
    { id: "x", concept: "otro", date: "2026-11-28", amount: -5 },
    { id: "old", concept: "glovo", date: "2026-11-01", amount: -99 },
  ];
  const owner = P.packageOwners(packs, charges);
  assert.equal(owner.get("g2"), "A");
  assert.equal(P.packageSpend("A", owner, charges, cycle), 30);
  assert.equal(P.packageSpend("B", owner, charges, cycle), 5);
});

test("Objetivo del paquete: estado según el día del ciclo", () => {
  assert.equal(P.goalStatus(100, null, 10, 30), null);
  assert.equal(P.goalStatus(80, 100, 10, 30).status, "atencion"); // 80 % el día 10
  assert.equal(P.goalStatus(80, 100, 28, 30).status, "ok");
  assert.equal(P.goalStatus(120, 100, 28, 30).status, "superado");
  assert.equal(P.goalStatus(120, 100, 28, 30).remaining, -20);
});

test("Paquetes: solo consumo; traspasos y aportaciones a ahorro/inversión no entran", () => {
  assert.equal(P.isPackageCharge({ kind: "gasto", amount: -10 }), true);
  assert.equal(P.isPackageCharge({ kind: "gasto", amount: -0.2 }), true); // comisión: es gasto
  assert.equal(P.isPackageCharge({ kind: "ahorro", amount: -500 }), false);
  assert.equal(P.isPackageCharge({ kind: "interna", amount: -300 }), false);
  assert.equal(P.isPackageCharge({ kind: "devolucion", amount: 20 }), false);
});

test("Qué te está desviando: primero lo que se pasa, luego lo pendiente, y como mucho 3", () => {
  const g = (spent, goal, day) => P.goalStatus(spent, goal, day, 30);
  const ins = P.planInsights({
    packages: [
      { name: "Gasolina", goal: 120, current: 30, progress: g(30, 120, 27) },
      { name: "Tabaco", goal: 80, current: 96, progress: g(96, 80, 27) },
    ],
    unpackaged: { total: 186, count: 14 },
    saving: { saved: 412, goal: 500 },
    daysLeft: 3,
  });
  assert.equal(ins.length, 3);
  assert.equal(ins[0].tone, "danger");
  assert.match(ins[0].text, /^Tabaco: te has pasado 16,00 €/);
  assert.match(ins[1].text, /186,00 € gastados que no están en ningún paquete/);
  assert.equal(P.planInsights({ packages: [], unpackaged: { total: 0, count: 0 }, saving: { saved: 600, goal: 500 }, daysLeft: 3 }).length, 0);
});

test("Qué te está desviando: el ahorro negativo se dice, no se esconde como 0", () => {
  const [i] = P.planInsights({ packages: [], unpackaged: { total: 0, count: 0 }, saving: { saved: -732.94, goal: 500 }, daysLeft: 3 });
  assert.match(i.text, /has gastado 732,94 € más de lo que has ingresado/);
});

test("groupSummary: media a estas alturas, ritmo según tu historial y ahorro de 3 ciclos", () => {
  const c = (full, atDay) => ({ full: { restaurantes: full }, atDay: { restaurantes: atDay } });
  const cycles = [c(50, 50), c(100, 40), c(120, 60), c(80, 50), c(150, 0), c(150, 0), c(150, 0)];
  const s = P.groupSummary({ categories: ["restaurantes"], cycles, goal: 100, day: 10, totalDays: 30 });
  assert.equal(s.now, 50);
  assert.equal(s.avgAtDay, 50);
  assert.equal(s.vsAvg, 0);
  // Sueles llevar 50 de 100 a estas alturas → se espera la mitad del objetivo.
  assert.equal(s.expected, 50);
  assert.equal(s.status, "bien");
  assert.equal(s.saved3, 150);
  assert.deepEqual(s.trend, [150, 150, 150, 80, 120, 100, 50]);
});

test("groupSummary: sin historial reparte el objetivo de forma lineal y marca lo superado", () => {
  const one = [{ full: { ocio: 40 }, atDay: { ocio: 40 } }];
  const a = P.groupSummary({ categories: ["ocio"], cycles: one, goal: 90, day: 10, totalDays: 30 });
  assert.equal(a.expected, 30);
  assert.equal(a.status, "atento");
  assert.equal(a.vsAvg, null);
  assert.equal(a.saved3, null);
  const b = P.groupSummary({ categories: ["ocio"], cycles: one, goal: 30, day: 10, totalDays: 30 });
  assert.equal(b.status, "superado");
  assert.equal(b.left, -10);
  const n = P.groupSummary({ categories: ["ocio"], cycles: one, goal: null, day: 10, totalDays: 30 });
  assert.equal(n.status, null);
});

test("planDeviations: grupos de peor a mejor y, en uno de una sola categoría, las subcategorías que se mueven", () => {
  const c = (atDay, subAtDay = {}) => ({ full: atDay, atDay, subAtDay });
  const cycles = [
    c({ vivienda: 712, comida_domicilio: 90, restaurantes: 20, ocio: 30 }, { "vivienda/Hipoteca": 600, "vivienda/Seguro del hogar": 62, "vivienda/Comunidad": 50 }),
    c({ vivienda: 700, comida_domicilio: 40, restaurantes: 80, ocio: 30 }, { "vivienda/Hipoteca": 600, "vivienda/Seguro del hogar": 50, "vivienda/Comunidad": 50 }),
    c({ vivienda: 700, comida_domicilio: 40, restaurantes: 80, ocio: 30 }, { "vivienda/Hipoteca": 600, "vivienda/Seguro del hogar": 50, "vivienda/Comunidad": 50 }),
    c({ vivienda: 700, comida_domicilio: 40, restaurantes: 80, ocio: 30 }, { "vivienda/Hipoteca": 600, "vivienda/Seguro del hogar": 50, "vivienda/Comunidad": 50 }),
  ];
  const groups = [
    { id: "v", name: "Vivienda", categories: ["vivienda"], goal: null },
    { id: "d", name: "Comida a domicilio", categories: ["comida_domicilio"], goal: null },
    { id: "o", name: "Ocio", categories: ["restaurantes", "ocio"], goal: null },
  ];
  const r = P.planDeviations({ groups, cycles, day: 10, totalDays: 30 });
  assert.deepEqual(r.map((g) => [g.id, g.state]), [["d", "peor"], ["v", "estable"], ["o", "mejor"]]);
  const v = r.find((g) => g.id === "v");
  assert.equal(v.level, "subcategoria");
  assert.deepEqual(v.moved.map((i) => [i.label, i.diff, i.state]), [["Seguro del hogar", 12, "algo_peor"]]);
  assert.deepEqual(v.unchanged.map((i) => i.label), ["Hipoteca", "Comunidad"]);
  const o = r.find((g) => g.id === "o");
  assert.deepEqual(o.moved.map((i) => i.key), ["restaurantes"]);
  assert.deepEqual(o.unchanged.map((i) => i.key), ["ocio"]);
});

test("deviationOf: umbrales de estable, algo peor y peor", () => {
  assert.equal(P.deviationOf(105, 100).state, "estable");
  assert.equal(P.deviationOf(115, 100).state, "algo_peor");
  assert.equal(P.deviationOf(130, 100).state, "peor");
  assert.equal(P.deviationOf(70, 100).state, "mejor");
  assert.equal(P.deviationOf(30, 0).state, "algo_peor");
  assert.equal(P.deviationOf(60, 0).state, "peor");
});

test("Gráfico de Inicio: acumulado por categorías y grupos graduales frente a estancos", () => {
  assert.deepEqual(P.cumulative({ ocio: [10, 0, 5], luz: [50, 0, 0] }, ["ocio"], 3), [10, 10, 15]);
  assert.deepEqual(P.cumulative({ ocio: [10, 0, 5], luz: [50, 0, 0] }, null, 3), [60, 60, 65]);
  const c = (v) => ({ full: { vivienda: v, ocio: v / 3 + (v % 7) * 20 }, atDay: {} });
  const cycles = [c(0), { full: { vivienda: 700, ocio: 120 }, atDay: {} }, { full: { vivienda: 705, ocio: 300 }, atDay: {} }, { full: { vivienda: 698, ocio: 40 }, atDay: {} }];
  const prev = { vivienda: [700, ...Array(29).fill(0)], ocio: Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? 12 : 0)) };
  assert.equal(P.isGradual(["vivienda"], cycles, prev), false);
  assert.equal(P.isGradual(["ocio"], cycles, prev), true);
  assert.equal(P.isGradual(["vivienda"], cycles.slice(0, 2), prev), true);
});

test("calibrate: reparte lo que queda entre los flexibles según lo que sueles gastar, respeta fijos y candados", () => {
  const items = [
    { id: "fijos", base: 1200, fixed: true, locked: null },
    { id: "ocio", base: 400, fixed: false, locked: null },
    { id: "comida", base: 100, fixed: false, locked: null },
    { id: "moda", base: 200, fixed: false, locked: null },
  ];
  const r = P.calibrate({ income: 2400, saving: 500, items });
  // Quedan 700 para 700 de media: cada uno lo suyo.
  assert.deepEqual(r.amounts, { fijos: 1200, ocio: 400, comida: 100, moda: 200 });
  // Ahorrar 850: quedan 350 → la mitad a cada uno.
  const half = P.calibrate({ income: 2400, saving: 850, items });
  assert.deepEqual(half.amounts, { fijos: 1200, ocio: 200, comida: 50, moda: 100 });
  // Ocio con candado a 300: los 50 restantes se reparten entre comida y moda.
  const lock = P.calibrate({ income: 2400, saving: 850, items: items.map((i) => (i.id === "ocio" ? { ...i, locked: 300 } : i)) });
  assert.deepEqual(lock.amounts, { fijos: 1200, ocio: 300, comida: 15, moda: 30 });
  // No llega: flexibles a 0, falta y máximo ahorro posible.
  const short = P.calibrate({ income: 1500, saving: 500, items });
  assert.equal(short.shortfall, 200);
  assert.equal(short.amounts.ocio, 0);
  assert.equal(short.maxSaving, 300);
});

test("monthPlan: el ahorro es lo que queda tras lo inamovible, lo ajustable y el colchón de imprevistos", () => {
  const r = P.monthPlan({ income: 3000, fixed: [1200, 300], adjustable: [400, 100], unforeseen: 200 });
  assert.deepEqual(r, { fixed: 1500, adjustable: 500, unforeseen: 200, saving: 800 });
  assert.equal(P.monthPlan({ income: 1000, fixed: [900], adjustable: [200], unforeseen: 0 }).saving, -100);
});
