// Contratos del módulo de brókeres: registro, permisos, separación entre usuarios, entornos,
// validación de órdenes, idempotencia y errores normalizados. Sin red ni base de datos.
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "../trading/helpers.mjs";

const { createRegistry, checkAdapter } = load("lib/brokers/registry.ts");
const { authorize, validateOrder, onExistingRequest, normalizePermissions, parsePermissions, realEnabledFromEnv } = load("lib/brokers/policy.ts");
const { BrokerError } = load("lib/brokers/types.ts");
const { brokerRegistry } = load("lib/brokers/providers.ts");
const { TRADING212_INFO } = load("lib/brokers/adapters/trading212/index.ts");

const info = (extra = {}) => ({
  id: "fake",
  name: "Fake",
  logo: null,
  description: "",
  availability: "available",
  environments: ["demo", "real"],
  markets: ["bolsa"],
  capabilities: ["accounts", "place_order"],
  orderTypes: ["market", "limit"],
  credentialFields: [],
  notes: [],
  ...extra,
});
const fakeAdapter = (extra = {}, infoExtra = {}) => ({
  info: info(infoExtra),
  connect: async () => ({}),
  getAccounts: async () => [],
  placeOrder: async () => ({ orderId: "1", status: "open", providerStatus: null }),
  ...extra,
});

const conn = (extra = {}) => ({
  id: "c1",
  userId: "u1",
  workspaceId: "w1",
  provider: "fake",
  environment: "demo",
  status: "active",
  permissions: ["read", "trade"],
  ...extra,
});
const user = (userId = "u1", workspaceId = "w1") => ({ kind: "user", userId, workspaceId, canManage: true });
const bot = (onBehalfOfUserId = "u1", workspaceId = "w1") => ({ kind: "automation", onBehalfOfUserId, workspaceId, label: "guardián" });
const opts = { realEnabled: false };
const read = { kind: "read", capability: "accounts" };
const trade = { kind: "trade", capability: "place_order" };

const code = (fn, expected) =>
  assert.throws(fn, (e) => {
    assert.ok(e instanceof BrokerError, `esperaba BrokerError, llegó ${e}`);
    assert.equal(e.code, expected, e.message);
    return true;
  });

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------
test("registro: Trading 212 y Binance registrados y coherentes; los demás anunciados sin adaptador", () => {
  assert.ok(brokerRegistry.has("trading212"));
  assert.deepEqual(checkAdapter(brokerRegistry.get("trading212")), []);
  assert.ok(brokerRegistry.has("binance"));
  assert.deepEqual(checkAdapter(brokerRegistry.get("binance")), []);
  const list = brokerRegistry.list();
  const soon = list.filter((p) => p.availability === "soon").map((p) => p.id);
  assert.deepEqual(soon.sort(), ["coinbase", "ibkr", "kraken"]);
  for (const id of soon) {
    assert.equal(brokerRegistry.has(id), false, `${id} no debe poder usarse`);
    code(() => brokerRegistry.get(id), "unsupported");
  }
  assert.deepEqual(TRADING212_INFO.environments, ["demo"], "Trading 212 solo anuncia demo por ahora");
});

test("registro: rechaza adaptadores incoherentes y duplicados", () => {
  const r = createRegistry();
  assert.throws(() => r.register(fakeAdapter({ placeOrder: undefined })), /declara «place_order»/);
  assert.throws(() => r.register(fakeAdapter({ getPositions: async () => [] })), /no declara «positions»/);
  r.register(fakeAdapter());
  assert.throws(() => r.register(fakeAdapter()), /duplicado/);
  r.announce(info({ id: "fake" }));
  assert.equal(r.list().length, 1, "anunciar un proveedor ya registrado no lo duplica");
  code(() => r.get("otro"), "unsupported");
});

// ---------------------------------------------------------------------------
// Permisos y separación entre usuarios
// ---------------------------------------------------------------------------
test("política: solo el dueño usa su conexión (ni otro usuario ni otro espacio)", () => {
  const p = info();
  assert.equal(authorize(conn(), user(), read, p, opts).id, "c1");
  code(() => authorize(conn(), user("u2"), read, p, opts), "forbidden");
  code(() => authorize(conn(), user("u1", "w2"), read, p, opts), "forbidden");
  code(() => authorize(conn(), bot("u2"), trade, p, opts), "forbidden");
  code(() => authorize(null, user(), read, p, opts), "not_connected");
});

test("política: permisos de lectura, operación y automático", () => {
  const p = info();
  code(() => authorize(conn({ permissions: [] }), user(), read, p, opts), "permission_denied");
  code(() => authorize(conn({ permissions: ["read"] }), user(), trade, p, opts), "permission_denied");
  assert.ok(authorize(conn({ permissions: ["read", "trade"] }), user(), trade, p, opts));
  // Que el usuario pueda operar NO significa que un automatismo pueda.
  code(() => authorize(conn({ permissions: ["read", "trade"] }), bot(), trade, p, opts), "permission_denied");
  assert.ok(authorize(conn({ permissions: ["auto"] }), bot(), trade, p, opts), "automático implica operar y leer");
  code(() => authorize(conn(), bot(), { kind: "manage" }, p, opts), "forbidden");
  assert.deepEqual(normalizePermissions(["auto"]), ["read", "trade", "auto"]);
  assert.deepEqual(parsePermissions(["read", "admin", 3, "trade"]), ["read", "trade"]);
});

test("política: conexión inactiva, entorno real bloqueado y capacidades", () => {
  const p = info();
  code(() => authorize(conn({ status: "error" }), user(), read, p, opts), "not_connected");
  code(() => authorize(conn({ status: "disconnected" }), user(), read, p, opts), "not_connected");
  code(() => authorize(conn({ environment: "real" }), user(), read, p, { realEnabled: false }), "environment_disabled");
  assert.ok(authorize(conn({ environment: "real" }), user(), read, p, { realEnabled: true }));
  code(() => authorize(conn({ environment: "real" }), user(), read, info({ environments: ["demo"] }), { realEnabled: true }), "unsupported");
  code(() => authorize(conn(), user(), { kind: "trade", capability: "cancel_order" }, p, opts), "unsupported");
  code(() => authorize(conn(), user(), read, info({ availability: "soon" }), opts), "unsupported");
  assert.equal(realEnabledFromEnv({}), false);
  assert.equal(realEnabledFromEnv({ BROKERS_REAL_ENABLED: "1" }), false, "solo «true» lo habilita");
  assert.equal(realEnabledFromEnv({ BROKERS_REAL_ENABLED: "true" }), true);
});

// ---------------------------------------------------------------------------
// Órdenes normalizadas
// ---------------------------------------------------------------------------
const order = (extra = {}) => ({
  connectionId: "c1",
  environment: "demo",
  instrument: { symbol: " ibe.mc ", market: "bolsa" },
  side: "buy",
  type: "market",
  quantity: 3,
  idempotencyKey: "bracket:abc:entrada",
  ...extra,
});

test("órdenes: una orden demo nunca se convierte en real (ni al revés)", () => {
  code(() => validateOrder(order({ environment: "real" }), conn(), info()), "environment_mismatch");
  code(() => validateOrder(order(), conn({ environment: "real" }), info()), "environment_mismatch");
});

test("órdenes: validación contra las capacidades del proveedor", () => {
  const v = validateOrder(order(), conn(), info());
  assert.equal(v.instrument.symbol, "IBE.MC");
  assert.equal(v.timeInForce, "day");
  assert.equal(v.limitPrice, null);
  code(() => validateOrder(order({ type: "stop" }), conn(), info()), "unsupported");
  code(() => validateOrder(order({ instrument: { symbol: "BTC-EUR", market: "crypto" } }), conn(), info()), "unsupported");
  code(() => validateOrder(order({ type: "limit" }), conn(), info()), "invalid_request");
  assert.equal(validateOrder(order({ type: "limit", limitPrice: 9.5 }), conn(), info()).timeInForce, "gtc");
  code(() => validateOrder(order({ quantity: 0 }), conn(), info()), "invalid_request");
  code(() => validateOrder(order({ quantity: Number.NaN }), conn(), info()), "invalid_request");
  code(() => validateOrder(order({ side: "short" }), conn(), info()), "invalid_request");
  code(() => validateOrder(order({ idempotencyKey: "" }), conn(), info()), "invalid_request");
  code(() => validateOrder(order({ idempotencyKey: "a b" }), conn(), info()), "invalid_request");
  code(() => validateOrder(order({ providerSymbol: "IBE e;DROP" }), conn(), info()), "invalid_request");
  // Trading 212 no opera crypto en esta integración.
  code(() => validateOrder(order({ instrument: { symbol: "BTC-EUR", market: "crypto" } }), conn({ provider: "trading212" }), TRADING212_INFO), "unsupported");
});

test("idempotencia: lo que ya se sabe se devuelve; lo incierto se consulta, nunca se reenvía", () => {
  assert.equal(onExistingRequest({ status: "filled", orderId: "1" }), "return");
  assert.equal(onExistingRequest({ status: "rejected", orderId: null }), "return");
  assert.equal(onExistingRequest({ status: "open", orderId: "1" }), "return");
  assert.equal(onExistingRequest({ status: "open", orderId: null }), "reconcile");
  assert.equal(onExistingRequest({ status: "unknown", orderId: null }), "reconcile");
  assert.equal(onExistingRequest({ status: "pending_submit", orderId: null }), "reconcile");
});

test("errores normalizados: código, estado HTTP y forma JSON sin datos internos", () => {
  const e = new BrokerError("rate_limited", "espera", { provider: "trading212" });
  assert.equal(e.httpStatus, 429);
  assert.equal(e.retryable, true);
  assert.deepEqual(e.toJSON(), { error: "espera", code: "rate_limited", provider: "trading212", retryable: true });
  assert.equal(new BrokerError("unknown_outcome", "x").retryable, false, "una orden incierta no es reintentable");
  assert.equal(new BrokerError("forbidden", "x").httpStatus, 403);
});
