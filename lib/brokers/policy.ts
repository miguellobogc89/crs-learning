// lib/brokers/policy.ts
// Reglas de acceso del módulo de brókeres: de quién es la conexión, qué permisos concedió, en qué
// entorno opera y si el proveedor soporta lo que se pide. Puro: sin red ni base de datos.
// No decide qué comprar, cuánto ni cuándo: eso es de los agentes y de la gestión de riesgo.
import {
  actorUserId,
  BROKER_PERMISSIONS,
  BrokerError,
  FINAL_ORDER_STATUSES,
  type BrokerActor,
  type BrokerCapability,
  type BrokerEnvironment,
  type BrokerPermission,
  type OrderStatus,
  type PlaceOrderInput,
  type ProviderInfo,
} from "./types";

/** Lo que la política necesita saber de una conexión guardada. */
export type ConnectionRecord = {
  id: string;
  userId: string;
  workspaceId: string;
  provider: string;
  environment: BrokerEnvironment;
  status: "active" | "error" | "disconnected";
  permissions: BrokerPermission[];
};

export type PolicyOptions = {
  /** El entorno real solo se puede usar si el servidor lo habilita expresamente. */
  realEnabled: boolean;
};

export type Access = { kind: "read"; capability: BrokerCapability } | { kind: "trade"; capability: "place_order" | "cancel_order" } | { kind: "manage" };

export const parsePermissions = (v: unknown): BrokerPermission[] =>
  Array.isArray(v) ? BROKER_PERMISSIONS.filter((p) => v.includes(p)) : [];

/** Operar implica leer; el permiso automático implica operar. */
export function normalizePermissions(list: BrokerPermission[]): BrokerPermission[] {
  const set = new Set(list);
  if (set.has("auto")) set.add("trade");
  if (set.has("trade")) set.add("read");
  return BROKER_PERMISSIONS.filter((p) => set.has(p));
}

export function realEnabledFromEnv(env: Record<string, string | undefined> = process.env) {
  return env.BROKERS_REAL_ENABLED === "true";
}

/** Lanza BrokerError si el actor no puede hacer `access` con esta conexión. */
export function authorize(conn: ConnectionRecord | null, actor: BrokerActor, access: Access, provider: ProviderInfo | null, opts: PolicyOptions): ConnectionRecord {
  if (!conn) throw new BrokerError("not_connected", "La conexión no existe");
  // Propiedad: la conexión es del usuario (y del espacio) que la usa. Nunca de otro.
  if (conn.userId !== actorUserId(actor) || conn.workspaceId !== actor.workspaceId) {
    throw new BrokerError("forbidden", "Esta conexión no es tuya", { provider: conn.provider });
  }
  if (access.kind === "manage") {
    if (actor.kind !== "user") throw new BrokerError("forbidden", "Solo el usuario puede gestionar sus conexiones", { provider: conn.provider });
    return conn;
  }
  if (conn.status !== "active") throw new BrokerError("not_connected", "La conexión no está activa: vuelve a conectarla", { provider: conn.provider });
  if (conn.environment === "real" && !opts.realEnabled) {
    throw new BrokerError("environment_disabled", "Las operaciones con dinero real no están habilitadas en este servidor", { provider: conn.provider });
  }
  if (!provider || provider.availability !== "available") throw new BrokerError("unsupported", "Proveedor no disponible", { provider: conn.provider });
  if (!provider.environments.includes(conn.environment)) {
    throw new BrokerError("unsupported", `${provider.name} no admite el entorno ${conn.environment}`, { provider: conn.provider });
  }
  if (!provider.capabilities.includes(access.capability)) {
    throw new BrokerError("unsupported", `${provider.name} no permite esta operación (${access.capability})`, { provider: conn.provider });
  }
  const perms = normalizePermissions(conn.permissions);
  if (access.kind === "read" && !perms.includes("read")) {
    throw new BrokerError("permission_denied", "No has dado permiso de lectura a esta conexión", { provider: conn.provider });
  }
  if (access.kind === "trade") {
    const need: BrokerPermission = actor.kind === "automation" ? "auto" : "trade";
    if (!perms.includes(need)) {
      throw new BrokerError(
        "permission_denied",
        need === "auto" ? "No has autorizado a los automatismos de CRS a operar con esta conexión" : "No has dado permiso para operar con esta conexión",
        { provider: conn.provider },
      );
    }
  }
  return conn;
}

const KEY_RE = /^[A-Za-z0-9:_.\-]{6,120}$/;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Valida una orden contra la conexión y las capacidades del proveedor. Devuelve la orden saneada. */
export function validateOrder(input: PlaceOrderInput, conn: ConnectionRecord, provider: ProviderInfo) {
  const fail = (code: "invalid_request" | "unsupported" | "environment_mismatch", msg: string) => new BrokerError(code, msg, { provider: provider.id });
  // Nunca se convierte una orden demo en real (ni al revés): el entorno pedido debe ser el de la conexión.
  if (input.environment !== conn.environment) throw fail("environment_mismatch", `La orden es para ${input.environment} y la conexión es ${conn.environment}`);
  if (!KEY_RE.test(input.idempotencyKey ?? "")) throw fail("invalid_request", "Falta una clave de idempotencia válida");
  if (input.side !== "buy" && input.side !== "sell") throw fail("invalid_request", "Sentido de la orden no válido");
  if (!provider.orderTypes.includes(input.type)) throw fail("unsupported", `${provider.name} no admite órdenes de tipo ${input.type}`);
  if (!input.instrument || typeof input.instrument.symbol !== "string" || !input.instrument.symbol.trim()) throw fail("invalid_request", "Falta el instrumento");
  if (!provider.markets.includes(input.instrument.market)) throw fail("unsupported", `${provider.name} no opera en el mercado ${input.instrument.market}`);
  if (!finite(input.quantity) || input.quantity <= 0) throw fail("invalid_request", "Cantidad no válida");
  const needsLimit = input.type === "limit" || input.type === "stop_limit";
  const needsStop = input.type === "stop" || input.type === "stop_limit";
  if (needsLimit && !(finite(input.limitPrice) && input.limitPrice > 0)) throw fail("invalid_request", "La orden limitada necesita precio límite");
  if (needsStop && !(finite(input.stopPrice) && input.stopPrice > 0)) throw fail("invalid_request", "La orden stop necesita precio de activación");
  if (input.providerSymbol != null && !/^[A-Za-z0-9_.:/\-]{1,80}$/.test(input.providerSymbol)) throw fail("invalid_request", "Símbolo del proveedor no válido");
  return {
    ...input,
    instrument: { symbol: input.instrument.symbol.trim().toUpperCase(), market: input.instrument.market },
    limitPrice: needsLimit ? input.limitPrice! : null,
    stopPrice: needsStop ? input.stopPrice! : null,
    timeInForce: input.timeInForce ?? (input.type === "market" ? "day" : "gtc"),
  };
}

/**
 * Qué hacer cuando ya existe un registro con la misma clave de idempotencia:
 * - si se sabe cómo acabó (o está abierta con su id), se devuelve tal cual, sin enviar nada;
 * - si quedó a medias o en estado desconocido, hay que consultar al bróker antes de nada;
 * - si falló antes de llegar al bróker (rechazo de validación), también se devuelve: para repetir hay que usar otra clave.
 */
export function onExistingRequest(row: { status: OrderStatus; orderId: string | null }): "return" | "reconcile" {
  if (FINAL_ORDER_STATUSES.includes(row.status)) return "return";
  if ((row.status === "open" || row.status === "partially_filled") && row.orderId) return "return";
  return "reconcile";
}
