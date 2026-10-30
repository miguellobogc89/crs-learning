import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const m = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => {
      if (name in dependencies) return dependencies[name];
      if (name === "server-only") return {};
      if (name.startsWith("node:")) return require(name);
      throw Error(`Missing test dependency: ${name}`);
    },
    m,
    m.exports,
  );
  return m.exports;
}
const rules = load("lib/whatsapp/rules.ts");
const ws = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const json = (value, options = {}) =>
  new Response(JSON.stringify(value), {
    status: options.status || 200,
    headers: { "Content-Type": "application/json" },
  });

test("webhook signature rejects absent, forged, altered or malformed payloads", () => {
  const raw = '{"entry":[]}',
    secret = "app-secret";
  const sig =
    "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(rules.validSignature(raw, sig, secret), true);
  for (const [text, signature, key] of [
    [raw, null, secret],
    [raw, sig, undefined],
    [raw + " ", sig, secret],
    [raw, "sha256=xx", secret],
    [raw, sig, "wrong"],
  ])
    assert.equal(rules.validSignature(text, signature, key), false);
});
test("service window and template variables enforce boundaries", () => {
  const now = Date.now();
  assert.equal(rules.serviceWindow(new Date(now - 86400000), now), false);
  assert.equal(rules.serviceWindow(new Date(now - 86399999), now), true);
  assert.equal(rules.serviceWindow(null, now), false);
  assert.equal(rules.bodyParameters("Hola {{1}} {{1}} {{2}}"), 2);
  assert.throws(() => rules.bodyParameters("{{2}}"));
  assert.throws(() => rules.bodyParameters("{{nombre}}"));
  assert.equal(rules.phone("+34 600-000-000"), "34600000000");
  assert.throws(() => rules.phone("600abc000"));
  assert.ok(!rules.precedingStatuses("delivered").includes("read"));
  assert.ok(!rules.precedingStatuses("sent").includes("delivered"));
});
test("repository scopes every lookup to the authenticated workspace", async () => {
  const calls = [];
  const repo = load("lib/whatsapp/repository.ts", {
    "@/lib/prisma": {
      prisma: {
        whatsapp_accounts: {
          findFirst: async (q) => {
            calls.push(q);
            return null;
          },
        },
        whatsapp_conversations: {
          findFirst: async (q) => {
            calls.push(q);
            return null;
          },
        },
      },
    },
    "@/lib/connectors/crypto": load("lib/connectors/crypto.ts"),
    "./rules": rules,
  });
  await assert.rejects(repo.accountFor(ws, id), (e) => e.status === 404);
  await assert.rejects(repo.conversationFor(ws, id), (e) => e.status === 404);
  assert.ok(
    calls.every((q) => q.where.workspace_id === ws && q.where.id === id),
  );
});
function route(
  prisma = {},
  context = { workspaceId: ws, userId: id, canManage: false },
  config = {},
) {
  return load("app/api/whatsapp/[...action]/route.ts", {
    "next/server": { NextResponse: { json } },
    "next/headers": { cookies: async () => ({}) },
    "@/lib/prisma": { prisma },
    "@/lib/connectors/context": { connectorContext: async () => context },
    "@/lib/connectors/crypto": load("lib/connectors/crypto.ts"),
    "@/lib/whatsapp/repository": {
      accountSelect: {
        id: true,
        display_phone: true,
        verified_name: true,
        status: true,
      },
    },
    "@/lib/whatsapp/meta": { metaConfig: () => config },
    "@/lib/whatsapp/service": {},
    "@/lib/whatsapp/rules": rules,
  });
}
const post = (path, body = {}, origin = "https://crs.test") =>
  new Request("https://crs.test/api/whatsapp/" + path, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (action) => ({
  params: Promise.resolve({ action: action.split("/") }),
});
test("API denies missing session, cross-origin mutations, and member management", async () => {
  assert.equal(
    (
      await route({}, null).GET(
        new Request("https://crs.test/api/whatsapp/accounts"),
        params("accounts"),
      )
    ).status,
    401,
  );
  assert.equal(
    (await route().POST(post("send", {}, "https://evil.test"), params("send")))
      .status,
    403,
  );
  for (const action of [
    "connect/code",
    "connect/finish",
    "disconnect",
    "templates/sync",
    "templates/create",
  ])
    assert.equal(
      (await route().POST(post(action), params(action))).status,
      403,
    );
});
test("accounts endpoint ignores supplied workspace and never selects credentials", async () => {
  let query;
  const api = route({
    whatsapp_accounts: {
      findMany: async (q) => {
        query = q;
        return [];
      },
    },
  });
  const response = await api.GET(
    new Request("https://crs.test/api/whatsapp/accounts?workspaceId=attacker"),
    params("accounts"),
  );
  assert.equal(response.status, 200);
  assert.equal(query.where.workspace_id, ws);
  assert.equal(query.select.token_enc, undefined);
  assert.equal(query.select.phone_number_id, undefined);
  assert.equal((await response.json()).configuration.canManage, false);
});
const conversation = {
  id,
  account_id: id,
  contact_phone: "34600000000",
  last_inbound_at: new Date(),
};
function service(
  prisma,
  graph = async () => ({ messages: [{ id: "wamid.1" }] }),
  overrides = {},
) {
  class MetaError extends rules.WhatsAppError {}
  return load("lib/whatsapp/service.ts", {
    "@prisma/client": {
      Prisma: { PrismaClientKnownRequestError: class extends Error {} },
    },
    "@/lib/prisma": { prisma },
    "@/lib/connectors/crypto": { encrypt: (x) => "sealed:" + x },
    "./repository": {
      accountFor: async () => ({ id, phone_number_id: "123", token: "secret" }),
      conversationFor: async () => conversation,
      ...overrides,
    },
    "./meta": { graph, MetaError },
    "./rules": rules,
  });
}
test("replayed outbound request returns the stored result without sending again", async () => {
  const stored = { id, status: "unknown" };
  const s = service(
    { whatsapp_messages: { findUnique: async () => stored } },
    () => {
      throw Error("must not send");
    },
  );
  assert.equal(await s.sendMessage(ws, { requestId }), stored);
});
test("closed service window fails before creating or sending a free message", async () => {
  const s = service(
    { whatsapp_messages: { findUnique: async () => null } },
    () => {
      throw Error("must not send");
    },
    {
      conversationFor: async () => ({ ...conversation, last_inbound_at: null }),
    },
  );
  await assert.rejects(
    s.sendMessage(ws, { requestId, conversationId: id, text: "Hola" }),
    (e) => e.status === 422,
  );
});
test("template lookup is scoped to the same number and workspace", async () => {
  let query;
  const s = service({
    whatsapp_messages: { findUnique: async () => null },
    whatsapp_templates: {
      findFirst: async (q) => {
        query = q;
        return null;
      },
    },
  });
  await assert.rejects(
    s.sendMessage(ws, { requestId, conversationId: id, templateId: id }),
    /plantilla aprobada/,
  );
  assert.deepEqual(query.where, {
    id,
    workspace_id: ws,
    account_id: id,
    status: "APPROVED",
  });
});
test("ambiguous Meta failure is recorded as unknown and never retried automatically", async () => {
  const writes = [];
  let sends = 0;
  const s = service(
    {
      whatsapp_messages: {
        findUnique: async () => null,
        create: async (q) => ({ id, ...q.data }),
        updateMany: async (q) => {
          writes.push(q);
          return { count: 1 };
        },
      },
    },
    async () => {
      sends++;
      throw Error("timeout");
    },
  );
  await assert.rejects(
    s.sendMessage(ws, { requestId, conversationId: id, text: "Hola" }),
    /sin confirmar/,
  );
  assert.equal(sends, 1);
  assert.equal(writes[0].data.status, "unknown");
  assert.equal(writes[0].where.status, "sending");
});
test("outbound send includes callback correlation and cannot regress a webhook delivery state", async () => {
  let payload;
  const writes = [];
  const s = service(
    {
      whatsapp_messages: {
        findUnique: async () => null,
        create: async (q) => ({ id, ...q.data }),
        updateMany: async (q) => {
          writes.push(q);
          return { count: 0 };
        },
      },
      whatsapp_conversations: { update: async () => ({}) },
      $transaction: async (p) => Promise.all(p),
    },
    async (_p, _t, _m, body) => {
      payload = body;
      return { messages: [{ id: "wamid.1" }] };
    },
  );
  await s.sendMessage(ws, { requestId, conversationId: id, text: "Hola" });
  assert.equal(payload.biz_opaque_callback_data, id);
  assert.equal(payload.to, conversation.contact_phone);
  assert.deepEqual(writes[0].where, { id, status: "sending" });
});
test("duplicate inbound webhook does not increment unread count or reopen service window", async () => {
  let writes = 0;
  const tx = {
    whatsapp_conversations: {
      upsert: async () => ({ id }),
      update: async () => {
        writes++;
      },
      updateMany: async () => {
        writes++;
      },
    },
    whatsapp_messages: { createMany: async () => ({ count: 0 }) },
  };
  const wh = load("lib/whatsapp/webhook.ts", {
    "@/lib/prisma": {
      prisma: {
        whatsapp_accounts: {
          findFirst: async () => ({ id, workspace_id: ws }),
        },
        $transaction: async (fn) => fn(tx),
      },
    },
    "./rules": rules,
  });
  await wh.processWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123" },
              messages: [
                {
                  id: "wamid.1",
                  from: "34600000000",
                  timestamp: "1800000000",
                  type: "text",
                  text: { body: "Hola" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(writes, 0);
});

function mockSignup(api) {
  const listeners = new Map();
  let callback;
  const previous = globalThis.window;
  globalThis.window = {
    FB: {
      login(cb) {
        callback = cb;
      },
    },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    setTimeout,
    clearTimeout,
  };
  const sdk = load("components/whatsapp/meta-signup.ts", {
    "./api": { waApi: api },
  });
  return {
    sdk,
    callback: (value) => callback(value),
    event: (data, origin = "https://www.facebook.com") =>
      listeners.get("message")?.({ origin, data: JSON.stringify(data) }),
    restore: () => {
      globalThis.window = previous;
    },
    listeners,
  };
}
const finish = {
  type: "WA_EMBEDDED_SIGNUP",
  event: "FINISH",
  data: { phone_number_id: "123", waba_id: "456" },
};
for (const eventFirst of [true, false])
  test(`Meta signup handles ${eventFirst ? "session before code" : "code before session"} without losing authorization`, async () => {
    const calls = [];
    const mock = mockSignup(async (path, body) => {
      calls.push({ path, body });
    });
    const flow = mock.sdk.signup({ configId: "config" });
    try {
      if (eventFirst) mock.event(finish);
      mock.callback({ authResponse: { code: "short-lived" } });
      await new Promise(setImmediate);
      if (!eventFirst) mock.event(finish);
      await flow.promise;
      assert.deepEqual(
        calls.map((c) => c.path),
        ["connect/code", "connect/finish"],
      );
      assert.deepEqual(calls[1].body, { phoneNumberId: "123", wabaId: "456" });
      assert.equal(mock.listeners.size, 0);
    } finally {
      flow.cancel();
      mock.restore();
    }
  });
test("Meta signup rejects forged origins and stops after cancellation", async () => {
  const calls = [];
  const mock = mockSignup(async (path) => {
    calls.push(path);
  });
  const flow = mock.sdk.signup({ configId: "config" });
  const rejection = assert.rejects(flow.promise, /cancelad/);
  try {
    mock.event(finish, "https://evilfacebook.com");
    mock.callback({ authResponse: { code: "code" } });
    await new Promise(setImmediate);
    assert.deepEqual(calls, ["connect/code"]);
    flow.cancel();
    await rejection;
    mock.event(finish);
    assert.deepEqual(calls, ["connect/code"]);
  } finally {
    flow.cancel();
    mock.restore();
  }
});

test("configuration diagnoses missing and invalid variables without exposing secrets", async () => {
  const keys = ["CONNECTORS_ENCRYPTION_KEY", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"];
  const previous = keys.map(k => process.env[k]);
  const read = async (config, canManage = true) => {
    const api = route({ whatsapp_accounts: { findMany: async () => [] } },
      { workspaceId: ws, userId: id, canManage }, config);
    return (await (await api.GET(new Request("https://crs.test/api/whatsapp/accounts"), params("accounts"))).json()).configuration;
  };
  try {
    for (const k of keys) delete process.env[k];
    const missing = await read({ appId: "123", configId: "456", secret: "", version: "v24.0" });
    assert.deepEqual(missing.missing, ["META_APP_SECRET", "CONNECTORS_ENCRYPTION_KEY"]);
    assert.equal(missing.ready, false);
    assert.deepEqual(missing.webhookMissing, ["META_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"]);
    const config = { appId: "123", configId: "456", secret: "secret-never-expose", version: "v24.0" };
    process.env.CONNECTORS_ENCRYPTION_KEY = "invalid-key";
    assert.equal((await read(config)).invalid.length, 1);
    process.env.CONNECTORS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "webhook-never-expose";
    const ready = await read(config);
    assert.equal(ready.ready, true);
    assert.equal(ready.webhookReady, true);
    assert.deepEqual(ready.missing, []);
    for (const value of [config.secret, ...keys.map(k => process.env[k])])
      assert.ok(!JSON.stringify(ready).includes(value));
    const member = await read(config, false);
    for (const field of ["checks", "missing", "invalid", "webhookMissing"])
      assert.equal(member[field], undefined);
  } finally {
    keys.forEach((k, i) => { if (previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; });
  }
});
