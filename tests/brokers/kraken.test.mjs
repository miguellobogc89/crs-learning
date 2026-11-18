import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { load } from "../trading/helpers.mjs";

const { createKrakenAdapter, createKrakenFuturesClient, KRAKEN_INFO } = load("lib/brokers/adapters/kraken/index.ts");
const { signKrakenRequest } = load("lib/brokers/adapters/kraken/signing.ts");
const { krakenSymbol, mapContracts, mapPositions, mapOrders, mapFills } = load("lib/brokers/adapters/kraken/mapping.ts");
const { checkAdapter } = load("lib/brokers/registry.ts");

const secret = Buffer.from("kraken-futures-test-secret").toString("base64");
const real = { connectionId: "kraken-1", environment: "real", credentials: { apiKey: "future-key", apiSecret: secret } };
const demo = { ...real, environment: "demo" };

function mock(routes) {
  const requests = [];
  const deps = {
    async fetch(input, init) {
      const url = new URL(input);
      requests.push({ url, init });
      assert.equal(url.origin, input.startsWith("https://demo-") ? "https://demo-futures.kraken.com" : "https://futures.kraken.com");
      assert.match(url.pathname, /^\/derivatives\/api\/v3\//);
      const headers = new Headers(init.headers);
      if (url.pathname.includes("/tickers/") || url.pathname.endsWith("/tickers") || url.pathname.endsWith("/instruments") || url.pathname.endsWith("/historical-funding-rates")) {
        assert.equal(headers.has("Authent"), false);
      } else {
        const signed = init.method === "POST" ? init.body : url.searchParams.toString();
        const path = url.pathname.replace("/derivatives", "");
        const digest = createHash("sha256").update(signed + path).digest();
        const expected = createHmac("sha512", Buffer.from(secret, "base64")).update(digest).digest("base64");
        assert.equal(headers.get("APIKey"), "future-key");
        assert.equal(headers.get("Authent"), expected);
      }
      const handler = routes[url.pathname.replace("/derivatives/api/v3/", "")];
      assert.ok(handler, `Unexpected endpoint ${url.pathname}`);
      const result = typeof handler === "function" ? await handler(url, init) : handler;
      return Response.json(result);
    },
  };
  return { requests, deps, adapter: createKrakenAdapter(deps), client: createKrakenFuturesClient(deps) };
}

const account = {
  result: "success",
  accounts: {
    flex: {
      portfolioValue: 1200, availableMargin: 1000,
      currencies: { EUR: { quantity: 100, value: 110 } },
    },
  },
};

test("firma Futures v3 sobre parámetros URL-encoded y ruta /api/v3 (sin /derivatives)", () => {
  const params = "symbol=PF_XBTUSD&message=hello%20world";
  const digest = createHash("sha256").update(params + "123" + "/api/v3/sendorder").digest();
  const expected = createHmac("sha512", Buffer.from(secret, "base64")).update(digest).digest("base64");
  assert.equal(signKrakenRequest(params, "/api/v3/sendorder", secret, "123"), expected);
  assert.notEqual(signKrakenRequest("symbol=PF_XBTUSD&message=hello world", "/api/v3/sendorder", secret, "123"), expected);
  assert.throws(() => signKrakenRequest(params, "/derivatives/api/v3/sendorder", secret));
});

test("conecta Futures con saldo y margen en EUR solo si hay cambio EUR/USD verificable", async () => {
  const { adapter, client } = mock({ accounts: account });
  assert.deepEqual(checkAdapter(adapter), []);
  assert.equal(adapter.placeOrder, undefined);
  assert.equal(adapter.cancelOrder, undefined);
  assert.equal(KRAKEN_INFO.capabilities.includes("place_order"), false);
  const result = await adapter.connect(real);
  assert.equal(result.accountId, "flex");
  assert.equal(result.currency, "EUR");
  assert.equal(result.totalValue, 1200 / 1.1);
  assert.equal(result.cashAvailable, 1000 / 1.1);
  assert.equal((await client.getAccount(real)).eurUsdRate, 1.1);
  assert.equal((await adapter.getAccounts(real)).length, 1);
});

test("sin cotización EUR no etiqueta importes USD como euros y usa endpoint demo separado", async () => {
  const { adapter, requests } = mock({
    accounts: { result: "success", accounts: { flex: { portfolioValue: 900, availableMargin: 700, currencies: { USD: { quantity: 900, value: 900 } } } } },
  });
  const result = await adapter.connect(demo);
  assert.equal(result.currency, "USD");
  assert.equal(result.totalValue, 900);
  assert.equal(requests[0].url.origin, "https://demo-futures.kraken.com");
});

test("mapeo de contratos PF_ y Bitcoin XBT; excluye futuros caducados y otros productos", async () => {
  const instruments = [
    { symbol: "PF_XBTUSD", tradeable: true, isExpired: false, tickSize: 0.1, contractSize: 0.00001 },
    { symbol: "PF_ETHUSD", tradeable: true, tickSize: 0.01, contractSize: 0.001 },
    { symbol: "PI_XBTUSD", tradeable: true },
    { symbol: "PF_SOLUSD", tradeable: false },
  ];
  const { adapter, client } = mock({
    instruments: { result: "success", instruments },
    "tickers/PF_XBTUSD": { result: "success", ticker: { symbol: "PF_XBTUSD", last: 90000, markPrice: 89999, fundingRate: 0.0001 } },
    "historical-funding-rates": { result: "success", rates: [{ timestamp: "2026-11-18T10:00:00Z", fundingRate: 0.0001, relativeFundingRate: 0.00009 }] },
  });
  assert.equal(krakenSymbol("BTC-USD"), "PF_XBTUSD");
  assert.equal(krakenSymbol("BTC-PERP"), "PF_XBTUSD");
  assert.equal(mapContracts(instruments).length, 2);
  assert.equal((await client.getTicker(real, "BTC")).symbol, "PF_XBTUSD");
  assert.equal((await client.getPerpetualContracts(real)).length, 2);
  assert.equal((await adapter.resolveSymbol(real, { symbol: "BTC-PERP", market: "crypto" })).status, "ok");
  assert.equal((await adapter.searchInstruments(real, "BTC"))[0].currency, "USD");
  assert.equal((await client.getFundingRates(real, "BTC"))[0].relativeFundingRate, 0.00009);
});

test("lectura de posiciones largas/cortas, órdenes y ejecuciones", async () => {
  const { adapter, client } = mock({
    openpositions: { result: "success", openPositions: [{ symbol: "PF_XBTUSD", side: "short", size: 0.02, price: 90000, unrealizedPnl: 10 }] },
    openorders: { result: "success", openOrders: [{ order_id: "uuid12345678", symbol: "PF_XBTUSD", side: "sell", orderType: "lmt", limitPrice: 92000, unfilledSize: 0.02, filledSize: 0, receivedTime: "2026-11-18T10:00:00Z", status: "untouched" }] },
    fills: { result: "success", fills: [
      { fill_id: "fill-1", symbol: "PF_XBTUSD", side: "sell", order_id: "uuid12345678", size: 0.01, price: 91000, fillTime: "2026-11-17T10:00:00Z" },
      { fill_id: "fill-2", symbol: "PF_XBTUSD", side: "buy", order_id: "uuid12345678", size: 0.01, price: 89900, fillTime: "2026-11-18T10:00:00Z" },
    ] },
    "tickers/PF_XBTUSD": { result: "success", ticker: { symbol: "PF_XBTUSD", last: 89000, markPrice: 89100 } },
  });
  assert.equal((await client.getOpenPositions(real))[0].side, "short");
  assert.equal((await adapter.getPositions(real))[0].quantity, -0.02);
  assert.equal((await adapter.getPositions(real))[0].currentPrice, 89100);
  assert.equal((await adapter.getOrders(real))[0].status, "open");
  assert.equal((await adapter.getExecutions(real, { limit: 1 }))[0].executionId, "fill-2");
  assert.deepEqual((await client.getFills(real, "2026-11-18T00:00:00Z")).map((x) => x.id), ["fill-2"]);
  assert.equal(mapPositions([{ symbol: "PF_XBTUSD", side: "long", size: 1 }])[0].side, "long");
  assert.equal(mapOrders([{ order_id: "123", symbol: "PF_XBTUSD", side: "buy", orderType: "stp", size: 1 }])[0].type, "stop");
  assert.equal(mapFills([{ fill_id: "123", symbol: "PF_XBTUSD", side: "buy", size: 1, price: 1 }])[0].price, 1);
});

test("cliente aislado prepara sendorder/cancelorder, conserva flags y nunca ejecuta en el adaptador público", async () => {
  const { client, requests, adapter } = mock({
    sendorder: { result: "success", sendStatus: { order_id: "order-12345678", status: "placed" } },
    cancelorder: { result: "success", cancelStatus: { order_id: "order-12345678", status: "cancelled" } },
  });
  await assert.rejects(client.placeOrder(real, { symbol: "PF_XBTUSD", side: "sell", size: 1, type: "mkt", postOnly: true }), { code: "invalid_request" });
  await assert.rejects(client.placeOrder(real, { symbol: "PF_XBTUSD", side: "sell", size: 1, type: "lmt" }), { code: "invalid_request" });
  assert.equal(requests.length, 0);
  assert.equal(await client.placeOrder(real, { symbol: "PF_XBTUSD", side: "sell", size: 0.1, type: "lmt", limitPrice: 90000, postOnly: true, reduceOnly: false }), "order-12345678");
  assert.equal(requests[0].init.body, "symbol=PF_XBTUSD&side=sell&size=0.1&orderType=post&limitPrice=90000&reduceOnly=false");
  await client.cancelOrder(real, "order-12345678");
  assert.equal(requests[1].init.body, "order_id=order-12345678");
  assert.equal(adapter.placeOrder, undefined);
  assert.equal(adapter.cancelOrder, undefined);
});

test("sin reintentos de órdenes ante resultados inciertos", async () => {
  let attempts = 0;
  const client = createKrakenFuturesClient({
    async fetch() { attempts += 1; throw new Error("network timeout"); },
  });
  await assert.rejects(client.placeOrder(real, { symbol: "PF_XBTUSD", side: "sell", size: 0.1, type: "mkt" }), { code: "unknown_outcome" });
  assert.equal(attempts, 1);
});
