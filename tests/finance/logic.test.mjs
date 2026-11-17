// CRS Finance: ciclo, significado de los movimientos, recurrentes, proyección y lectura de extractos.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "../trading/helpers.mjs";

const L = load("lib/finance/logic.ts");
const P = load("lib/finance/parse.ts");

const tx = (id, account, date, amount, description, kind = "gasto", category = "otros_gastos", extra = {}) => ({
  id, accountId: account, date, amount, description, counterparty: null, counterpartyIbanHash: null,
  category, kind, source: "ia", extraordinary: false, transferPairId: null, ...extra,
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
  assert.equal(L.keywordClass({ description: "Uber Eats pedido", counterparty: null, amount: -20 }).category, "restaurantes");
  assert.equal(L.keywordClass({ description: "Transferencia a Bitvavo", counterparty: null, amount: -100 }).kind, "ahorro");
  assert.equal(L.keywordClass({ description: "NOMINA", counterparty: null, amount: -5 }), null, "una «nómina» que sale no es un ingreso");
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
