// lib/brokers/types.ts
// Contratos comunes del módulo de brókeres. Todo lo que entra y sale del módulo tiene esta forma,
// sea cual sea el proveedor. Puro: lo usan el servidor, los tests y la interfaz.

/** Entorno de una conexión. Se fija al conectar y nunca cambia: una conexión demo no puede operar en real. */
export type BrokerEnvironment = "demo" | "real";

/** Operaciones que un proveedor puede soportar. Cada adaptador declara solo las suyas. */
export type BrokerCapability =
  | "accounts" // cuentas y saldos
  | "positions" // posiciones abiertas
  | "orders" // órdenes abiertas
  | "executions" // operaciones ejecutadas (historial)
  | "instruments" // catálogo y validación de símbolos
  | "place_order" // enviar órdenes
  | "order_status" // estado de una orden concreta
  | "cancel_order"; // cancelar órdenes

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type TimeInForce = "day" | "gtc";

/** Mercados de CRS: bolsa (acciones) y crypto. Un proveedor puede soportar uno, otro o ambos. */
export type Market = "bolsa" | "crypto";

/**
 * Permisos que concede el usuario a cada conexión:
 * - read: consultar saldos, posiciones, órdenes e historial.
 * - trade: enviar y cancelar órdenes pedidas por el propio usuario.
 * - auto: además, que los automatismos de CRS (guardián, modo automático) envíen órdenes en su nombre.
 */
export type BrokerPermission = "read" | "trade" | "auto";
export const BROKER_PERMISSIONS: BrokerPermission[] = ["read", "trade", "auto"];

/** Estados normalizados de una orden. */
export type OrderStatus =
  | "pending_submit" // registrada en CRS, aún no enviada (o envío en curso)
  | "open" // aceptada por el bróker, pendiente de ejecutar
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected"
  | "expired"
  | "unknown"; // no sabemos qué pasó: hay que consultar antes de repetir

export const FINAL_ORDER_STATUSES: OrderStatus[] = ["filled", "cancelled", "rejected", "expired"];

/** Quién pide la operación. El módulo lo registra; no decide nada con ello salvo los permisos. */
export type BrokerActor =
  | { kind: "user"; userId: string; workspaceId: string; canManage: boolean }
  /** Automatismo de CRS que actúa por un usuario (guardián, modo automático, agente de su cartera). */
  | { kind: "automation"; onBehalfOfUserId: string; workspaceId: string; label: string };

export const actorUserId = (a: BrokerActor) => (a.kind === "user" ? a.userId : a.onBehalfOfUserId);
export const actorLabel = (a: BrokerActor) => (a.kind === "user" ? "usuario" : a.label);

/** Instrumento tal como lo conoce CRS (símbolo interno, p. ej. «IBE.MC» o «BTC-EUR»). */
export type InstrumentRef = { symbol: string; market: Market };

/** Instrumento del proveedor, normalizado. */
export type BrokerInstrument = {
  /** Símbolo interno de CRS, si se ha podido vincular. */
  symbol: string | null;
  /** Identificador del proveedor (ticker, par, conid…). */
  providerSymbol: string;
  name: string;
  market: Market | null;
  currency: string | null;
  isin: string | null;
  /** Paso mínimo de cantidad (1 = acciones enteras), si el proveedor lo informa. */
  quantityStep: number | null;
};

export type SymbolResolution =
  | { status: "ok"; instrument: BrokerInstrument; how: string }
  | { status: "ambiguous"; candidates: BrokerInstrument[] }
  | { status: "not_found" }
  | { status: "unsupported"; reason: string };

export type BrokerAccount = {
  /** Identificador de la cuenta en el proveedor (o «default» si la API no lo expone). */
  accountId: string;
  label: string;
  environment: BrokerEnvironment;
  currency: string;
  /** Efectivo disponible para operar. */
  cashAvailable: number;
  /** Valor total (efectivo + inversiones). */
  totalValue: number;
  investedValue: number | null;
};

export type BrokerPosition = {
  symbol: string | null;
  providerSymbol: string;
  name: string | null;
  quantity: number;
  /** Cantidad libre para vender (no reservada por otras órdenes). */
  quantityAvailable: number | null;
  averagePrice: number;
  currentPrice: number | null;
  currency: string | null;
};

export type BrokerOrder = {
  /** Identificador de la orden en el proveedor. */
  orderId: string;
  symbol: string | null;
  providerSymbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  /** Estado tal como lo da el proveedor (para auditoría y ayuda). */
  providerStatus: string | null;
  quantity: number;
  filledQuantity: number | null;
  limitPrice: number | null;
  stopPrice: number | null;
  averageFillPrice: number | null;
  /** Si la creó una integración por API (las creadas a mano en la app del bróker no se tocan). */
  createdByApi: boolean | null;
  createdAt: string | null;
};

export type BrokerExecution = {
  executionId: string;
  orderId: string | null;
  symbol: string | null;
  providerSymbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  currency: string | null;
  executedAt: string | null;
};

/** Petición de orden normalizada. La decisión (qué, cuánto) la toma quien llama, no el módulo. */
export type PlaceOrderInput = {
  connectionId: string;
  /** Se exige explícitamente y tiene que coincidir con el de la conexión. */
  environment: BrokerEnvironment;
  instrument: InstrumentRef;
  /** Opcional: ticker del proveedor ya vinculado (si no, lo resuelve el adaptador). */
  providerSymbol?: string | null;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number | null;
  stopPrice?: number | null;
  timeInForce?: TimeInForce;
  /** Moneda esperada; si la cuenta opera en otra, se rechaza. */
  currency?: string | null;
  /**
   * Clave de idempotencia: la misma clave en la misma conexión nunca envía dos órdenes.
   * Debe identificar la intención (p. ej. «bracket:<id>:entrada»).
   */
  idempotencyKey: string;
  /** Contexto para auditoría (propuesta, operación protegida…). */
  reference?: string | null;
};

export type PlaceOrderResult = {
  /** Identificador interno del registro de auditoría. */
  requestId: string;
  orderId: string | null;
  status: OrderStatus;
  providerStatus: string | null;
  /** true si la clave ya existía: no se ha enviado nada nuevo. */
  duplicate: boolean;
  environment: BrokerEnvironment;
};

// ---------------------------------------------------------------------------
// Errores normalizados
// ---------------------------------------------------------------------------
export type BrokerErrorCode =
  | "not_connected" // no hay conexión o está desconectada / con error
  | "forbidden" // la conexión no es de quien la usa
  | "permission_denied" // el usuario no concedió ese permiso
  | "environment_mismatch" // demo ≠ real
  | "environment_disabled" // entorno no habilitado en este servidor
  | "unsupported" // el proveedor no soporta la operación, el mercado o el tipo de orden
  | "invalid_request" // datos de entrada no válidos
  | "instrument_not_found"
  | "insufficient_funds"
  | "conflict" // otra operación en curso, orden duplicada en el bróker, posición inexistente…
  | "not_found" // la orden o el recurso ya no existe
  | "rate_limited"
  | "auth_failed" // credenciales rechazadas
  | "provider_unavailable" // red, caída o respuesta no válida del proveedor
  | "unknown_outcome" // la orden pudo haberse enviado: no repetir sin consultar
  | "misconfigured"; // falta configuración del servidor (clave de cifrado, credenciales…)

const HTTP: Record<BrokerErrorCode, number> = {
  not_connected: 409,
  forbidden: 403,
  permission_denied: 403,
  environment_mismatch: 400,
  environment_disabled: 403,
  unsupported: 400,
  invalid_request: 400,
  instrument_not_found: 404,
  insufficient_funds: 409,
  conflict: 409,
  not_found: 404,
  rate_limited: 429,
  auth_failed: 502,
  provider_unavailable: 502,
  unknown_outcome: 502,
  misconfigured: 503,
};

export class BrokerError extends Error {
  readonly code: BrokerErrorCode;
  readonly provider: string | null;
  /** Se puede repetir la misma petición (solo lecturas o cuando se sabe que no se envió nada). */
  readonly retryable: boolean;
  constructor(code: BrokerErrorCode, message: string, opts: { provider?: string | null; retryable?: boolean } = {}) {
    super(message);
    this.name = "BrokerError";
    this.code = code;
    this.provider = opts.provider ?? null;
    this.retryable = opts.retryable ?? code === "rate_limited";
  }
  get httpStatus() {
    return HTTP[this.code];
  }
  toJSON() {
    return { error: this.message, code: this.code, provider: this.provider, retryable: this.retryable };
  }
}

export const isBrokerError = (e: unknown): e is BrokerError => e instanceof BrokerError;

// ---------------------------------------------------------------------------
// Descripción de un proveedor (lo que ve la interfaz y comprueba la política)
// ---------------------------------------------------------------------------
export type CredentialField = { key: string; label: string; secret: boolean; help?: string };

export type ProviderInfo = {
  id: string;
  name: string;
  /** Ruta pública o URL del logotipo. */
  logo: string | null;
  description: string;
  /** available: se puede conectar; soon: anunciado, sin adaptador todavía. */
  availability: "available" | "soon";
  environments: BrokerEnvironment[];
  markets: Market[];
  capabilities: BrokerCapability[];
  orderTypes: OrderType[];
  /** Lo que el usuario rellena al conectar (nunca vuelve al navegador una vez guardado). */
  credentialFields: CredentialField[];
  /** Particularidades que conviene enseñar (límites de la API, órdenes no soportadas…). */
  notes: string[];
};
