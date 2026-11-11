// lib/brokers/gateway.ts
// ÚNICO punto de entrada de CRS para hablar con cualquier bróker. Cada llamada:
//   1) carga la conexión y comprueba en servidor que es de quien la usa (y sus permisos y entorno);
//   2) descifra las credenciales solo en memoria y para esa llamada;
//   3) llama al adaptador del proveedor (registro central), sin saber cuál es;
//   4) en las órdenes, deja registro auditable con clave de idempotencia.
// No decide qué comprar, cuánto ni cuándo: eso es de los agentes y de la gestión de riesgo.
import "server-only";
import { Prisma, type broker_connections, type broker_orders } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/connectors/crypto";
import type { BrokerAdapter, BrokerSession } from "./adapter";
import { authorize, normalizePermissions, onExistingRequest, parsePermissions, realEnabledFromEnv, validateOrder, type Access, type ConnectionRecord } from "./policy";
import { brokerRegistry } from "./providers";
import {
  actorLabel,
  actorUserId,
  BrokerError,
  type BrokerAccount,
  type BrokerActor,
  type BrokerEnvironment,
  type BrokerExecution,
  type BrokerInstrument,
  type BrokerOrder,
  type BrokerPermission,
  type BrokerPosition,
  type InstrumentRef,
  type OrderStatus,
  type PlaceOrderInput,
  type PlaceOrderResult,
  type ProviderInfo,
  type SymbolResolution,
} from "./types";

const policy = () => ({ realEnabled: realEnabledFromEnv() });
const isDev = () => process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// Vistas (lo único que sale hacia la interfaz: nunca credenciales)
// ---------------------------------------------------------------------------
export type ConnectionView = {
  id: string;
  provider: string;
  environment: BrokerEnvironment;
  status: "active" | "error" | "disconnected";
  accountId: string | null;
  accountLabel: string | null;
  currency: string | null;
  permissions: BrokerPermission[];
  credentialsSource: "stored" | "server";
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  /** Es la conexión que usa la cartera de Trading de este espacio. */
  usedByTrading: boolean;
};

export type ProviderView = ProviderInfo & { serverCredentials: boolean };

const statusOf = (s: string): ConnectionView["status"] => (s === "active" || s === "error" ? s : "disconnected");

function record(row: broker_connections): ConnectionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    environment: row.environment === "real" ? "real" : "demo",
    status: statusOf(row.status),
    permissions: parsePermissions(row.permissions),
  };
}

function view(row: broker_connections, tradingId: string | null): ConnectionView {
  return {
    id: row.id,
    provider: row.provider,
    environment: row.environment === "real" ? "real" : "demo",
    status: statusOf(row.status),
    accountId: row.account_id,
    accountLabel: row.account_label,
    currency: row.currency,
    permissions: normalizePermissions(parsePermissions(row.permissions)),
    credentialsSource: row.credentials_source === "server" ? "server" : "stored",
    lastError: row.last_error,
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    usedByTrading: tradingId === row.id,
  };
}

const userOnly = (actor: BrokerActor) => {
  if (actor.kind !== "user") throw new BrokerError("forbidden", "Solo el usuario puede gestionar sus conexiones");
  return actor;
};

async function tradingConnectionId(workspaceId: string) {
  const acc = await prisma.trading_accounts.findUnique({ where: { workspace_id_agent: { workspace_id: workspaceId, agent: "" } }, select: { broker_connection_id: true } });
  return acc?.broker_connection_id ?? null;
}

// ---------------------------------------------------------------------------
// Catálogo y conexiones
// ---------------------------------------------------------------------------
/** Proveedores (con sus capacidades) y las conexiones del usuario en este espacio. */
export async function listIntegrations(actor: BrokerActor) {
  const user = userOnly(actor);
  const [rows, tradingId] = await Promise.all([
    prisma.broker_connections.findMany({ where: { user_id: user.userId, workspace_id: user.workspaceId }, orderBy: { created_at: "asc" } }),
    tradingConnectionId(user.workspaceId),
  ]);
  const providers: ProviderView[] = brokerRegistry.list().map((info) => {
    const adapter = brokerRegistry.has(info.id) ? brokerRegistry.get(info.id) : null;
    return { ...info, serverCredentials: !!adapter && serverCredentialsAllowed(user) && info.environments.some((e) => !!adapter.serverCredentials?.(e)) };
  });
  return { providers, connections: rows.map((r) => view(r, tradingId)), realEnabled: policy().realEnabled, canManage: user.canManage };
}

/** Las credenciales del .env son personales: solo en local, solo demo, solo propietario o administrador. */
function serverCredentialsAllowed(actor: Extract<BrokerActor, { kind: "user" }>) {
  return isDev() && actor.canManage;
}

function readCredentials(provider: ProviderInfo, raw: unknown): Record<string, string> {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of provider.credentialFields) {
    const v = input[f.key];
    if (typeof v !== "string" || !v.trim()) throw new BrokerError("invalid_request", `Falta ${f.label.toLowerCase()}`, { provider: provider.id });
    if (v.length > 1_000) throw new BrokerError("invalid_request", `${f.label} demasiado largo`, { provider: provider.id });
    out[f.key] = v.trim();
  }
  return out;
}

/**
 * Conecta (o vuelve a conectar) una cuenta. Comprueba las credenciales contra el proveedor
 * leyendo la cuenta; no envía ninguna orden. El entorno queda fijado para siempre.
 */
export async function connect(
  actor: BrokerActor,
  input: { provider: string; environment: BrokerEnvironment; credentials?: unknown; useServerCredentials?: boolean; permissions?: BrokerPermission[] },
): Promise<ConnectionView> {
  const user = userOnly(actor);
  const adapter = brokerRegistry.get(input.provider);
  const info = adapter.info;
  if (input.environment !== "demo" && input.environment !== "real") throw new BrokerError("invalid_request", "Entorno no válido");
  if (!info.environments.includes(input.environment)) throw new BrokerError("unsupported", `${info.name} no admite el entorno ${input.environment}`, { provider: info.id });
  if (input.environment === "real" && !policy().realEnabled) throw new BrokerError("environment_disabled", "Las conexiones con dinero real no están habilitadas en este servidor", { provider: info.id });

  let credentials: Record<string, string>;
  let source: "stored" | "server";
  if (input.useServerCredentials) {
    const server = serverCredentialsAllowed(user) ? adapter.serverCredentials?.(input.environment) ?? null : null;
    if (!server) throw new BrokerError("forbidden", "No hay credenciales del servidor disponibles para ti en este entorno", { provider: info.id });
    credentials = server;
    source = "server";
  } else {
    credentials = readCredentials(info, input.credentials);
    source = "stored";
  }
  const sealed = source === "stored" ? sealCredentials(credentials) : null;

  const account = await adapter.connect({ connectionId: `nueva:${user.userId}`, environment: input.environment, credentials });
  const asked = parsePermissions(input.permissions ?? []);
  const permissions = normalizePermissions(asked.length ? asked : ["read"]);
  const data = {
    status: "active",
    account_id: account.accountId,
    account_label: account.label,
    currency: account.currency,
    permissions,
    credentials_enc: sealed,
    credentials_source: source,
    last_error: null,
    last_checked_at: new Date(),
    updated_at: new Date(),
  };
  const row = await prisma.broker_connections.upsert({
    where: { user_id_workspace_id_provider_environment: { user_id: user.userId, workspace_id: user.workspaceId, provider: info.id, environment: input.environment } },
    create: { user_id: user.userId, workspace_id: user.workspaceId, provider: info.id, environment: input.environment, ...data },
    update: data,
  });
  return view(row, await tradingConnectionId(user.workspaceId));
}

function sealCredentials(credentials: Record<string, string>) {
  try {
    return encrypt(JSON.stringify(credentials));
  } catch (e) {
    throw new BrokerError("misconfigured", e instanceof Error ? e.message : "No se pueden cifrar las credenciales");
  }
}

async function loadRow(connectionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) throw new BrokerError("not_connected", "Conexión no válida");
  return prisma.broker_connections.findUnique({ where: { id: connectionId } });
}

/** Desconecta: borra las credenciales y la desvincula de Trading. El historial de órdenes se conserva. */
export async function disconnect(actor: BrokerActor, connectionId: string) {
  const row = await loadRow(connectionId);
  authorize(row && record(row), actor, { kind: "manage" }, null, policy());
  const adapter = brokerRegistry.has(row!.provider) ? brokerRegistry.get(row!.provider) : null;
  if (adapter?.disconnect && row!.status === "active") {
    await adapter.disconnect(sessionOf(row!, adapter)).catch(() => undefined);
  }
  await prisma.$transaction([
    prisma.broker_connections.update({ where: { id: row!.id }, data: { status: "disconnected", credentials_enc: null, permissions: [], updated_at: new Date() } }),
    prisma.trading_accounts.updateMany({ where: { broker_connection_id: row!.id }, data: { broker_connection_id: null, updated_at: new Date() } }),
  ]);
  return { disconnected: true };
}

/** Cambia los permisos concedidos (leer, operar, automático). */
export async function setPermissions(actor: BrokerActor, connectionId: string, permissions: unknown) {
  const row = await loadRow(connectionId);
  authorize(row && record(row), actor, { kind: "manage" }, null, policy());
  if (row!.status === "disconnected") throw new BrokerError("not_connected", "La conexión está desconectada");
  const list = normalizePermissions(parsePermissions(permissions));
  if (!list.length) throw new BrokerError("invalid_request", "Concede al menos permiso de lectura o desconecta la cuenta");
  const updated = await prisma.broker_connections.update({ where: { id: row!.id }, data: { permissions: list, updated_at: new Date() } });
  return view(updated, await tradingConnectionId(row!.workspace_id));
}

/** Vuelve a comprobar las credenciales y actualiza la cuenta vinculada. */
export async function verify(actor: BrokerActor, connectionId: string) {
  const row = await loadRow(connectionId);
  authorize(row && record(row), actor, { kind: "manage" }, null, policy());
  if (row!.status === "disconnected") throw new BrokerError("not_connected", "La conexión está desconectada");
  const adapter = brokerRegistry.get(row!.provider);
  try {
    const account = await adapter.connect(sessionOf(row!, adapter));
    const updated = await prisma.broker_connections.update({
      where: { id: row!.id },
      data: { status: "active", account_id: account.accountId, account_label: account.label, currency: account.currency, last_error: null, last_checked_at: new Date(), updated_at: new Date() },
    });
    return view(updated, await tradingConnectionId(row!.workspace_id));
  } catch (e) {
    await markError(row!, e);
    throw e;
  }
}

/** Elige qué conexión usa la cartera de Trading de este espacio (null = ninguna). */
export async function useForTrading(actor: BrokerActor, connectionId: string | null) {
  const user = userOnly(actor);
  if (!user.canManage) throw new BrokerError("forbidden", "Solo el propietario o un administrador puede elegir el bróker de la cartera");
  if (connectionId) {
    const row = await loadRow(connectionId);
    authorize(row && record(row), actor, { kind: "manage" }, null, policy());
    if (row!.status !== "active") throw new BrokerError("not_connected", "La conexión no está activa");
  }
  await prisma.trading_accounts.updateMany({ where: { workspace_id: user.workspaceId, agent: "" }, data: { broker_connection_id: connectionId, updated_at: new Date() } });
  return { connectionId };
}

// ---------------------------------------------------------------------------
// Sesión por llamada
// ---------------------------------------------------------------------------
function sessionOf(row: broker_connections, adapter: BrokerAdapter): BrokerSession {
  const environment: BrokerEnvironment = row.environment === "real" ? "real" : "demo";
  let credentials: Record<string, string> | null = null;
  if (row.credentials_source === "server") {
    credentials = isDev() ? adapter.serverCredentials?.(environment) ?? null : null;
    if (!credentials) throw new BrokerError("misconfigured", "Las credenciales del servidor ya no están disponibles: conecta la cuenta con tu propia clave", { provider: row.provider });
  } else {
    if (!row.credentials_enc) throw new BrokerError("not_connected", "La conexión no tiene credenciales: vuelve a conectarla", { provider: row.provider });
    try {
      credentials = JSON.parse(decrypt(row.credentials_enc)) as Record<string, string>;
    } catch {
      throw new BrokerError("misconfigured", "No se pudieron descifrar las credenciales (¿cambió CONNECTORS_ENCRYPTION_KEY?)", { provider: row.provider });
    }
  }
  return { connectionId: row.id, environment, credentials };
}

async function markError(row: broker_connections, e: unknown) {
  if (e instanceof BrokerError && (e.code === "auth_failed" || e.code === "misconfigured")) {
    await prisma.broker_connections.update({ where: { id: row.id }, data: { status: "error", last_error: e.message.slice(0, 300), updated_at: new Date() } }).catch(() => undefined);
  }
}

/** Abre la conexión para una operación: propiedad, permisos, entorno y capacidad. */
async function open(actor: BrokerActor, connectionId: string, access: Exclude<Access, { kind: "manage" }>) {
  const row = await loadRow(connectionId);
  const provider = row && brokerRegistry.has(row.provider) ? brokerRegistry.get(row.provider).info : null;
  authorize(row && record(row), actor, access, provider, policy());
  const adapter = brokerRegistry.get(row!.provider);
  return { row: row!, adapter, session: sessionOf(row!, adapter) };
}

async function guarded<T>(row: broker_connections, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    await markError(row, e);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------
export async function getAccounts(actor: BrokerActor, connectionId: string): Promise<BrokerAccount[]> {
  const { row, adapter, session } = await open(actor, connectionId, { kind: "read", capability: "accounts" });
  return guarded(row, () => adapter.getAccounts!(session));
}

export async function getPositions(actor: BrokerActor, connectionId: string): Promise<BrokerPosition[]> {
  const { row, adapter, session } = await open(actor, connectionId, { kind: "read", capability: "positions" });
  return guarded(row, () => adapter.getPositions!(session));
}

export async function getOrders(actor: BrokerActor, connectionId: string): Promise<BrokerOrder[]> {
  const { row, adapter, session } = await open(actor, connectionId, { kind: "read", capability: "orders" });
  return guarded(row, () => adapter.getOrders!(session));
}

export async function getExecutions(actor: BrokerActor, connectionId: string, limit = 20): Promise<BrokerExecution[]> {
  const { row, adapter, session } = await open(actor, connectionId, { kind: "read", capability: "executions" });
  return guarded(row, () => adapter.getExecutions!(session, { limit }));
}

export async function resolveSymbol(actor: BrokerActor, connectionId: string, ref: InstrumentRef & { isin?: string | null }): Promise<SymbolResolution> {
  const { row, adapter, session } = await open(actor, connectionId, { kind: "read", capability: "instruments" });
  if (!adapter.info.markets.includes(ref.market)) return { status: "unsupported", reason: `${adapter.info.name} no opera en el mercado ${ref.market}` };
  return guarded(row, () => adapter.resolveSymbol!(session, ref));
}

export async function searchInstruments(actor: BrokerActor, connectionId: string, query: string): Promise<BrokerInstrument[]> {
  const { row, adapter, session } = await open(actor, connectionId, { kind: "read", capability: "instruments" });
  if (!adapter.searchInstruments) throw new BrokerError("unsupported", `${adapter.info.name} no permite buscar instrumentos`, { provider: adapter.info.id });
  return guarded(row, () => adapter.searchInstruments!(session, query.slice(0, 60)));
}

export async function getOrder(actor: BrokerActor, connectionId: string, orderId: string): Promise<BrokerOrder | null> {
  const { row, adapter, session } = await open(actor, connectionId, { kind: "read", capability: "order_status" });
  return guarded(row, () => adapter.getOrder!(session, orderId));
}

// ---------------------------------------------------------------------------
// Órdenes (con auditoría e idempotencia)
// ---------------------------------------------------------------------------
type AuditRow = broker_orders;

const resultOf = (r: AuditRow, duplicate: boolean): PlaceOrderResult => ({
  requestId: r.id,
  orderId: r.provider_order_id,
  status: r.status as OrderStatus,
  providerStatus: r.provider_status,
  duplicate,
  environment: r.environment === "real" ? "real" : "demo",
});

/** Identificador de orden para el proveedor: corto, sin guiones y siempre el mismo para una solicitud. */
const clientOrderIdOf = (requestId: string) => `crs${requestId.replace(/-/g, "")}`.slice(0, 35);

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Envía una orden. Si la clave de idempotencia ya existe en esta conexión, no se envía nada:
 * se devuelve lo registrado o, si quedó a medias, se consulta al bróker su estado.
 */
export async function placeOrder(actor: BrokerActor, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const { row, adapter, session } = await open(actor, input.connectionId, { kind: "trade", capability: "place_order" });
  const order = validateOrder(input, record(row), adapter.info);
  if (order.currency && row.currency && order.currency.toUpperCase() !== row.currency.toUpperCase()) {
    throw new BrokerError("invalid_request", `La cuenta opera en ${row.currency}, no en ${order.currency}`, { provider: row.provider });
  }

  const existing = await prisma.broker_orders.findUnique({ where: { connection_id_idempotency_key: { connection_id: row.id, idempotency_key: order.idempotencyKey } } });
  if (existing) return settleExisting(existing, adapter, session);

  // Símbolo del proveedor: el ya vinculado o el que resuelva el adaptador.
  let providerSymbol = order.providerSymbol ?? null;
  if (!providerSymbol) {
    if (!adapter.resolveSymbol) throw new BrokerError("invalid_request", "Indica el símbolo del proveedor", { provider: row.provider });
    const r = await guarded(row, () => adapter.resolveSymbol!(session, order.instrument));
    if (r.status !== "ok") {
      throw new BrokerError(r.status === "unsupported" ? "unsupported" : "instrument_not_found", r.status === "unsupported" ? r.reason : `No se pudo vincular ${order.instrument.symbol} con ${adapter.info.name} (${r.status === "ambiguous" ? "varios candidatos" : "no encontrado"})`, { provider: row.provider });
    }
    providerSymbol = r.instrument.providerSymbol;
  }

  // 1) Se registra la intención ANTES de enviar: la clave única impide dos envíos simultáneos.
  let audit: AuditRow;
  try {
    audit = await prisma.broker_orders.create({
      data: {
        connection_id: row.id,
        user_id: row.user_id,
        workspace_id: row.workspace_id,
        provider: row.provider,
        environment: row.environment,
        actor: actorLabel(actor),
        idempotency_key: order.idempotencyKey,
        reference: order.reference?.slice(0, 200) ?? null,
        symbol: order.instrument.symbol,
        market: order.instrument.market,
        provider_symbol: providerSymbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        limit_price: order.limitPrice,
        stop_price: order.stopPrice,
        time_in_force: order.timeInForce,
        status: "pending_submit",
      },
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const again = await prisma.broker_orders.findUnique({ where: { connection_id_idempotency_key: { connection_id: row.id, idempotency_key: order.idempotencyKey } } });
    return settleExisting(again!, adapter, session);
  }

  // 2) Un único envío. Sin reintentos.
  try {
    const r = await adapter.placeOrder!(session, {
      providerSymbol,
      side: order.side,
      type: order.type,
      quantity: order.quantity,
      limitPrice: order.limitPrice,
      stopPrice: order.stopPrice,
      timeInForce: order.timeInForce,
      clientOrderId: clientOrderIdOf(audit.id),
    });
    const done = await prisma.broker_orders.update({
      where: { id: audit.id },
      data: { status: r.status, provider_order_id: r.orderId, provider_status: r.providerStatus, response_json: r as unknown as Prisma.InputJsonValue, updated_at: new Date() },
    });
    return resultOf(done, false);
  } catch (e) {
    const be = e instanceof BrokerError ? e : new BrokerError("unknown_outcome", "Error inesperado al enviar la orden: comprueba su estado antes de repetir", { provider: row.provider });
    // «unknown_outcome»: pudo llegar. Cualquier otro error del proveedor: no se ejecutó.
    const status: OrderStatus = be.code === "unknown_outcome" ? "unknown" : "rejected";
    await prisma.broker_orders.update({ where: { id: audit.id }, data: { status, error_code: be.code, error_message: be.message.slice(0, 400), updated_at: new Date() } });
    await markError(row, be);
    throw be;
  }
}

async function settleExisting(existing: AuditRow, adapter: BrokerAdapter, session: BrokerSession): Promise<PlaceOrderResult> {
  if (onExistingRequest({ status: existing.status as OrderStatus, orderId: existing.provider_order_id }) === "return") return resultOf(existing, true);
  return resultOf(await reconcileRow(existing, adapter, session), true);
}

/**
 * Averigua cómo acabó una orden de resultado incierto. Nunca la reenvía.
 * Si no tiene id del proveedor, busca entre las abiertas una única coincidencia (valor, sentido y cantidad).
 */
async function reconcileRow(audit: AuditRow, adapter: BrokerAdapter, session: BrokerSession): Promise<AuditRow> {
  let found: BrokerOrder | null = null;
  if (audit.provider_order_id && adapter.getOrder) {
    found = await adapter.getOrder(session, audit.provider_order_id);
  } else if (!audit.provider_order_id && adapter.findOrderByClientId && audit.provider_symbol) {
    // El proveedor guarda nuestro identificador: respuesta exacta, sin adivinar.
    found = await adapter.findOrderByClientId(session, { providerSymbol: audit.provider_symbol, clientOrderId: clientOrderIdOf(audit.id) });
  } else if (!audit.provider_order_id && adapter.getOrders) {
    const candidates = (await adapter.getOrders(session)).filter(
      (o) => o.providerSymbol === audit.provider_symbol && o.side === audit.side && Math.abs(o.quantity - audit.quantity) < 1e-9,
    );
    if (candidates.length === 1) found = candidates[0];
  }
  if (!found) {
    return prisma.broker_orders.update({
      where: { id: audit.id },
      data: {
        status: audit.status === "pending_submit" ? "unknown" : audit.status,
        error_message: "No se ha podido confirmar el resultado: revisa la cuenta del bróker antes de repetir con otra clave",
        updated_at: new Date(),
      },
    });
  }
  return prisma.broker_orders.update({
    where: { id: audit.id },
    data: { status: found.status, provider_order_id: found.orderId, provider_status: found.providerStatus, updated_at: new Date() },
  });
}

/** Consulta al bróker el estado de una orden registrada (y actualiza el registro). */
export async function refreshOrder(actor: BrokerActor, requestId: string): Promise<PlaceOrderResult> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new BrokerError("invalid_request", "Solicitud no válida");
  const audit = await prisma.broker_orders.findUnique({ where: { id: requestId } });
  if (!audit) throw new BrokerError("not_found", "Solicitud no encontrada");
  const { adapter, session } = await open(actor, audit.connection_id, { kind: "read", capability: "order_status" });
  return resultOf(await reconcileRow(audit, adapter, session), false);
}

/** Cancela una orden abierta, si el proveedor lo permite. */
export async function cancelOrder(actor: BrokerActor, connectionId: string, orderId: string) {
  const { row, adapter, session } = await open(actor, connectionId, { kind: "trade", capability: "cancel_order" });
  await guarded(row, () => adapter.cancelOrder!(session, orderId));
  await prisma.broker_orders.updateMany({
    where: { connection_id: row.id, provider_order_id: orderId },
    data: { status: "cancelled", provider_status: "CANCELLATION_REQUESTED", updated_at: new Date() },
  });
  return { orderId, requested: true as const };
}

/** Registro de órdenes del usuario (auditoría), lo más reciente primero. */
export async function orderLog(actor: BrokerActor, limit = 30) {
  const rows = await prisma.broker_orders.findMany({
    where: { user_id: actorUserId(actor), workspace_id: actor.workspaceId },
    orderBy: { created_at: "desc" },
    take: Math.max(1, Math.min(100, limit)),
  });
  return rows.map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    provider: r.provider,
    environment: r.environment,
    actor: r.actor,
    reference: r.reference,
    symbol: r.symbol,
    side: r.side,
    type: r.type,
    quantity: r.quantity,
    limitPrice: r.limit_price,
    stopPrice: r.stop_price,
    status: r.status as OrderStatus,
    orderId: r.provider_order_id,
    error: r.error_message,
    createdAt: r.created_at.toISOString(),
  }));
}

/**
 * Conexión que usa la cartera de Trading de un espacio, y el actor «automático» que actúa en nombre
 * de su dueño. Solo la usan los automatismos de ese mismo espacio (el permiso «auto» lo decide el dueño).
 */
export async function tradingConnection(workspaceId: string, label: string): Promise<{ connectionId: string; actor: BrokerActor; environment: BrokerEnvironment; providerName: string } | null> {
  const id = await tradingConnectionId(workspaceId);
  if (!id) return null;
  const row = await prisma.broker_connections.findUnique({ where: { id } });
  if (!row || row.workspace_id !== workspaceId || row.status === "disconnected") return null;
  return {
    connectionId: row.id,
    actor: { kind: "automation", onBehalfOfUserId: row.user_id, workspaceId, label },
    environment: row.environment === "real" ? "real" : "demo",
    providerName: brokerRegistry.has(row.provider) ? brokerRegistry.get(row.provider).info.name : row.provider,
  };
}
