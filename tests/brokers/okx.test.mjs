import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { load } from "../trading/helpers.mjs";

const { createOkxAdapter } = load("lib/brokers/adapters/okx/index.ts");
const now = () => 1780000000000;
const session = { connectionId: "c1", environment: "real", credentials: { apiKey: "key", apiSecret: "secret", passphrase: "phrase" } };
const order = {
  providerSymbol: "BTC-EUR", side: "buy", type: "market", quantity: 0.00123456,
  limitPrice: null, stopPrice: null, timeInForce: "day", clientOrderId: "crs" + "a".repeat(32),
};
const pair = { instId: "BTC-EUR", baseCcy: "BTC", quoteCcy: "EUR", state: "live", lotSz: "0.00001", minSz: "0.0001", tickSz: "0.1" };

function adapter(handler) {
  return createOkxAdapter({
    now, brokerCode: "Partner9",
    async fetch(url, init) {
      const u = new URL(url);
      assert.equal(u.origin, "https://eea.okx.com");
      const path = u.pathname + u.search;
      const headers = new Headers(init.headers);
      if (headers.has("OK-ACCESS-KEY")) {
        const timestamp = new Date(now()).toISOString();
        const signature = createHmac("sha256", "secret").update(timestamp + init.method + path + (init.body ?? "")).digest("base64");
        assert.equal(headers.get("OK-ACCESS-SIGN"), signature);
        assert.equal(headers.get("OK-ACCESS-PASSPHRASE"), "phrase");
      }
      if (u.pathname === "/api/v5/public/instruments") return Response.json({ code: "0", data: [pair] });
      const result = await handler(u, init, headers);
      return Response.json(Array.isArray(result) ? { code: "0", data: result } : result);
    },
  });
}

test("OKX lee saldo y posiciones con las credenciales europeas y rechaza claves de retirada", async () => {
  let permission = "read_only,trade";
  const a = adapter((u) => {
    if (u.pathname.endsWith("/config")) return [{ uid: "123", perm: permission }];
    if (u.pathname.endsWith("/balance")) return [{ details: [{ ccy: "EUR", cashBal: "50", availBal: "40" }, { ccy: "BTC", cashBal: "0.001", availBal: "0.001" }] }];
    if (u.pathname.endsWith("/tickers")) return [{ instId: "BTC-EUR", last: "60000" }];
    assert.fail(u.href);
  });
  const account = await a.connect(session);
  assert.equal(account.totalValue, 110);
  assert.equal(account.cashAvailable, 40);
  assert.equal((await a.getPositions(session))[0].providerSymbol, "BTC-EUR");
  permission = "read_only,withdraw,trade";
  await assert.rejects(a.connect(session), { code: "forbidden" });
});

test("OKX firma la orden, atribuye solo en real y conserva el ID para reconciliarla", async () => {
  let submitted;
  const a = adapter((u, init, headers) => {
    if (init.method === "POST") {
      submitted = JSON.parse(init.body);
      assert.equal(submitted.tag, headers.has("x-simulated-trading") ? undefined : "Partner9");
      assert.equal(submitted.tdMode, "cash");
      assert.equal(submitted.sz, "0.00123");
      assert.equal(submitted.tgtCcy, "base_ccy");
      assert.equal(submitted.banAmend, true);
      assert.match(submitted.clOrdId, /^crs[a-f0-9]{29}$/);
      return [{ sCode: "0", ordId: "42" }];
    }
    assert.equal(u.searchParams.get("clOrdId"), submitted.clOrdId);
    return [{ ...submitted, ordId: "42", state: "filled", avgPx: "60000", accFillSz: "0.00123" }];
  });
  assert.equal((await a.placeOrder(session, order)).orderId, "BTC-EUR:42");
  assert.equal((await a.findOrderByClientId(session, order)).status, "filled");
  await a.placeOrder({ ...session, environment: "demo" }, order);
});

test("OKX no reenvía órdenes con resultado incierto y respeta errores por orden", async () => {
  let attempts = 0;
  const timeout = adapter(() => {
    attempts += 1;
    throw new Error("timeout");
  });
  await assert.rejects(timeout.placeOrder(session, order), { code: "unknown_outcome" });
  assert.equal(attempts, 1);
  const rejected = adapter(() => ({ code: "1", data: [{ sCode: "51008" }] }));
  await assert.rejects(rejected.placeOrder(session, order), { code: "insufficient_funds" });
});
