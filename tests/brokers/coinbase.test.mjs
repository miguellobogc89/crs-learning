// Adaptador de Coinbase con un `fetch` simulado: nunca sale ninguna petición real.
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { load } from "../trading/helpers.mjs";

const { createCoinbaseAdapter } = load("lib/brokers/adapters/coinbase/index.ts");
const { mapCoinbaseError } = load("lib/brokers/adapters/coinbase/api.ts");
const { buildJwt, normalizeCredentials } = load("lib/brokers/adapters/coinbase/signing.ts");
const { conversionPlan, parseProducts, resolve, cashCurrencyOf, cashOf } = load("lib/brokers/adapters/coinbase/mapping.ts");

const NOW = 1_762_850_000_000;
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = ec.privateKey.export({ type: "sec1", format: "pem" });
const NAME = "organizations/org-1/apiKeys/key-1";
const session = (secret = PEM) => ({ connectionId: "c1", environment: "real", credentials: { apiKey: NAME, apiSecret: secret } });

const PRODUCTS = {
  products: [
    { product_id: "BTC-EUR", base_currency_id: "BTC", quote_currency_id: "EUR", price: "60000", base_increment: "0.00000001", quote_increment: "0.01", base_min_size: "0.00000001", quote_min_size: "1", status: "online", product_type: "SPOT" },
    { product_id: "BTC-USDC", base_currency_id: "BTC", quote_currency_id: "USDC", price: "70000", base_increment: "0.00000001", quote_increment: "0.01", base_min_size: "0.00000001", quote_min_size: "1", status: "online", product_type: "SPOT" },
    { product_id: "PEPE-USDC", base_currency_id: "PEPE", quote_currency_id: "USDC", price: "0.00001", base_increment: "1", quote_increment: "0.00000001", base_min_size: "1", quote_min_size: "1", status: "online", product_type: "SPOT" },
    { product_id: "USDC-EUR", base_currency_id: "USDC", quote_currency_id: "EUR", price: "0.86", base_increment: "0.01", quote_increment: "0.0001", base_min_size: "0.01", quote_min_size: "1", status: "online", product_type: "SPOT" },
    { product_id: "OLD-EUR", base_currency_id: "OLD", quote_currency_id: "EUR", price: "1", status: "delisted", trading_disabled: true, product_type: "SPOT" },
    { product_id: "BTC-PERP", base_currency_id: "BTC", quote_currency_id: "USDC", price: "70000", product_type: "FUTURE" },
  ],
};
const acct = (currency, value, hold = "0") => ({ uuid: currency, currency, available_balance: { value, currency }, hold: { value: hold, currency } });

function fake(routes) {
  const calls = [];
  const fn = async (url, init) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname, params: u.searchParams, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    const key = `${init.method} ${u.pathname}`;
    const r = typeof routes[key] === "function" ? routes[key](u, init) : routes[key];
    if (r === undefined) throw new Error(`sin ruta para ${key}`);
    if (r === "network") throw new TypeError("fetch failed");
    return r.http ? new Response(JSON.stringify(r.body), { status: r.http }) : new Response(JSON.stringify(r), { status: 200 });
  };
  return { fn, calls };
}
const base = {
  "GET /api/v3/brokerage/market/products": PRODUCTS,
  "GET /api/v3/brokerage/key_permissions": { can_view: true, can_trade: true, can_transfer: false },
};
const adapterWith = (routes) => {
  const f = fake({ ...base, ...routes });
  return { adapter: createCoinbaseAdapter({ fetch: f.fn, now: () => NOW }), calls: f.calls };
};

const decode = (part) => JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());

test("coinbase: JWT ES256 con kid, nonce, iss «cdp», 2 minutos y uri «MÉTODO host/ruta» sin consulta", () => {
  const jwt = buildJwt(NAME, PEM, "get", "/api/v3/brokerage/accounts", NOW, "abc");
  const [h, p, sig] = jwt.split(".");
  assert.deepEqual(decode(h), { alg: "ES256", kid: NAME, nonce: "abc", typ: "JWT" });
  assert.deepEqual(decode(p), { iss: "cdp", sub: NAME, nbf: NOW / 1000, exp: NOW / 1000 + 120, uri: "GET api.coinbase.com/api/v3/brokerage/accounts" });
  const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  assert.ok(ok, "la firma valida con la clave pública");
});

test("coinbase: acepta la clave pegada en una línea, con «\\n» literales o dentro del JSON descargado", () => {
  const oneLine = PEM.replace(/\n/g, "\\n");
  assert.equal(normalizeCredentials(NAME, oneLine).secret.includes("\n"), true);
  const json = JSON.stringify({ name: NAME, privateKey: PEM });
  assert.deepEqual(normalizeCredentials("", json), { name: NAME, secret: PEM.trim() });
  const flat = PEM.replace(/\n/g, " ");
  assert.ok(buildJwt(NAME, flat, "GET", "/x", NOW).split(".").length === 3);
  assert.throws(() => buildJwt(NAME, "no-es-una-clave", "GET", "/x", NOW), /no es válida/);
});

test("coinbase: conectar rechaza claves con permiso de transferir y comprueba la firma en cada petición", async () => {
  const bad = adapterWith({ "GET /api/v3/brokerage/key_permissions": { can_view: true, can_trade: true, can_transfer: true } });
  await assert.rejects(bad.adapter.connect(session()), (e) => e.code === "forbidden" && /transferir/.test(e.message));
  const good = adapterWith({ "GET /api/v3/brokerage/accounts": { accounts: [acct("EUR", "20")], has_next: false } });
  const a = await good.adapter.connect(session());
  assert.equal(a.cashAvailable, 20);
  const auth = good.calls.find((c) => c.path === "/api/v3/brokerage/accounts").headers.Authorization;
  assert.match(auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(good.calls.find((c) => c.path.endsWith("/market/products")).headers.Authorization, undefined, "el catálogo es público: sin firma");
});

test("coinbase: efectivo en euros y USDC sumado en euros; el USDC no es una posición; todo valorado en euros", async () => {
  const { adapter } = adapterWith({
    "GET /api/v3/brokerage/accounts": { accounts: [acct("EUR", "5"), acct("USDC", "100"), acct("PEPE", "1000000"), acct("BTC", "0.001", "0.0005")], has_next: false },
  });
  const [a] = await adapter.getAccounts(session());
  assert.deepEqual(a.cash, [
    { currency: "EUR", amount: 5, valueEur: 5 },
    { currency: "USDC", amount: 100, valueEur: 86 },
  ]);
  assert.equal(a.cashAvailable, 91);
  const pos = await adapter.getPositions(session());
  assert.deepEqual(pos.map((p) => p.name).sort(), ["BTC", "PEPE"]);
  const pepe = pos.find((p) => p.name === "PEPE");
  assert.equal(pepe.symbol, "PEPE-EUR");
  assert.equal(pepe.providerSymbol, "PEPE-USDC");
  assert.ok(Math.abs(pepe.currentPrice - 0.00001 * 0.86) < 1e-12, "PEPE en euros, vía USDC");
  const btc = pos.find((p) => p.name === "BTC");
  assert.equal(btc.currentPrice, 60000, "si hay par en euros, su precio");
  assert.equal(btc.quantity, 0.0015);
  assert.equal(btc.providerSymbol, "BTC-USDC", "con el efectivo en USDC se opera contra USDC");
  assert.ok(Math.abs(a.totalValue - (5 + 86 + 10 * 0.86 + 0.0015 * 60000)) < 1e-9);
});

test("coinbase: se compra con el efectivo que tengas (euros o USDC); si una moneda solo cotiza en una, se usa esa", () => {
  const products = parseProducts(PRODUCTS);
  assert.equal(products.has("BTC-PERP"), false, "solo productos al contado");
  assert.equal(resolve("BTC-EUR", products, "EUR").instrument.providerSymbol, "BTC-EUR");
  assert.equal(resolve("BTC-EUR", products, "USDC").instrument.providerSymbol, "BTC-USDC");
  assert.equal(resolve("PEPE-EUR", products, "EUR").instrument.providerSymbol, "PEPE-USDC", "si solo hay par en USDC, se usa");
  assert.equal(resolve("OLD-EUR", products, "EUR").status, "unsupported");
  assert.equal(resolve("DOGE-EUR", products, "EUR").status, "not_found");
  assert.equal(resolve("USDC-EUR", products, "EUR").status, "unsupported");
  assert.equal(cashCurrencyOf(cashOf([{ asset: "EUR", available: 50, hold: 0 }, { asset: "USDC", available: 10, hold: 0 }], products)), "EUR");
  assert.equal(cashCurrencyOf(cashOf([{ asset: "EUR", available: 1, hold: 0 }, { asset: "USDC", available: 10, hold: 0 }], products)), "USDC");
});

test("coinbase: orden a mercado con base_size ajustado al incremento, client_order_id y precio medio en euros", async () => {
  const { adapter, calls } = adapterWith({
    "POST /api/v3/brokerage/orders": { success: true, success_response: { order_id: "o-1", product_id: "BTC-USDC", side: "BUY", client_order_id: "crs1" } },
    "GET /api/v3/brokerage/orders/historical/o-1": {
      order: { order_id: "o-1", product_id: "BTC-USDC", side: "BUY", client_order_id: "crs1", status: "FILLED", order_type: "MARKET", filled_size: "0.0001", average_filled_price: "70000", order_configuration: { market_market_ioc: { base_size: "0.0001" } }, created_time: "2026-11-14T10:00:00Z" },
    },
  });
  const r = await adapter.placeOrder(session(), { providerSymbol: "BTC-USDC", side: "buy", type: "market", quantity: 0.000123456789, limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "crs1" });
  assert.equal(r.orderId, "o-1");
  const body = calls.find((c) => c.method === "POST").body;
  assert.deepEqual(body, { client_order_id: "crs1", product_id: "BTC-USDC", side: "BUY", order_configuration: { market_market_ioc: { base_size: "0.00012345" } } });
  const o = await adapter.getOrder(session(), "o-1");
  assert.equal(o.status, "filled");
  assert.equal(o.averageFillPrice, 70000);
  assert.ok(Math.abs(o.averageFillPriceEur - 70000 * 0.86) < 1e-9);
  assert.equal(o.createdByApi, true);
});

test("coinbase: rechazos, mínimos y resultado incierto", async () => {
  const rejected = adapterWith({ "POST /api/v3/brokerage/orders": { success: false, error_response: { error: "INSUFFICIENT_FUND", message: "Insufficient balance in source account" } } });
  await assert.rejects(rejected.adapter.placeOrder(session(), { providerSymbol: "BTC-EUR", side: "buy", type: "market", quantity: 0.001, limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "crs2" }), (e) => e.code === "insufficient_funds");
  const lost = adapterWith({ "POST /api/v3/brokerage/orders": "network" });
  await assert.rejects(lost.adapter.placeOrder(session(), { providerSymbol: "BTC-EUR", side: "buy", type: "market", quantity: 0.001, limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "crs3" }), (e) => e.code === "unknown_outcome");
  const tiny = adapterWith({});
  await assert.rejects(tiny.adapter.placeOrder(session(), { providerSymbol: "BTC-EUR", side: "buy", type: "market", quantity: 0.00000001, limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "crs4" }), (e) => e.code === "invalid_request" && /importe mínimo/.test(e.message));
  assert.equal(mapCoinbaseError(401, "UNAUTHORIZED", "", false).code, "auth_failed");
  assert.equal(mapCoinbaseError(429, "", "", false).code, "rate_limited");
  assert.equal(mapCoinbaseError(503, "", "", true).code, "unknown_outcome");
  assert.equal(mapCoinbaseError(503, "", "", false).code, "provider_unavailable");
});

test("coinbase: busca una orden incierta por nuestro identificador entre las últimas del par", async () => {
  const { adapter, calls } = adapterWith({
    "GET /api/v3/brokerage/orders/historical/batch": {
      orders: [
        { order_id: "x", product_id: "BTC-EUR", side: "BUY", client_order_id: "otra", status: "FILLED", order_configuration: { market_market_ioc: { base_size: "1" } } },
        { order_id: "y", product_id: "BTC-EUR", side: "BUY", client_order_id: "crs9", status: "OPEN", filled_size: "0.5", order_configuration: { limit_limit_gtc: { base_size: "1", limit_price: "50000" } } },
      ],
    },
  });
  const o = await adapter.findOrderByClientId(session(), { providerSymbol: "BTC-EUR", clientOrderId: "crs9" });
  assert.equal(o.orderId, "y");
  assert.equal(o.status, "partially_filled");
  assert.equal(o.limitPrice, 50000);
  assert.equal(calls.find((c) => c.path.endsWith("/historical/batch")).params.get("product_ids"), "BTC-EUR");
});

test("coinbase: cancelar solo órdenes de CRS", async () => {
  const order = (client) => ({ order: { order_id: "o-5", product_id: "BTC-EUR", side: "SELL", client_order_id: client, status: "OPEN", order_configuration: { limit_limit_gtc: { base_size: "1", limit_price: "90000" } } } });
  const foreign = adapterWith({ "GET /api/v3/brokerage/orders/historical/o-5": order("web") });
  await assert.rejects(foreign.adapter.cancelOrder(session(), "o-5"), (e) => e.code === "conflict");
  assert.ok(!foreign.calls.some((c) => c.method === "POST"));
  const mine = adapterWith({ "GET /api/v3/brokerage/orders/historical/o-5": order("crs5"), "POST /api/v3/brokerage/orders/batch_cancel": { results: [{ success: true, order_id: "o-5" }] } });
  await mine.adapter.cancelOrder(session(), "o-5");
  assert.deepEqual(mine.calls.find((c) => c.method === "POST").body, { order_ids: ["o-5"] });
});

test("coinbase: cambio de euros a USDC (compra USDC-EUR con margen) y vuelta a euros (vende USDC)", () => {
  const products = parseProducts(PRODUCTS);
  const toUsdc = conversionPlan("USDC", 20, products);
  assert.equal(toUsdc.providerSymbol, "USDC-EUR");
  assert.equal(toUsdc.side, "buy");
  assert.equal(toUsdc.quantity, 23.13, "20 € × 0,995 / 0,86 = 23,139… → 23,13 USDC");
  assert.deepEqual(toUsdc.expected, { currency: "USDC", amount: 23.13 });
  const toEur = conversionPlan("EUR", 23.137, products);
  assert.equal(toEur.side, "sell");
  assert.equal(toEur.quantity, 23.13);
  assert.ok(Math.abs(toEur.expected.amount - 23.13 * 0.86) < 1e-9);
  assert.throws(() => conversionPlan("USDC", 0.5, products), /mínima/);
});
