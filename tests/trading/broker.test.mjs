import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

// La vinculación de símbolos de Trading 212 se prueba en tests/brokers/trading212.test.mjs.
const { decideBracket, brokerQuantity } = load("lib/trading/broker/logic.ts");

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
