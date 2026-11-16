// Revolut X: firma Ed25519, saldos, órdenes y errores (sin red: fetch simulado).
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { load } from "../trading/helpers.mjs";

const { createRevolutXAdapter, clientUuid } = load("lib/brokers/adapters/revolutx/index.ts");
const { queryString } = load("lib/brokers/adapters/revolutx/api.ts");

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const now = () => 1785313433816;
const session = { connectionId: "c1", environment: "real", credentials: { apiKey: "k".repeat(64), privateKey: pem.replace(/\n/g, "\\n") } };
const pairs = { "BTC/EUR": { base: "BTC", quote: "EUR", base_step: "0.00000001", quote_step: "0.01", min_order_size: "0.00001", max_order_size: "100", min_order_size_quote: "1", status: "active" }, "BTC/USD": { base: "BTC", quote: "USD", base_step: "0.00000001", status: "active" } };

function adapter(handler) {
  return createRevolutXAdapter({
    now,
    async fetch(url, init) {
      const u = new URL(url);
      assert.equal(u.origin, "https://revx.revolut.com");
      const headers = new Headers(init.headers);
      if (headers.has("X-Revx-API-Key")) {
        const msg = `${headers.get("X-Revx-Timestamp")}${init.method}${u.pathname}${u.search.slice(1)}${init.body ?? ""}`;
        assert.ok(verify(null, Buffer.from(msg), publicKey, Buffer.from(headers.get("X-Revx-Signature"), "base64")), "firma válida");
        assert.equal(headers.get("X-Revx-Timestamp"), String(now()));
      }
      if (u.pathname === "/api/1.0/public/configuration/pairs") return Response.json(pairs);
      if (u.pathname === "/api/1.0/public/tickers") return Response.json({ data: [{ symbol: "BTC/EUR", mid: "60000" }] });
      const r = await handler(u, init);
      return r instanceof Response ? r : Response.json(r);
    },
  });
}

test("Revolut X firma con Ed25519 (aunque la clave llegue en una línea) y lee saldos en euros", async () => {
  const a = adapter((u) => {
    if (u.pathname === "/api/1.0/balances") return [{ currency: "EUR", available: "40", reserved: "10", total: "50" }, { currency: "BTC", available: "0.001", reserved: "0", total: "0.001" }];
    assert.fail(u.href);
  });
  const account = await a.connect(session);
  assert.equal(account.cashAvailable, 40);
  assert.equal(account.totalValue, 110);
  const [pos] = await a.getPositions(session);
  assert.equal(pos.symbol, "BTC-EUR");
  assert.equal(pos.currentPrice, 60000);
});

test("Revolut X envía la orden a mercado con UUID estable y cantidad ajustada al paso", async () => {
  let sent;
  const a = adapter((u, init) => {
    if (init.method === "POST" && u.pathname === "/api/1.0/orders") {
      sent = JSON.parse(init.body);
      return { data: { venue_order_id: "v-1", client_order_id: sent.client_order_id, state: "new" } };
    }
    if (u.pathname === "/api/1.0/orders/v-1") return { data: { id: "v-1", client_order_id: "x", symbol: "BTC-EUR", side: "buy", type: "market", status: "filled", quantity: "0.00123456", filled_quantity: "0.00123456", average_fill_price: "60010" } };
    assert.fail(u.href);
  });
  const order = { providerSymbol: "BTC-EUR", side: "buy", type: "market", quantity: 0.001234567, limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "crs-abc" };
  const r = await a.placeOrder(session, order);
  assert.equal(r.orderId, "v-1");
  assert.equal(sent.symbol, "BTC-EUR");
  assert.equal(sent.order_configuration.market.base_size, "0.00123456");
  assert.equal(sent.client_order_id, clientUuid("crs-abc"));
  assert.match(sent.client_order_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const o = await a.getOrder(session, "v-1");
  assert.equal(o.status, "filled");
  assert.equal(o.averageFillPrice, 60010);
});

test("Revolut X: sin par en euros, saldo insuficiente y caídas al escribir", async () => {
  let mode = "funds";
  const a = adapter((u, init) => {
    if (init.method === "POST") return mode === "funds" ? new Response(JSON.stringify({ message: "Insufficient balance" }), { status: 400 }) : new Response("", { status: 502 });
    assert.fail(u.href);
  });
  const base = { side: "buy", type: "market", quantity: 0.01, limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "x" };
  await assert.rejects(a.placeOrder(session, { ...base, providerSymbol: "BTC-USD" }), { code: "instrument_not_found" });
  await assert.rejects(a.placeOrder(session, { ...base, providerSymbol: "BTC-EUR" }), { code: "insufficient_funds" });
  mode = "down";
  await assert.rejects(a.placeOrder(session, { ...base, providerSymbol: "BTC-EUR" }), { code: "unknown_outcome" });
});

test("Revolut X: consulta con claves ordenadas y codificadas", () => {
  assert.equal(queryString({ symbols: "BTC-USD,ETH-USD", limit: "10" }), "limit=10&symbols=BTC-USD%2CETH-USD");
});
