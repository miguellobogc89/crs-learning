// Adaptador de Trading 212 con un `fetch` simulado: nunca sale ninguna petición real.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "../trading/helpers.mjs";

const { createTrading212Adapter } = load("lib/brokers/adapters/trading212/index.ts");
const { matchInstrument, parseHistory, orderStatus } = load("lib/brokers/adapters/trading212/mapping.ts");
const { BrokerError } = load("lib/brokers/types.ts");

const session = (extra = {}) => ({ connectionId: "c1", environment: "demo", credentials: { apiKey: "k", apiSecret: "s" }, ...extra });

/** fetch simulado: responde con la lista de respuestas en orden y guarda cada llamada. */
function fakeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.Authorization });
    const next = queue.shift();
    if (!next) throw new Error("sin respuesta preparada");
    if (next === "network") throw new TypeError("fetch failed");
    return new Response(next.body === undefined ? "" : JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return { fn, calls };
}
const adapterWith = (responses) => {
  const f = fakeFetch(responses);
  const adapter = createTrading212Adapter({ fetch: f.fn, sleep: async () => {}, now: () => 0 });
  return { adapter, calls: f.calls };
};
const rejects = async (p, code) =>
  assert.rejects(p, (e) => {
    assert.ok(e instanceof BrokerError, String(e));
    assert.equal(e.code, code, e.message);
    return true;
  });

const SUMMARY = { currency: "EUR", totalValue: 5000, cash: { availableToTrade: 4200 }, investments: { currentValue: 800 } };

test("trading212: conectar lee el saldo de la Demo con las credenciales de la conexión", async () => {
  const { adapter, calls } = adapterWith([{ body: SUMMARY }]);
  const acc = await adapter.connect(session());
  assert.deepEqual(acc, { accountId: "principal", label: "Trading 212 · Demo", environment: "demo", currency: "EUR", cashAvailable: 4200, totalValue: 5000, investedValue: 800 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/demo\.trading212\.com\/api\/v0\/equity\/account\/summary$/);
  assert.equal(calls[0].auth, `Basic ${Buffer.from("k:s").toString("base64")}`);
});

test("trading212: una sesión «real» no llega a salir (entorno no habilitado)", async () => {
  const { adapter, calls } = adapterWith([{ body: SUMMARY }]);
  await rejects(adapter.connect(session({ environment: "real" })), "environment_disabled");
  assert.equal(calls.length, 0, "ninguna petición a live.trading212.com");
});

test("trading212: credenciales rechazadas y faltantes", async () => {
  const { adapter } = adapterWith([{ status: 401, body: {} }]);
  await rejects(adapter.connect(session()), "auth_failed");
  const { adapter: a2, calls } = adapterWith([]);
  await rejects(a2.connect(session({ credentials: { apiKey: "k" } })), "misconfigured");
  assert.equal(calls.length, 0);
});

test("trading212: órdenes normalizadas (compra positiva, venta negativa, stop, limitada)", async () => {
  const { adapter, calls } = adapterWith([
    { body: { id: 11, status: "NEW" } },
    { body: { id: 12, status: "CONFIRMED" } },
    { body: { id: 13, status: "NEW" } },
    { body: { id: 14, status: "NEW" } },
  ]);
  const base = { providerSymbol: "IBEe_EQ", limitPrice: null, stopPrice: null, timeInForce: "day" };
  assert.deepEqual(await adapter.placeOrder(session(), { ...base, side: "buy", type: "market", quantity: 3 }), { orderId: "11", status: "open", providerStatus: "NEW" });
  await adapter.placeOrder(session(), { ...base, side: "sell", type: "market", quantity: 3 });
  await adapter.placeOrder(session(), { ...base, side: "sell", type: "stop", quantity: 3, stopPrice: 9.5, timeInForce: "gtc" });
  await adapter.placeOrder(session(), { ...base, side: "buy", type: "limit", quantity: 2, limitPrice: 10 });
  assert.deepEqual(calls.map((c) => [c.url.split("/api/v0")[1], c.body]), [
    ["/equity/orders/market", { ticker: "IBEe_EQ", quantity: 3, extendedHours: false }],
    ["/equity/orders/market", { ticker: "IBEe_EQ", quantity: -3, extendedHours: false }],
    ["/equity/orders/stop", { ticker: "IBEe_EQ", quantity: -3, stopPrice: 9.5, timeValidity: "GOOD_TILL_CANCEL" }],
    ["/equity/orders/limit", { ticker: "IBEe_EQ", quantity: 2, limitPrice: 10, timeValidity: "DAY" }],
  ]);
});

test("trading212: un POST nunca se reintenta; si no hay respuesta el resultado es «desconocido»", async () => {
  const order = { providerSymbol: "IBEe_EQ", side: "buy", type: "market", quantity: 1, limitPrice: null, stopPrice: null, timeInForce: "day" };
  for (const [resp, expected] of [
    ["network", "unknown_outcome"],
    [{ status: 503, body: {} }, "unknown_outcome"],
    [{ status: 200, body: { nope: true } }, "unknown_outcome"],
    [{ status: 429, body: {} }, "rate_limited"],
    [{ status: 400, body: { code: "InsufficientFreeForStocksPurchase", message: "Insufficient funds" } }, "insufficient_funds"],
    [{ status: 400, body: { code: "BadTicker" } }, "invalid_request"],
  ]) {
    const { adapter, calls } = adapterWith([resp, { body: { id: 1, status: "NEW" } }]);
    await rejects(adapter.placeOrder(session(), order), expected);
    assert.equal(calls.length, 1, `sin reintento tras ${expected}`);
  }
});

test("trading212: dos órdenes simultáneas del mismo valor no se envían a la vez", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const calls = [];
  const adapter = createTrading212Adapter({
    fetch: async (url, init) => {
      calls.push(url);
      await gate;
      return new Response(JSON.stringify({ id: 1, status: "NEW" }));
    },
    sleep: async () => {},
    now: () => 0,
  });
  const order = { providerSymbol: "IBEe_EQ", side: "buy", type: "market", quantity: 1, limitPrice: null, stopPrice: null, timeInForce: "day" };
  const first = adapter.placeOrder(session(), order);
  await rejects(adapter.placeOrder(session(), order), "conflict");
  release();
  await first;
  assert.equal(calls.length, 1);
});

test("trading212: las lecturas sí se repiten una vez tras un límite de consultas", async () => {
  const { adapter, calls } = adapterWith([
    { status: 429, body: {} },
    { body: [{ instrument: { ticker: "IBEe_EQ", name: "Iberdrola", currency: "EUR" }, quantity: 4, quantityAvailableForTrading: 4, averagePricePaid: 12.5, currentPrice: 13 }] },
  ]);
  const pos = await adapter.getPositions(session());
  assert.equal(calls.length, 2);
  assert.deepEqual(pos, [{ symbol: "IBE.MC", providerSymbol: "IBEe_EQ", name: "Iberdrola", quantity: 4, quantityAvailable: 4, averagePrice: 12.5, currentPrice: 13, currency: "EUR" }]);
});

test("trading212: órdenes abiertas y estado de una orden ya ejecutada (historial)", async () => {
  const { adapter } = adapterWith([
    { body: [{ id: 5, ticker: "SANe_EQ", type: "STOP", status: "NEW", quantity: -10, stopPrice: 4.1, initiatedFrom: "API" }] },
    { status: 404, body: {} },
    { body: { items: [{ order: { id: 7, ticker: "IBEe_EQ", side: "BUY", type: "MARKET", status: "FILLED", quantity: 3, filledQuantity: 3 }, fill: { id: 70, price: 12.4, quantity: 3, filledAt: "2026-11-11T09:00:00Z" } }] } },
  ]);
  const [o] = await adapter.getOrders(session());
  assert.equal(o.side, "sell");
  assert.equal(o.type, "stop");
  assert.equal(o.status, "open");
  assert.equal(o.quantity, 10);
  assert.equal(o.symbol, "SAN.MC");
  assert.equal(o.createdByApi, true);
  const done = await adapter.getOrder(session(), "7");
  assert.equal(done.status, "filled");
  assert.equal(done.averageFillPrice, 12.4);
});

test("trading212: cancelar solo órdenes creadas por API", async () => {
  const { adapter, calls } = adapterWith([{ body: [{ id: 9, ticker: "IBEe_EQ", type: "LIMIT", status: "NEW", quantity: 1, initiatedFrom: "WEB" }] }]);
  await rejects(adapter.cancelOrder(session(), "9"), "conflict");
  assert.equal(calls.filter((c) => c.method === "DELETE").length, 0);
  const ok = adapterWith([{ body: [{ id: 9, ticker: "IBEe_EQ", type: "LIMIT", status: "NEW", quantity: 1, initiatedFrom: "API" }] }, { status: 200 }]);
  await ok.adapter.cancelOrder(session(), "9");
  assert.equal(ok.calls[1].method, "DELETE");
  await rejects(ok.adapter.cancelOrder(session(), "9; DROP"), "invalid_request");
});

test("trading212: historial en formato plano y anidado; estados", () => {
  const flat = parseHistory([{ id: 1, ticker: "IBEe_EQ", status: "FILLED", type: "MARKET", quantity: 2, filledQuantity: 2, fillPrice: 12, dateExecuted: "2026-11-10" }], () => null);
  assert.equal(flat.executions.length, 1);
  assert.equal(flat.executions[0].price, 12);
  const odd = parseHistory({ items: [{ basura: true }, { order: { id: 2, ticker: "X", quantity: 1, status: "CANCELLED" } }] }, () => null);
  assert.equal(odd.orders.length, 1, "lo que no se entiende se ignora");
  assert.equal(odd.executions.length, 0);
  assert.equal(orderStatus("PARTIALLY_FILLED"), "partially_filled");
  assert.equal(orderStatus("RARO"), "unknown");
});

const item = (ticker, extra = {}) => ({ ticker, name: ticker, shortName: null, isin: null, currency: "EUR", type: "STOCK", ...extra });

test("trading212: vinculación de símbolos (ticker de Madrid, ISIN y casos dudosos)", () => {
  const catalog = [
    item("IBEe_EQ", { name: "Iberdrola", isin: "ES0144580Y14" }),
    item("SANe_EQ", { name: "Banco Santander", isin: "ES0113900J37" }),
    item("SAN_US_EQ", { currency: "USD", shortName: "SAN" }),
    item("REPe_EQ", { isin: "ES0173516115" }),
    item("REP_X", { shortName: "REP", isin: "XX" }),
  ];
  const ibe = matchInstrument("IBE.MC", catalog);
  assert.equal(ibe.status, "ok");
  assert.equal(ibe.instrument.providerSymbol, "IBEe_EQ");
  assert.equal(ibe.instrument.symbol, "IBE.MC");
  assert.equal(matchInstrument("SAN.MC", catalog).instrument.providerSymbol, "SANe_EQ", "ignora el de dólares");
  assert.equal(matchInstrument("REP.MC", catalog, "ES0173516115").how, "ISIN");
  assert.equal(matchInstrument("XYZ.MC", catalog).status, "not_found");
  assert.equal(matchInstrument("BTC-EUR", catalog).status, "not_found");
  assert.equal(matchInstrument("ACS.MC", [item("ACS1", { shortName: "ACS" }), item("ACS2", { shortName: "ACS" })]).status, "ambiguous");
});

test("trading212: crypto no se resuelve (no lo soporta) y no consulta el catálogo", async () => {
  const { adapter, calls } = adapterWith([]);
  const r = await adapter.resolveSymbol(session(), { symbol: "BTC-EUR", market: "crypto" });
  assert.equal(r.status, "unsupported");
  assert.equal(calls.length, 0);
});
