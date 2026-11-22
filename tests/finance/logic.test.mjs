// CRS Finance: ciclo, significado de los movimientos, recurrentes, proyección y lectura de extractos.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "../trading/helpers.mjs";

const L = load("lib/finance/logic.ts");
const C = load("lib/finance/categories.ts");
const P = load("lib/finance/parse.ts");

const tx = (id, account, date, amount, description, kind = "gasto", category = "otros_gastos", extra = {}) => ({
  id, accountId: account, date, amount, description, counterparty: null, counterpartyIbanHash: null,
  category, kind, source: "ia", extraordinary: false, transferPairId: null, ...extra,
});

test("Inicio móvil: los cuatro periodos suman gastos e ingresos sin contar traspasos", () => {
  const movements = [
    tx("1", "S", "2026-11-18", 2000, "Nómina", "ingreso"),
    tx("2", "S", "2026-11-17", -85, "Supermercado"),
    tx("3", "R", "2026-11-17", -150, "Traspaso", "interna"),
    tx("4", "S", "2026-11-16", 20, "Reembolso", "devolucion"),
    tx("5", "S", "2026-11-13", 50, "Regalo", "regalo"),
    tx("6", "S", "2026-10-22", -100, "Compra anterior"),
    tx("7", "S", "2026-09-05", -300, "Gasto septiembre"),
  ];
  const result = L.cashflowPeriods(movements, "2026-11-18");
  assert.equal(result["7D"].points.length, 7);
  assert.equal(result["7D"].income, 2050);
  assert.equal(result["7D"].expenses, 65);
  assert.equal(result["7D"].net, 1985);
  assert.equal(result["1M"].points.length, 5);
  assert.equal(result["1M"].expenses, 165);
  assert.equal(result["6M"].points.length, 6);
  assert.equal(result["6M"].expenses, 465);
  assert.equal(result["1A"].points.length, 12);
});

test("ciclo del 25 al 24: el 17 de noviembre cae en el ciclo que empezó el 25 de octubre", () => {
  assert.deepEqual(L.cycleFor("2026-11-17", 25), { start: "2026-10-25", end: "2026-11-24", label: "25 oct – 24 nov" });
  assert.equal(L.cycleFor("2026-11-25", 25).start, "2026-11-25");
  assert.equal(L.cycleFor("2026-01-10", 25, -1).start, "2025-11-25");
  assert.deepEqual(L.cycleFor("2026-02-10", 1), { start: "2026-02-01", end: "2026-02-28", label: "feb 2026" });
});

test("clave de comercio sin tarjetas, fechas ni ruido", () => {
  assert.equal(L.merchantKey("COMPRA TARJ. 5402XXXX1234 MERCADONA S.A. 12/11/2026"), "mercadona");
  assert.equal(L.merchantKey("Pago movil en NETFLIX.COM, Madrid"), "netflix.com");
});

test("las recomendaciones de seguros excluyen inversión y distinguen renovaciones semestrales", () => {
  const movements = [
    tx("occident", "S", "2026-10-14", -70, "OCCIDENT GCO Inv.multifondos 10-10-26 al 10-11-26", "gasto", "seguros"),
    tx("occident-reciente", "S", "2026-11-17", -70, "RECIBO OCCIDENT GCO SEGU Y REAS", "gasto", "seguros"),
    tx("mapfre-abril", "S", "2026-04-13", -175.01, "MAPFRE SEGURO AUTO MAT 1234ABC", "gasto", "seguros"),
    tx("mapfre-octubre", "S", "2026-10-14", -174.99, "MAPFRE SEGURO AUTO MAT 1234ABC", "gasto", "seguros"),
    tx("mapfre-otro", "S", "2026-07-20", -874.05, "MAPFRE SEGURO AUTO MAT 5678XYZ", "gasto", "seguros"),
    tx("verti", "S", "2026-08-13", -619.02, "VERTI ASEGURADORA", "gasto", "seguros"),
  ];
  const proposals = L.insuranceForecastCandidates(movements, "2026-11-19", "2027-11-30");
  assert.equal(proposals.length, 3);
  const semi = proposals.find((s) => s.cadence === "semestral");
  assert.equal(semi.startDate, "2027-04-14");
  assert.equal(semi.evidence, 2);
  assert.equal(semi.sourceTx.id, "mapfre-octubre");
  assert.equal(proposals.some((s) => s.sourceTx.id === "occident"), false);
  assert.equal(proposals.some((s) => s.startDate === "2027-08-13"), true);
});

test("una recarga de Revolut desde Santander se empareja como transferencia interna y no un gasto", () => {
  const pairs = L.findTransferPairs([
    tx("a", "santander", "2026-10-01", -200, "Transferencia a Revolut"),
    tx("b", "revolut", "2026-10-02", 200, "Top-up from Santander"),
    tx("c", "santander", "2026-10-03", -200, "Otra salida"),
    tx("d", "santander", "2026-10-03", 200, "Misma cuenta: no es pareja"),
  ]);
  assert.deepEqual(pairs, [{ outId: "a", inId: "b" }]);
});

test("palabras clave: súper, nómina, comida a domicilio e inversión", () => {
  assert.equal(L.keywordClass({ description: "COMPRA MERCADONA", counterparty: null, amount: -30 }).category, "alimentacion");
  assert.equal(L.keywordClass({ description: "NOMINA ACME SL", counterparty: null, amount: 2000 }).kind, "ingreso");
  assert.equal(L.keywordClass({ description: "Uber Eats pedido", counterparty: null, amount: -20 }).category, "comida_domicilio");
  assert.equal(L.keywordClass({ description: "Transferencia a Bitvavo", counterparty: null, amount: -100 }).kind, "ahorro");
  assert.equal(L.keywordClass({ description: "A cuenta de inversión", counterparty: null, amount: -1000 }).kind, "ahorro");
  assert.equal(L.keywordClass({ description: "NOMINA", counterparty: null, amount: -5 }), null, "una «nómina» que sale no es un ingreso");
});

test("videojuegos: categoría de gasto y tiendas de juegos, sin confundir Netflix", () => {
  assert.equal(C.isCategory("videojuegos"), true);
  assert.equal(C.categoryLabel("videojuegos"), "Videojuegos");
  assert.equal(L.keywordClass({ description: "STEAMGAMES.COM", counterparty: null, amount: -29.99 })?.category, "videojuegos");
  assert.equal(L.keywordClass({ description: "PLAYSTATION STORE", counterparty: null, amount: -49.99 })?.category, "videojuegos");
  assert.equal(L.keywordClass({ description: "NETFLIX.COM", counterparty: null, amount: -12.99 })?.category, "suscripciones");
});

test("los selectores de categorías están ordenados alfabéticamente", () => {
  const labels = C.SELECTABLE_CATEGORIES.map((c) => c.label);
  const gastos = C.EXPENSE_CATEGORIES.map((c) => c.label);
  const alphabetical = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });
  assert.deepEqual(labels, [...labels].sort(alphabetical));
  assert.deepEqual(gastos, [...gastos].sort(alphabetical));
  assert.equal(C.EXPENSE_CATEGORIES.some((c) => c.key === "videojuegos"), true);
});

test("la nómina de Endesa no es «suministros» y una entrada con nombre de comercio se deja a la IA", () => {
  const n = L.keywordClass({ description: "TRANSFERENCIA DE ENDESA X WAY S.L., CONCEPTO Sueldo/Salar.", counterparty: null, amount: 2894.77 });
  assert.deepEqual([n.category, n.kind], ["nomina", "ingreso"]);
  assert.equal(L.keywordClass({ description: "TRANSFERENCIA RECIBIDA // Hipoteca periodica", counterparty: null, amount: 850 }), null);
  assert.equal(L.keywordClass({ description: "Refund from Zalando Payments", counterparty: null, amount: 139.9 }).kind, "devolucion");
  assert.equal(L.keywordClass({ description: "COMPRA Revolut, Dublin, TARJETA , COMISION 0,00", counterparty: null, amount: -400 })?.category ?? null, null);
});

test("traspasos a uno mismo: el titular sí, un familiar con apellidos parecidos no", () => {
  const holder = L.holderTokens(["MIGUEL LOBO GOMEZ CALERO", "Miguel Lobo Gómez-Calero"]);
  assert.equal(L.isOwnName("LOBO GOMEZ-CALERO MIGUEL", holder), true);
  assert.equal(L.isOwnName("TRANSFERENCIA REALIZADA // Miguel Lobo Gomez-Calero", holder), true);
  assert.equal(L.isOwnName("JOSE MIGUEL LOBO CANTOS", holder), false);
  assert.equal(L.isOwnName("MIGUEL SANTANDER", holder), false);
  const banks = new Set(["bbva", "santander", "revolut"]);
  assert.equal(L.isOwnBankTransfer("Transferencia A Favor De Miguel Bbva Concepto: Hipoteca Periódica", holder, banks), true);
  assert.equal(L.isOwnBankTransfer("TRANSFERENCIA INMEDIATA A FAVOR DE MIGUEL BBVA CONCEPTO IBi", holder, banks), true);
  assert.equal(L.isOwnBankTransfer("Transferencia A Favor De Juzgado Penal 10", holder, banks), false);
  assert.equal(L.isOwnBankTransfer("Bizum A Favor De Jose Miguel Lobo Cantos", holder, banks), false);
});

test("las reglas del usuario ganan y la más concreta manda", () => {
  const rules = [
    { id: "1", pattern: "bizum", category: "regalos", kind: "gasto", extraordinary: false },
    { id: "2", pattern: "bizum ana", category: "vivienda", kind: "gasto", extraordinary: false },
  ];
  assert.equal(L.matchRule({ description: "BIZUM ANA alquiler", counterparty: null }, rules).id, "2");
});

function history() {
  const rows = [];
  for (let m = 6; m <= 10; m++) rows.push(tx(`n${m}`, "S", `2026-${String(m).padStart(2, "0")}-05`, -12.99, "NETFLIX.COM", "gasto", "suscripciones"));
  for (let m = 6; m <= 10; m++) rows.push(tx(`s${m}`, "S", `2026-${String(m).padStart(2, "0")}-27`, 2100, "NOMINA ACME", "ingreso", "nomina"));
  for (let d = 1; d < 140; d += 3) rows.push(tx(`v${d}`, "S", L.addDays("2026-07-01", d), -15, "MERCADONA", "gasto", "alimentacion"));
  return rows;
}

test("recurrentes: nómina y Netflix sí; las compras del súper no", () => {
  const r = L.detectRecurring(history(), "2026-11-17");
  assert.deepEqual(r.map((x) => [x.key, x.frequency]).sort(), [["netflix.com", "mensual"], ["nomina acme", "mensual"]]);
  const netflix = r.find((x) => x.key === "netflix.com");
  assert.equal(netflix.amount, -12.99);
  assert.equal(netflix.active, true);
  assert.equal(L.detectRecurring(history(), "2026-11-17", new Set(["netflix.com"])).find((x) => x.key === "netflix.com").active, false, "cancelada por el usuario");
});

test("resumen: las internas y el ahorro no son gasto; las devoluciones restan; los extraordinarios se separan", () => {
  const c = L.cycleFor("2026-11-17", 25);
  const s = L.summarize([
    tx("1", "S", "2026-11-01", 2000, "Nómina", "ingreso", "nomina"),
    tx("2", "S", "2026-11-02", -100, "A Revolut", "interna", "transferencia_interna"),
    tx("3", "R", "2026-11-02", 100, "De Santander", "interna", "transferencia_interna"),
    tx("4", "S", "2026-11-03", -300, "Bitvavo", "ahorro", "ahorro_inversion"),
    tx("5", "S", "2026-11-04", -80, "Zapatillas", "gasto", "compras"),
    tx("6", "S", "2026-11-06", 30, "Devolución zapatillas", "devolucion", "compras"),
    tx("7", "S", "2026-11-07", -500, "Sofá", "gasto", "compras", { extraordinary: true }),
    tx("8", "S", "2026-11-08", 50, "Bizum cumple", "regalo", "regalo_recibido"),
  ], c);
  assert.equal(s.income, 2000);
  assert.equal(s.gifts, 50);
  assert.equal(s.expenses, 550);
  assert.equal(s.extraordinaryExpenses, 500);
  assert.equal(s.savedToInvestments, 300);
  assert.equal(s.net, 1500);
  assert.deepEqual(s.byCategory, [{ category: "compras", amount: 550 }]);
});

test("detalle de Inicio: precarga todo el historial por ciclos, sin internas y con devoluciones", () => {
  const cycle = L.cycleFor("2026-11-18", 25);
  const movements = [
    tx("a", "S", "2026-11-02", -80, "Alquiler", "gasto", "vivienda"),
    tx("b", "S", "2026-11-16", 20, "Devolución", "devolucion", "vivienda"),
    tx("c", "R", "2026-11-17", -50, "Traspaso", "interna", "vivienda"),
    tx("d", "S", "2026-10-23", -100, "Ciclo anterior", "gasto", "vivienda"),
    tx("e", "S", "2026-11-18", -12, "Cena", "gasto", "restaurantes"),
    tx("f", "S", "2026-09-20", -45, "Agua", "gasto", "vivienda"),
  ];
  const grouped = L.expenseHistoryByCycle(movements, 25);
  assert.deepEqual(grouped.map((c) => c.start), ["2026-10-25", "2026-09-25", "2026-08-25"]);
  assert.deepEqual(grouped[0].items.map((t) => t.id), ["e", "b", "a"]);
  assert.deepEqual(grouped[0].items.filter((t) => t.category === "vivienda").map((t) => t.amount), [20, -80]);
  assert.deepEqual(grouped[1].items.map((t) => t.id), ["d"]);
  assert.deepEqual(grouped[2].items.map((t) => t.id), ["f"]);
  assert.equal(L.summarize(movements, cycle).byCategory.find((c) => c.category === "vivienda").amount, 60);
});

test("proyección: saldo de hoy + cobros − recibos − gasto variable medio; ¿me lo puedo permitir?", () => {
  const txs = history();
  const rec = L.detectRecurring(txs, "2026-11-17");
  const keys = new Set(rec.map((r) => r.key));
  const hist = [1, 2, 3].map((o) => L.summarize(txs, L.cycleFor("2026-11-17", 25, -o), keys));
  const p = L.projectCycle({ txs, today: "2026-11-17", startDay: 25, liquidity: 3000, recurring: rec, savingsGoal: 500, history: hist });
  assert.equal(p.daysLeft, 7);
  assert.equal(p.pending.length, 0, "la nómina del 27 cae en el ciclo siguiente");
  assert.ok(p.variableDaily > 4 && p.variableDaily < 6);
  assert.equal(p.projectedEndBalance, Math.round((3000 - p.expectedVariable) * 100) / 100);
  assert.equal(L.affordability(p, 300).verdict, "si");
  assert.equal(L.affordability(p, p.projectedNet - 100).verdict, "con_ajustes");
  assert.equal(L.affordability(p, 99_999).verdict, "no");
});

test("alias y subcategoría de un recibo se muestran en su previsión sin alterar los importes", () => {
  const today = "2026-11-19";
  const txs = [
    tx("agua-1", "S", "2026-09-10", -28, "RECIBO ALJARAFESA", "gasto", "suministros", { alias: "Agua de casa", subcategory: "Agua" }),
    tx("agua-2", "S", "2026-10-10", -29, "RECIBO ALJARAFESA", "gasto", "suministros", { alias: "Agua de casa", subcategory: "Agua" }),
    tx("agua-3", "S", "2026-11-10", -29, "RECIBO ALJARAFESA", "gasto", "suministros", { alias: "Agua de casa", subcategory: "Agua" }),
  ];
  const recurring = L.detectRecurring(txs, today);
  assert.equal(recurring.length, 1);
  assert.equal(recurring[0].label, "Agua de casa");
  assert.equal(recurring[0].subcategory, "Agua");
  const point = { cycle: L.cycleFor("2026-12-05", 1), openingBalance: 1000, variableExpenses: 0, estimatedSalary: 0 };
  const weeks = L.forecastCycleWeeks({ point, recurring, items: [], today });
  const water = weeks.flatMap((week) => week.events).find((event) => event.label === "Agua de casa");
  assert.equal(water?.category, "suministros");
  assert.equal(water?.subcategory, "Agua");
  assert.equal(water?.amount, 29);
});

test("Inicio: previsión de 12 ciclos suma ingresos conocidos, recibos y gasto variable, sin regalos", () => {
  const today = "2026-11-17";
  const txs = [...history(), tx("regalo", "S", "2026-11-10", 300, "Cumpleaños", "regalo", "regalo_recibido")];
  const recurring = L.detectRecurring(txs, today);
  const keys = new Set(recurring.map((r) => r.key));
  const summaries = [1, 2, 3].map((i) => L.summarize(txs, L.cycleFor(today, 25, -i), keys));
  const current = L.summarize(txs, L.cycleFor(today, 25), keys);
  const projection = L.projectCycle({ txs, today, startDay: 25, liquidity: 3000, recurring, savingsGoal: null, history: summaries });
  const result = L.forecastCashflow({ txs, today, startDay: 25, recurring, history: summaries, current, projection, liquidity: 3000 });
  assert.equal(result.points.length, 12);
  assert.equal(result.points[0].net, Math.round((projection.pendingIncome - projection.pendingFixed - projection.expectedVariable) * 100) / 100, "no se deben sumar ingresos ya cobrados al saldo de hoy");
  assert.equal(result.points[0].openingBalance, 3000);
  assert.equal(result.points[0].closingBalance, projection.projectedEndBalance);
  assert.equal(result.points[1].cycle.start, "2026-11-25");
  assert.equal(result.points[1].income, 2100, "solo se repite la nómina; no el regalo de cumpleaños");
  assert.equal(result.points[1].knownExpenses, 12.99, "se cuenta Netflix una sola vez");
  assert.ok(result.points[1].expenses > result.points[1].knownExpenses, "se añade el gasto variable histórico");
  assert.equal(result.points[1].net, Math.round((result.points[1].income - result.points[1].expenses) * 100) / 100);
  const items = [
    { id: "plan", title: "Regalos", kind: "gasto", amount: 250, startDate: "2026-12-10", endDate: null, source: "manual", sourceKey: null },
  ];
  const planned = L.forecastCashflow({ txs, today, startDay: 25, recurring, history: summaries, current, projection, liquidity: 3000, items });
  assert.equal(planned.points[1].expenses, result.points[1].expenses + 250);
  assert.equal(planned.points[1].closingBalance, Math.round((result.points[1].closingBalance - 250) * 100) / 100);
  assert.equal(planned.points[0].expenses, result.points[0].expenses, "los planes futuros no alteran movimientos previos");
  const weeks = L.forecastCycleWeeks({ point: planned.points[1], recurring, items, today });
  assert.equal(weeks.length, 5, "el ciclo de 30 días se divide en cuatro semanas y un tramo final");
  assert.equal(weeks[0].start, "2026-11-25");
  assert.equal(weeks.at(-1).end, "2026-12-24");
  assert.equal(weeks.reduce((sum, w) => sum + w.income, 0), planned.points[1].income);
  assert.equal(Math.round(weeks.reduce((sum, w) => sum + w.expenses, 0) * 100) / 100, planned.points[1].expenses);
  assert.equal(weeks.at(-1).closingBalance, planned.points[1].closingBalance);
  assert.equal(weeks.some((w) => w.events.some((e) => e.label === "Regalos" && e.date === "2026-12-10")), true);

  const netflix = recurring.find((r) => r.category === "suscripciones");
  let chargeDate = netflix.nextDate;
  while (chargeDate < planned.points[1].cycle.start) chargeDate = L.addDays(chargeDate, netflix.intervalDays);
  const exception = { id: "override", title: "Netflix", kind: "gasto", amount: 5.99, startDate: chargeDate,
    endDate: null, source: "manual", sourceKey: L.forecastOccurrenceKey(netflix, chargeDate) };
  const skippedOccurrences = new Set([exception.sourceKey]);
  const withoutCharge = L.forecastCashflow({ txs, today, startDay: 25, recurring, history: summaries, current, projection, liquidity: 3000,
    items, skippedOccurrences });
  assert.equal(withoutCharge.points[1].knownExpenses, planned.points[1].knownExpenses - 12.99, "omitir un recibo no afecta al gasto variable");
  assert.equal(withoutCharge.points[2].knownExpenses, planned.points[2].knownExpenses, "la excepción no altera el mes siguiente");
  const adjustedWeeks = L.forecastCycleWeeks({ point: withoutCharge.points[1], recurring, items, today, skippedOccurrences });
  const omitted = adjustedWeeks.flatMap((w) => w.events).find((e) => e.occurrenceKey === exception.sourceKey);
  assert.equal(omitted?.amount, 0);
  assert.equal(omitted?.modified, true);
  assert.equal(adjustedWeeks.at(-1).closingBalance, withoutCharge.points[1].closingBalance);
  const adjusted = L.forecastCashflow({ txs, today, startDay: 25, recurring, history: summaries, current, projection, liquidity: 3000,
    items: [...items, exception] });
  assert.equal(adjusted.points[1].knownExpenses, planned.points[1].knownExpenses - 7);
  const restored = L.forecastCashflow({ txs, today, startDay: 25, recurring, history: summaries, current, projection, liquidity: 3000, items });
  assert.equal(restored.points[1].knownExpenses, planned.points[1].knownExpenses, "al restaurar vuelve el importe habitual");
});

test("previsión: los imprevistos periódicos se repiten en sus fechas y se muestran como estimados", () => {
  const today = "2026-11-17";
  const txs = history();
  const recurring = L.detectRecurring(txs, today);
  const keys = new Set(recurring.map((r) => r.key));
  const summaries = [1, 2, 3].map((i) => L.summarize(txs, L.cycleFor(today, 25, -i), keys));
  const current = L.summarize(txs, L.cycleFor(today, 25), keys);
  const projection = L.projectCycle({ txs, today, startDay: 25, liquidity: 3000, recurring, savingsGoal: null, history: summaries });
  const input = { txs, today, startDay: 25, recurring, history: summaries, current, projection, liquidity: 3000 };
  const regular = L.forecastCashflow(input);
  const item = { id: "dinner", title: "Clases", kind: "gasto", amount: 80, startDate: "2026-11-28", endDate: null,
    source: "manual", sourceKey: "plan:mensual:00000000-0000-4000-8000-000000000001" };
  assert.equal(L.forecastPlanFrequency(item.sourceKey), "mensual");
  const planned = L.forecastCashflow({ ...input, items: [item] });
  assert.equal(planned.points[1].plannedExpenses, 80);
  assert.equal(planned.points[2].plannedExpenses, 80);
  assert.equal(planned.points[1].expenses, regular.points[1].expenses + 80);
  assert.equal(planned.points[1].fixedExpenses, regular.points[1].fixedExpenses);
  assert.equal(planned.points[1].estimatedExpenses, regular.points[1].estimatedExpenses + 80);
  const weeks = L.forecastCycleWeeks({ point: planned.points[1], recurring, today, items: [item] });
  assert.equal(weeks.flatMap((w) => w.events).filter((e) => e.planId === "dinner").length, 1);
  assert.equal(Math.round(weeks.reduce((total, w) => total + w.expenses, 0) * 100) / 100, planned.points[1].expenses);
  const endOfMonth = { ...item, startDate: "2027-01-31" };
  assert.deepEqual(L.forecastPlanOccurrences(endOfMonth, "2027-02-01", "2027-04-30"), ["2027-02-28", "2027-03-31", "2027-04-30"]);
  assert.deepEqual(L.forecastPlanOccurrences({ ...item, sourceKey: "plan:semanal:00000000-0000-4000-8000-000000000001",
    endDate: "2026-12-12" }, "2026-12-01", "2026-12-30"), ["2026-12-05", "2026-12-12"]);
});

test("Inicio: solo estima una nómina sin patrón recurrente cuando aparece en dos ciclos completos", () => {
  const today = "2026-11-17";
  const txs = [
    tx("a", "S", "2026-08-27", 2000, "SALARIO ENTRADA A", "ingreso", "nomina"),
    tx("b", "S", "2026-09-27", 2200, "PAGO EMPRESA B", "ingreso", "nomina"),
    tx("c", "S", "2026-10-27", 300, "BONO EXTRA", "ingreso", "otros_ingresos", { extraordinary: true }),
  ];
  const history = [1, 2, 3].map((i) => L.summarize(txs, L.cycleFor(today, 25, -i)));
  const current = L.summarize(txs, L.cycleFor(today, 25));
  const recurring = L.detectRecurring(txs, today);
  const projection = L.projectCycle({ txs, today, startDay: 25, liquidity: 1000, recurring, savingsGoal: null, history });
  const result = L.forecastCashflow({ txs, today, startDay: 25, recurring, history, current, projection });
  assert.equal(result.estimatedSalary, 2100);
  assert.equal(result.points[1].income, 2100);
  assert.equal(result.points[1].expenses, 0);
  assert.equal(result.hasExpectedIncome, true);
});

test("presupuestos: gastado, restante y aviso si va más rápido que el ciclo", () => {
  const c = L.cycleFor("2026-11-17", 25);
  const s = L.summarize([tx("1", "S", "2026-10-26", -600, "Súper", "gasto", "alimentacion")], c);
  const [b] = L.budgetStatus([{ id: "b", name: "Variables", categories: ["alimentacion"], amount: 650 }], s, "2026-10-30");
  assert.equal(b.spent, 600);
  assert.equal(b.remaining, 50);
  assert.equal(b.status, "atencion");
});

test("avisos: cargo duplicado", () => {
  const txs = [tx("1", "S", "2026-11-10", -49.9, "AMAZON MKTPLACE"), tx("2", "S", "2026-11-11", -49.9, "AMAZON MKTPLACE")];
  const c = L.summarize(txs, L.cycleFor("2026-11-17", 25));
  const alerts = L.detectAlerts({ txs, today: "2026-11-17", recurring: [], history: [], current: c, budgets: [] });
  assert.equal(alerts[0].title, "Posible cargo duplicado");
});

test("extractos: importes y fechas en formato español", () => {
  assert.equal(P.parseAmount("1.234,56"), 1234.56);
  assert.equal(P.parseAmount("-12,30 €"), -12.3);
  assert.equal(P.parseAmount("1,234.56"), 1234.56);
  assert.equal(P.parseAmount("(45.00)"), -45);
  assert.equal(P.parseDate("12/11/2026"), "2026-11-12");
  assert.equal(P.parseDate("2026-11-12 10:22:33"), "2026-11-12");
  assert.equal(P.parseDate(46338), "2026-11-12");
});

test("extractos: columnas de Santander (importe) y de cargo/abono", () => {
  const santander = [["Movimientos de cuenta"], ["Fecha Operación", "Fecha Valor", "Concepto", "Importe", "Saldo"], ["12/11/2026", "12/11/2026", "COMPRA MERCADONA", "-23,40", "1.000,00"]];
  const found = P.detectColumns(santander);
  assert.deepEqual(P.rowsFromTable(santander, found), [{ date: "2026-11-12", description: "COMPRA MERCADONA", amount: -23.4 }]);
  const debe = [["Fecha", "Descripción", "Cargo", "Abono"], ["01/11/2026", "Nómina", "", "2.000,00"], ["02/11/2026", "Luz", "45,10", ""]];
  assert.deepEqual(P.rowsFromTable(debe, P.detectColumns(debe)).map((r) => r.amount), [2000, -45.1]);
});

test("extractos de Revolut: se saltan revertidos y movimientos de huchas", () => {
  const rows = [
    ["Type", "Product", "Started Date", "Completed Date", "Description", "Amount", "Fee", "Currency", "State", "Balance"],
    ["CARD_PAYMENT", "Current", "2026-03-02 10:00:00", "2026-03-03 09:00:00", "Mercadona", "-23.40", "0.00", "EUR", "COMPLETED", "100"],
    ["CARD_PAYMENT", "Current", "2026-03-04 10:00:00", "", "Amazon", "-50.00", "0.00", "EUR", "REVERTED", ""],
    ["TRANSFER", "Savings", "2026-03-05 10:00:00", "2026-03-05 10:00:00", "To pocket", "-200.00", "0.00", "EUR", "COMPLETED", "300"],
  ];
  assert.deepEqual(P.rowsFromTable(rows, P.detectColumns(rows)), [{ date: "2026-03-02", description: "Mercadona", amount: -23.4 }]);
});

test("ciclo según el día real de cobro", () => {
  const rule = { day: 25, adjust: true };
  // 25 oct 2026 es domingo → se cobra el viernes 23; 25 nov es miércoles.
  assert.deepEqual(L.cycleFor("2026-11-17", rule), { start: "2026-10-23", end: "2026-11-24", label: "23 oct – 24 nov" });
  assert.equal(L.cycleFor("2026-10-23", rule).start, "2026-10-23");
  assert.equal(L.cycleFor("2026-10-22", rule).start, "2026-09-25");
  // 25 dic es festivo (viernes) → jueves 24.
  assert.equal(L.cycleFor("2026-12-24", rule).start, "2026-12-24");
  assert.equal(L.cycleFor("2026-11-30", rule, 1).start, "2026-12-24");
  // La nómina real manda sobre la regla.
  const paydays = L.paydaysFrom([{ date: "2026-08-24", kind: "ingreso", category: "nomina", amount: 2500 }, { date: "2026-08-03", kind: "ingreso", category: "nomina", amount: 50 }], 25);
  assert.deepEqual(paydays, { "2026-08": "2026-08-24" });
  assert.equal(L.cycleFor("2026-08-24", { ...rule, paydays }).start, "2026-08-24");
  assert.equal(L.cycleFor("2026-08-24", { ...rule, paydays }, -1).end, "2026-08-23");
  // Un número sigue funcionando como antes.
  assert.deepEqual(L.cycleFor("2026-11-17", 1), { start: "2026-11-01", end: "2026-11-30", label: "nov 2026" });
});

test("periodo elegido", () => {
  const rule = { day: 25, adjust: true };
  const six = L.resolvePeriod(L.cleanView({ unit: "mes", range: "6" }), "2026-11-17", rule, "2025-01-01");
  assert.equal(six.buckets.length, 6);
  assert.equal(six.from, "2026-06-01");
  assert.equal(six.to, "2026-11-30");
  const year = L.resolvePeriod(L.cleanView({ unit: "mes", range: "anio" }), "2026-11-17", rule, null);
  assert.equal(year.buckets.length, 11);
  const custom = L.resolvePeriod(L.cleanView({ unit: "ciclo", range: "custom", from: "2026-11-10", to: "2026-09-01" }), "2026-11-17", rule, null);
  assert.equal(custom.from, "2026-09-01");
  assert.equal(custom.to, "2026-11-10");
  assert.equal(custom.buckets.length, 3);
  assert.equal(custom.buckets[0].start, "2026-09-01");
  assert.equal(L.cleanView({ range: "custom" }).range, "actual");
});

test("Categorías nuevas por comercio: comida a domicilio, moda y mascotas antes que las genéricas", () => {
  const k = (description) => L.keywordClass({ description, counterparty: null, amount: -10 })?.category;
  assert.equal(k("Glovo 04oct Sqsm1a1d"), "comida_domicilio");
  assert.equal(k("Uber   * Eats Pending"), "comida_domicilio");
  assert.equal(k("Uber   *one Membership") === "comida_domicilio", false);
  assert.equal(k("Zara Sevilla Airesur"), "moda");
  assert.equal(k("Zalando Payments"), "moda");
  assert.equal(k("COMPRA H&M MADRID"), "moda");
  assert.equal(k("Clinica Veterinaria Aljarafe"), "mascotas");
  assert.equal(k("Farmacia Lda. Garcia"), "salud");
  assert.equal(k("Bar Borbolla"), "restaurantes");
  assert.equal(k("AMAZON MKTPLACE"), "compras");
});
