// Adaptador de Bitvavo con un `fetch` simulado: nunca sale ninguna petición real.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { load } from "../trading/helpers.mjs";

const { createBitvavoAdapter } = load("lib/brokers/adapters/bitvavo/index.ts");
const { bitvavoSignature, mapBitvavoError, OPERATOR_ID } = load("lib/brokers/adapters/bitvavo/api.ts");
const { clientUuid, floorTo, parseMarkets } = load("lib/brokers/adapters/bitvavo/mapping.ts");

const NOW = 1_762_850_000_000;
const session = { connectionId: "c1", environment: "real", credentials: { apiKey: "KEY", apiSecret: "SECRET" } };
const MARKETS = [
  { market: "BTC-EUR", status: "trading", base: "BTC", quote: "EUR", pricePrecision: 5, minOrderInBaseAsset: "0.00006", minOrderInQuoteAsset: "5", orderTypes: ["market", "limit", "stopLoss", "stopLossLimit"], quantityDecimals: 8 },
  { market: "SOL-EUR", status: "trading", base: "SOL", quote: "EUR", minOrderInBaseAsset: "0.01", minOrderInQuoteAsset: "5", orderTypes: ["market", "limit"], quantityDecimals: 3 },
  { market: "OLD-EUR", status: "halted", base: "OLD", quote: "EUR", orderTypes: ["market"] },
];
const PRICES = [{ market: "BTC-EUR", price: "60000" }, { market: "SOL-EUR", price: "150" }];

function fake(routes) {
  const calls = [];
  const fn = async (url, init) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname, search: u.search, params: Object.fromEntries(u.searchParams), headers: init.headers, body: init.body });
    const key = `${init.method} ${u.pathname}`;
    const r = typeof routes[key] === "function" ? routes[key](u, init) : routes[key];
    if (r === undefined) throw new Error(`sin ruta para ${key}`);
    if (r === "network") throw new TypeError("fetch failed");
    return r.http ? new Response(JSON.stringify(r.body), { status: r.http }) : new Response(JSON.stringify(r), { status: 200 });
  };
  return { fn, calls };
}
const base = { "GET /v2/time": { time: NOW + 500 }, "GET /v2/markets": MARKETS, "GET /v2/ticker/price": PRICES };
const adapterWith = (routes) => {
  const f = fake({ ...base, ...routes });
  return { adapter: createBitvavoAdapter({ fetch: f.fn, now: () => NOW }), calls: f.calls };
};

test("bitvavo: firma HMAC hex de timestamp+método+ruta(+consulta)+cuerpo y cabeceras", async () => {
  const { adapter, calls } = adapterWith({ "GET /v2/balance": [{ symbol: "EUR", available: "20", inOrder: "0" }] });
  const acc = await adapter.connect(session);
  assert.equal(acc.cashAvailable, 20);
  const c = calls.find((x) => x.path === "/v2/balance");
  const ts = Number(c.headers["Bitvavo-Access-Timestamp"]);
  assert.equal(ts, NOW + 500, "corrige el desfase con /time");
  assert.equal(c.headers["Bitvavo-Access-Key"], "KEY");
  assert.equal(c.headers["Bitvavo-Access-Signature"], createHmac("sha256", "SECRET").update(`${ts}GET/v2/balance`).digest("hex"));
  assert.equal(bitvavoSignature("S", 1, "GET", "/v2/order?market=BTC-EUR&orderId=x", ""), createHmac("sha256", "S").update("1GET/v2/order?market=BTC-EUR&orderId=x").digest("hex"));
  assert.equal(calls.find((x) => x.path === "/v2/markets").headers["Bitvavo-Access-Key"], undefined, "lo público va sin firma");
});

test("bitvavo: saldos → cuenta y posiciones valoradas en euros", async () => {
  const { adapter } = adapterWith({ "GET /v2/balance": [{ symbol: "EUR", available: "10", inOrder: "2" }, { symbol: "SOL", available: "0.5", inOrder: "0" }, { symbol: "XYZ", available: "3", inOrder: "0" }] });
  const [acc] = await adapter.getAccounts(session);
  assert.equal(acc.cashAvailable, 10);
  assert.equal(acc.totalValue, 12 + 75);
  const pos = await adapter.getPositions(session);
  assert.deepEqual(pos.map((p) => [p.symbol, p.providerSymbol, p.currentPrice]), [["SOL-EUR", "SOL-EUR", 150], [null, "XYZ", null]]);
});

test("bitvavo: orden a mercado con cantidad redondeada, operatorId numérico y clientOrderId UUID estable", async () => {
  let sent;
  const { adapter, calls } = adapterWith({
    "POST /v2/order": (_u, init) => {
      sent = JSON.parse(init.body);
      return { orderId: "1be6d0df-d5dc-4b53-a250-3376f3b393e6", market: "SOL-EUR", status: "filled", side: "buy", orderType: "market", amount: "0.133", filledAmount: "0.133", filledAmountQuote: "19.95", created: NOW };
    },
  });
  const r = await adapter.placeOrder(session, { providerSymbol: "SOL-EUR", side: "buy", type: "market", quantity: 0.13399, limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "crsabc" });
  assert.equal(r.orderId, "SOL-EUR:1be6d0df-d5dc-4b53-a250-3376f3b393e6");
  assert.equal(r.status, "filled");
  assert.equal(sent.amount, "0.133");
  assert.equal(sent.operatorId, OPERATOR_ID);
  assert.equal(typeof sent.operatorId, "number");
  assert.match(sent.clientOrderId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(sent.clientOrderId, clientUuid("crsabc"), "siempre el mismo para la misma orden de CRS");
  const post = calls.find((c) => c.method === "POST");
  assert.equal(post.headers["Bitvavo-Access-Signature"], createHmac("sha256", "SECRET").update(`${post.headers["Bitvavo-Access-Timestamp"]}POST/v2/order${post.body}`).digest("hex"));
});

test("bitvavo: rechaza mínimos y pares parados sin llamar a la API", async () => {
  const { adapter, calls } = adapterWith({});
  const o = (x) => ({ providerSymbol: "SOL-EUR", side: "buy", type: "market", quantity: 0.02, limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "crs1", ...x });
  await assert.rejects(adapter.placeOrder(session, o()), /importe mínimo/);
  await assert.rejects(adapter.placeOrder(session, o({ quantity: 0.001 })), /cantidad mínima/);
  await assert.rejects(adapter.placeOrder(session, o({ providerSymbol: "OLD-EUR" })), /no se puede operar/);
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
});

test("bitvavo: sin respuesta o 5xx al ordenar → resultado desconocido (no se repite); errores traducidos", async () => {
  const net = adapterWith({ "POST /v2/order": "network" });
  await assert.rejects(net.adapter.placeOrder(session, { providerSymbol: "BTC-EUR", side: "buy", type: "market", quantity: 0.001, limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "crs2" }), (e) => e.code === "unknown_outcome");
  assert.equal(mapBitvavoError(500, null, "", true).code, "unknown_outcome");
  assert.equal(mapBitvavoError(403, 310, "", false).code, "auth_failed");
  assert.equal(mapBitvavoError(400, 216, "", true).code, "insufficient_funds");
  assert.equal(mapBitvavoError(429, 105, "", false).code, "rate_limited");
  const bal = adapterWith({ "GET /v2/balance": { http: 403, body: { errorCode: 309, error: "invalid signature" } } });
  await assert.rejects(bal.adapter.connect(session), (e) => e.code === "auth_failed");
});

test("bitvavo: consultar y cancelar órdenes con el mercado delante; resolver símbolos", async () => {
  const { adapter, calls } = adapterWith({
    "GET /v2/order": { orderId: "aa-bb-cc-dd-ee", market: "BTC-EUR", status: "filled", side: "sell", orderType: "market", amount: "0.001", filledAmount: "0.001", filledAmountQuote: "61" },
    "DELETE /v2/order": { orderId: "aa-bb-cc-dd-ee" },
  });
  const o = await adapter.getOrder(session, "BTC-EUR:aa-bb-cc-dd-ee");
  assert.equal(o.averageFillPrice, 61000);
  assert.equal(o.side, "sell");
  await adapter.cancelOrder(session, "BTC-EUR:aa-bb-cc-dd-ee");
  const del = calls.find((c) => c.method === "DELETE");
  assert.deepEqual(del.params, { market: "BTC-EUR", orderId: "aa-bb-cc-dd-ee", operatorId: String(OPERATOR_ID) });
  assert.equal(del.headers["Bitvavo-Access-Signature"], createHmac("sha256", "SECRET").update(`${del.headers["Bitvavo-Access-Timestamp"]}DELETE/v2/order${del.search}`).digest("hex"));
  assert.deepEqual(await adapter.resolveSymbol(session, { symbol: "REP.MC", market: "bolsa" }).then((r) => r.status), "unsupported");
  assert.equal((await adapter.resolveSymbol(session, { symbol: "BTC-EUR", market: "crypto" })).instrument.quantityStep, 1e-8);
  assert.equal((await adapter.resolveSymbol(session, { symbol: "OLD-EUR", market: "crypto" })).status, "unsupported");
  assert.equal((await adapter.resolveSymbol(session, { symbol: "NOPE-EUR", market: "crypto" })).status, "not_found");
});

test("bitvavo: decimales por defecto y redondeo hacia abajo", () => {
  const m = parseMarkets([{ market: "X-EUR", status: "trading", base: "X", quote: "EUR", orderTypes: [] }]);
  assert.equal(m.get("X-EUR").quantityDecimals, 8);
  assert.equal(floorTo(1.23456789, 3), "1.234");
  assert.equal(floorTo(0.3, 1), "0.3");
});
