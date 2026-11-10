import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { matchInstrument, decideBracket, brokerQuantity } = load("lib/trading/broker/logic.ts");

const item = (ticker, extra = {}) => ({ ticker, name: ticker, shortName: null, isin: null, currency: "EUR", type: "STOCK", ...extra });

test("vinculación: ticker de Madrid, ISIN y casos dudosos", () => {
  const catalog = [
    item("IBEe_EQ", { name: "Iberdrola", isin: "ES0144580Y14" }),
    item("SANe_EQ", { name: "Banco Santander", isin: "ES0113900J37" }),
    item("SAN_US_EQ", { currency: "USD", shortName: "SAN" }),
    item("REPe_EQ", { isin: "ES0173516115" }),
    item("REP_X", { shortName: "REP", isin: "XX" }),
  ];
  const ibe = matchInstrument("IBE.MC", catalog);
  assert.equal(ibe.status, "ok");
  assert.equal(ibe.item.ticker, "IBEe_EQ");
  assert.equal(matchInstrument("SAN.MC", catalog).item.ticker, "SANe_EQ", "ignora el de dólares");
  assert.equal(matchInstrument("REP.MC", catalog, "ES0173516115").how, "ISIN");
  assert.equal(matchInstrument("XYZ.MC", catalog).status, "no_encontrado");
  assert.equal(matchInstrument("BTC-EUR", catalog).status, "no_encontrado");
  const amb = matchInstrument("ACS.MC", [item("ACS1", { shortName: "ACS" }), item("ACS2", { shortName: "ACS" })]);
  assert.equal(amb.status, "ambiguo");
});

const base = { status: "esperando_entrada", quantity: 10, stop: 9, target: 12, stopOrderId: null, exitReason: null, createdAt: 0 };

test("operación protegida: tras la compra se pone el stop", () => {
  const pos = { quantity: 10, available: 10, price: 10 };
  assert.equal(decideBracket(base, { position: pos, orders: [] }, 1000).type, "poner_stop");
  assert.equal(decideBracket(base, { position: null, orders: [{ id: "1", side: "BUY", type: "MARKET" }] }, 1000).type, "esperar");
  assert.equal(decideBracket(base, { position: null, orders: [] }, 20 * 60_000).type, "error");
  // Entró con hueco por debajo del stop: vende directamente.
  assert.deepEqual(decideBracket(base, { position: { ...pos, price: 8.5 }, orders: [] }, 1000), { type: "vender", reason: "stop" });
});

test("operación protegida: objetivo, stop ejecutado y stop desaparecido", () => {
  const prot = { ...base, status: "protegida", stopOrderId: "77" };
  const stopOrder = { id: "77", side: "SELL", type: "STOP" };
  const pos = { quantity: 10, available: 0, price: 10.5 };
  assert.equal(decideBracket(prot, { position: pos, orders: [stopOrder] }).type, "esperar");
  assert.deepEqual(decideBracket(prot, { position: { ...pos, price: 12.1 }, orders: [stopOrder] }), { type: "cancelar_stop_y_vender", reason: "objetivo" });
  assert.deepEqual(decideBracket(prot, { position: null, orders: [] }), { type: "cerrar", reason: "stop" });
  assert.equal(decideBracket(prot, { position: { ...pos, available: 10 }, orders: [] }).type, "poner_stop");
});

test("operación protegida: venta tras cancelar el stop", () => {
  const sel = { ...base, status: "vendiendo", stopOrderId: "77", exitReason: "objetivo" };
  const pos = { quantity: 10, available: 10, price: 12.2 };
  assert.equal(decideBracket(sel, { position: pos, orders: [{ id: "77", side: "SELL", type: "STOP" }] }).type, "esperar");
  assert.deepEqual(decideBracket(sel, { position: pos, orders: [] }), { type: "vender", reason: "objetivo" });
  assert.deepEqual(decideBracket(sel, { position: null, orders: [] }), { type: "cerrar", reason: "objetivo" });
});

test("tamaño en el bróker: riesgo, exposición y efectivo", () => {
  assert.equal(brokerQuantity({ equity: 5000, cash: 5000, riskPct: 1, maxPositionPct: 20, price: 20, stop: 19 }), 50);
  assert.equal(brokerQuantity({ equity: 5000, cash: 5000, riskPct: 1, maxPositionPct: 10, price: 20, stop: 19 }), 25);
  assert.equal(brokerQuantity({ equity: 5000, cash: 100, riskPct: 1, maxPositionPct: 20, price: 20, stop: 19 }), 4);
  assert.equal(brokerQuantity({ equity: 5000, cash: 5000, riskPct: 1, maxPositionPct: 20, price: 20, stop: 21 }), 0);
});
