// Adaptador de Binance con un `fetch` simulado: nunca sale ninguna petición real.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { load } from "../trading/helpers.mjs";

const { createBinanceAdapter } = load("lib/brokers/adapters/binance/index.ts");
const { floorToStep, decimalsOf, orderParams, parseExchangeInfo, mapBinanceError } = {
  ...load("lib/brokers/adapters/binance/mapping.ts"),
  ...load("lib/brokers/adapters/binance/api.ts"),
};
const { BrokerError } = load("lib/brokers/types.ts");

const NOW = 1_762_850_000_000;
const session = (extra = {}) => ({ connectionId: "c1", environment: "demo", credentials: { apiKey: "KEY", apiSecret: "SECRET" }, ...extra });

const EXCHANGE = {
  symbols: [
    {
      symbol: "BTCEUR",
      status: "TRADING",
      baseAsset: "BTC",
      quoteAsset: "EUR",
      orderTypes: ["LIMIT", "LIMIT_MAKER", "MARKET", "STOP_LOSS_LIMIT", "TAKE_PROFIT_LIMIT"],
      filters: [
        { filterType: "PRICE_FILTER", minPrice: "0.01", maxPrice: "1000000", tickSize: "0.01000000" },
        { filterType: "LOT_SIZE", minQty: "0.00001000", maxQty: "9000", stepSize: "0.00001000" },
        { filterType: "NOTIONAL", minNotional: "5.00000000" },
      ],
    },
    { symbol: "ETHEUR", status: "TRADING", baseAsset: "ETH", quoteAsset: "EUR", orderTypes: ["LIMIT", "MARKET"], filters: [{ filterType: "LOT_SIZE", minQty: "0.0001", stepSize: "0.0001" }] },
    { symbol: "BTCUSDT", status: "TRADING", baseAsset: "BTC", quoteAsset: "USDT", orderTypes: ["MARKET"], filters: [] },
    { symbol: "SLPUSDT", status: "TRADING", baseAsset: "SLP", quoteAsset: "USDT", orderTypes: ["MARKET"], filters: [] },
    { symbol: "EURUSDT", status: "TRADING", baseAsset: "EUR", quoteAsset: "USDT", orderTypes: ["MARKET"], filters: [] },
  ],
};

/** Router simulado por método y ruta; guarda cada llamada. */
function fake(routes) {
  const calls = [];
  const fn = async (url, init) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname, params: Object.fromEntries(u.searchParams), headers: init.headers, host: u.host });
    const key = `${init.method} ${u.pathname}`;
    const r = typeof routes[key] === "function" ? routes[key](u) : routes[key];
    if (r === undefined) throw new Error(`sin ruta para ${key}`);
    if (r === "network") throw new TypeError("fetch failed");
    // Respuesta con código HTTP: { http, body }. Si no, el objeto es el cuerpo (200).
    return r.http ? new Response(JSON.stringify(r.body), { status: r.http }) : new Response(JSON.stringify(r), { status: 200 });
  };
  return { fn, calls };
}
const base = {
  "GET /api/v3/time": { serverTime: NOW + 1_000 },
  "GET /api/v3/exchangeInfo": EXCHANGE,
};
const adapterWith = (routes) => {
  const f = fake({ ...base, ...routes });
  return { adapter: createBinanceAdapter({ fetch: f.fn, now: () => NOW }), calls: f.calls };
};
const rejects = async (p, code) =>
  assert.rejects(p, (e) => {
    assert.ok(e instanceof BrokerError, String(e));
    assert.equal(e.code, code, e.message);
    return true;
  });

const ACCOUNT = { uid: 42, canTrade: true, balances: [{ asset: "EUR", free: "100.5", locked: "0" }, { asset: "BTC", free: "0.01", locked: "0.002" }, { asset: "XYZ", free: "3", locked: "0" }] };

test("binance: peticiones firmadas con el reloj de Binance, en el testnet para demo", async () => {
  const { adapter, calls } = adapterWith({ "GET /api/v3/account": ACCOUNT, "GET /api/v3/ticker/price": [{ symbol: "BTCEUR", price: "60000" }] });
  await adapter.connect(session());
  const acc = calls.find((c) => c.path === "/api/v3/account");
  assert.equal(acc.host, "testnet.binance.vision");
  assert.equal(acc.headers["X-MBX-APIKEY"], "KEY");
  assert.equal(acc.params.timestamp, String(NOW + 1_000), "usa el desfase con el reloj de Binance");
  const { signature, ...rest } = acc.params;
  const query = new URLSearchParams(rest).toString();
  assert.equal(signature, createHmac("sha256", "SECRET").update(query).digest("hex"));
  assert.ok(!calls.some((c) => c.path.startsWith("/sapi")), "en demo no se consultan las restricciones (el testnet no las tiene)");
});

test("binance: cuenta real — rechaza claves con retiros habilitados o que no se pueden comprobar", async () => {
  const withdrawals = adapterWith({ "GET /sapi/v1/account/apiRestrictions": { enableWithdrawals: true, enableReading: true } });
  await rejects(withdrawals.adapter.connect(session({ environment: "real" })), "forbidden");
  assert.equal(withdrawals.calls.find((c) => c.path === "/sapi/v1/account/apiRestrictions").host, "api.binance.com");
  assert.ok(!withdrawals.calls.some((c) => c.path === "/api/v3/account"), "ni siquiera lee la cuenta");
  const unknown = adapterWith({ "GET /sapi/v1/account/apiRestrictions": { http: 404, body: {} } });
  await rejects(unknown.adapter.connect(session({ environment: "real" })), "forbidden");
  const ok = adapterWith({
    "GET /sapi/v1/account/apiRestrictions": { enableWithdrawals: false, enableReading: true },
    "GET /api/v3/account": ACCOUNT,
    "GET /api/v3/ticker/price": [{ symbol: "BTCEUR", price: "60000" }],
  });
  const acc = await ok.adapter.connect(session({ environment: "real" }));
  assert.equal(acc.label, "Binance · Spot");
});

test("binance: saldos → cuenta y posiciones en euros (sin precio medio, que Binance no da)", async () => {
  const { adapter } = adapterWith({ "GET /api/v3/account": ACCOUNT, "GET /api/v3/ticker/price": [{ symbol: "BTCEUR", price: "60000" }] });
  const [acc] = await adapter.getAccounts(session());
  assert.equal(acc.accountId, "42");
  assert.equal(acc.cashAvailable, 100.5);
  assert.equal(acc.investedValue, 0.012 * 60000);
  assert.equal(acc.totalValue, 100.5 + 720);
  const pos = await adapter.getPositions(session());
  const btc = pos.find((p) => p.name === "BTC");
  assert.deepEqual(btc, { symbol: "BTC-EUR", providerSymbol: "BTCEUR", name: "BTC", quantity: 0.012, quantityAvailable: 0.01, averagePrice: null, currentPrice: 60000, currency: "EUR" });
  const xyz = pos.find((p) => p.name === "XYZ");
  assert.equal(xyz.symbol, null, "sin par en euros: se ve, pero no se puede operar desde CRS");
  assert.equal(xyz.currentPrice, null);
});

test("binance: cantidades y precios ajustados al paso del par; mínimos", () => {
  assert.equal(decimalsOf("0.00001000"), 5);
  assert.equal(decimalsOf("1.00000000"), 0);
  assert.equal(floorToStep(0.0123456, "0.00001000"), "0.01234");
  assert.equal(floorToStep(0.3, "0.1"), "0.3", "sin errores de coma flotante");
  assert.equal(floorToStep(61234.567, "0.01000000"), "61234.56");
  const rules = parseExchangeInfo(EXCHANGE).get("BTCEUR");
  const o = { providerSymbol: "BTCEUR", side: "buy", type: "limit", quantity: 0.0012345, limitPrice: 60000.129, stopPrice: null, timeInForce: "gtc", clientOrderId: "crsabc" };
  assert.deepEqual(orderParams(o, rules, null), { symbol: "BTCEUR", side: "BUY", type: "LIMIT", quantity: "0.00123", price: "60000.12", timeInForce: "GTC", newClientOrderId: "crsabc", newOrderRespType: "RESULT" });
  assert.throws(() => orderParams({ ...o, quantity: 0.000001 }, rules, null), /cantidad mínima/);
  assert.throws(() => orderParams({ ...o, quantity: 0.00005, limitPrice: 60000 }, rules, null), /importe mínimo/, "0,00005 × 60.000 = 3 € < 5 €");
  assert.throws(() => orderParams({ ...o, type: "stop", stopPrice: 50000, limitPrice: null }, rules, null), (e) => e.code === "unsupported");
});

test("binance: la orden lleva el identificador de CRS y nunca se reintenta", async () => {
  const ok = adapterWith({ "GET /api/v3/ticker/price": [{ symbol: "BTCEUR", price: "60000" }], "POST /api/v3/order": { symbol: "BTCEUR", orderId: 777, status: "FILLED", clientOrderId: "crs123" } });
  const order = { providerSymbol: "BTCEUR", side: "buy", type: "market", quantity: 0.001, limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "crs123" };
  assert.deepEqual(await ok.adapter.placeOrder(session(), order), { orderId: "BTCEUR:777", status: "filled", providerStatus: "FILLED" });
  const post = ok.calls.find((c) => c.method === "POST");
  assert.equal(post.params.newClientOrderId, "crs123");
  assert.equal(post.params.quantity, "0.00100");
  for (const [resp, code] of [
    ["network", "unknown_outcome"],
    [{ http: 503, body: { code: -1001, msg: "Internal error" } }, "unknown_outcome"],
    [{ http: 400, body: { code: -2010, msg: "Account has insufficient balance for requested action." } }, "insufficient_funds"],
    [{ http: 429, body: { code: -1003, msg: "Too many requests" } }, "rate_limited"],
    [{ http: 401, body: { code: -2015, msg: "Invalid API-key, IP, or permissions for action." } }, "auth_failed"],
  ]) {
    const { adapter, calls } = adapterWith({ "GET /api/v3/ticker/price": [{ symbol: "BTCEUR", price: "60000" }], "POST /api/v3/order": resp });
    await rejects(adapter.placeOrder(session(), order), code);
    assert.equal(calls.filter((c) => c.method === "POST").length, 1, `un solo envío (${code})`);
  }
});

test("binance: resolver un resultado incierto por el identificador de CRS", async () => {
  const { adapter, calls } = adapterWith({ "GET /api/v3/order": { symbol: "BTCEUR", orderId: 9, status: "FILLED", origQty: "0.001", executedQty: "0.001", cummulativeQuoteQty: "60", clientOrderId: "crs999", side: "BUY", type: "MARKET" } });
  const o = await adapter.findOrderByClientId(session(), { providerSymbol: "BTCEUR", clientOrderId: "crs999" });
  assert.equal(o.orderId, "BTCEUR:9");
  assert.equal(o.status, "filled");
  assert.equal(o.averageFillPrice, 60000);
  assert.equal(calls.find((c) => c.path === "/api/v3/order").params.origClientOrderId, "crs999");
  const none = adapterWith({ "GET /api/v3/order": { http: 400, body: { code: -2013, msg: "Order does not exist." } } });
  assert.equal(await none.adapter.findOrderByClientId(session(), { providerSymbol: "BTCEUR", clientOrderId: "crs1" }), null);
});

test("binance: cancelar solo órdenes de CRS; acciones y pares desconocidos no", async () => {
  const foreign = adapterWith({ "GET /api/v3/order": { symbol: "BTCEUR", orderId: 5, status: "NEW", origQty: "1", clientOrderId: "web_abc", side: "SELL", type: "LIMIT", price: "70000" } });
  await rejects(foreign.adapter.cancelOrder(session(), "BTCEUR:5"), "conflict");
  assert.ok(!foreign.calls.some((c) => c.method === "DELETE"));
  const mine = adapterWith({ "GET /api/v3/order": { symbol: "BTCEUR", orderId: 5, status: "NEW", origQty: "1", clientOrderId: "crs5", side: "SELL", type: "LIMIT" }, "DELETE /api/v3/order": { status: "CANCELED" } });
  await mine.adapter.cancelOrder(session(), "BTCEUR:5");
  assert.equal(mine.calls.find((c) => c.method === "DELETE").params.orderId, "5");
  await rejects(mine.adapter.cancelOrder(session(), "5"), "invalid_request");
  const { adapter } = adapterWith({});
  assert.equal((await adapter.resolveSymbol(session(), { symbol: "IBE.MC", market: "bolsa" })).status, "unsupported");
  assert.equal((await adapter.resolveSymbol(session(), { symbol: "BTC-EUR", market: "crypto" })).instrument.providerSymbol, "BTCEUR");
  assert.equal((await adapter.resolveSymbol(session(), { symbol: "DOGE-EUR", market: "crypto" })).status, "not_found");
});

test("binance: errores normalizados", () => {
  assert.equal(mapBinanceError(400, -1121, "Invalid symbol.", false).code, "instrument_not_found");
  assert.equal(mapBinanceError(400, -2011, "Unknown order sent.", true).code, "conflict");
  assert.equal(mapBinanceError(418, null, "", false).code, "rate_limited");
  assert.equal(mapBinanceError(502, null, "", false).code, "provider_unavailable");
  assert.equal(mapBinanceError(502, null, "", true).code, "unknown_outcome");
});

test("binance: valora en euros lo que no tiene par en euros (vía USDT), aunque no se pueda operar desde CRS", async () => {
  const account = { canTrade: true, balances: [{ asset: "EUR", free: "0.0015", locked: "0" }, { asset: "USDT", free: "0.028769", locked: "0" }, { asset: "SLP", free: "57803.14", locked: "0" }] };
  const { adapter, calls } = adapterWith({
    "GET /api/v3/account": account,
    "GET /api/v3/ticker/price": [
      { symbol: "SLPUSDT", price: "0.000483" },
      { symbol: "EURUSDT", price: "1.165" },
    ],
  });
  const pos = await adapter.getPositions(session());
  const slp = pos.find((p) => p.name === "SLP");
  assert.equal(slp.symbol, null, "SLP no tiene par en euros: no se opera desde CRS");
  assert.ok(Math.abs(slp.currentPrice - 0.000483 / 1.165) < 1e-12);
  const usdt = pos.find((p) => p.name === "USDT");
  assert.ok(Math.abs(usdt.currentPrice - 1 / 1.165) < 1e-12);
  const [acc] = await adapter.getAccounts(session());
  assert.ok(Math.abs(acc.totalValue - (0.0015 + 57803.14 * (0.000483 / 1.165) + 0.028769 / 1.165)) < 1e-9, String(acc.totalValue));
  assert.ok(acc.totalValue > 23 && acc.totalValue < 25, "≈ 24 € como en Binance");
  const asked = JSON.parse(calls.find((c) => c.path === "/api/v3/ticker/price").params.symbols).sort();
  assert.deepEqual(asked, ["EURUSDT", "SLPUSDT"]);
});

test("binance: bloqueo por ubicación del servidor (451) con mensaje claro", () => {
  const e = mapBinanceError(451, 0, "Service unavailable from a restricted location according to 'b. Eligibility'", false);
  assert.equal(e.code, "provider_unavailable");
  assert.match(e.message, /ubicación del servidor/);
});
