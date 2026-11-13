// lib/brokers/adapters/binance/api.ts
// Comunicación con la API de Binance (spot): peticiones firmadas (HMAC-SHA256), lista cerrada de
// endpoints, desfase de reloj, límites de peticiones y traducción de sus errores al formato común.
// Un POST/DELETE nunca se reintenta: si no hay respuesta clara, el resultado es «unknown_outcome».
import { signPayload } from "./signing";
import { BrokerError, type BrokerErrorCode } from "../../types";
import type { BrokerSession } from "../../adapter";

export const PROVIDER_ID = "binance";

/** demo = Spot Testnet (dinero ficticio); real = cuenta de verdad. */
const BASE: Record<string, string> = {
  demo: "https://testnet.binance.vision",
  real: "https://api.binance.com",
};
export const ENABLED_ENVIRONMENTS = ["demo", "real"] as const;

const ENDPOINTS = new Set([
  "GET /api/v3/time",
  "GET /api/v3/exchangeInfo",
  "GET /api/v3/ticker/price",
  "GET /api/v3/account",
  "GET /api/v3/openOrders",
  "GET /api/v3/order",
  "GET /api/v3/myTrades",
  "POST /api/v3/order",
  "DELETE /api/v3/order",
  "GET /sapi/v1/account/apiRestrictions",
]);

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type ApiDeps = { fetch: Fetcher; now: () => number };
export const defaultDeps = (): ApiDeps => ({ fetch: (url, init) => fetch(url, init), now: () => Date.now() });

const err = (code: BrokerErrorCode, message: string, retryable?: boolean) => new BrokerError(code, message, { provider: PROVIDER_ID, retryable });

/** Traducción de los códigos de error de Binance (los que importan) al formato común. */
export function mapBinanceError(status: number, code: number | null, msg: string, write: boolean): BrokerError {
  const text = `Binance: ${msg || `error ${status}`}`;
  // Binance.com no da servicio a peticiones desde ubicaciones restringidas (p. ej. servidores en EE. UU.).
  if (status === 451 || /restricted location/i.test(msg))
    return err("provider_unavailable", "Binance rechaza la petición por la ubicación del servidor (restricted location): el servidor de la app tiene que ejecutarse en Europa");
  if (status === 429 || status === 418 || code === -1003) return err("rate_limited", "Binance: demasiadas peticiones; espera un poco", true);
  if (code === -2014 || code === -2015 || status === 401) return err("auth_failed", "Binance rechazó la clave (clave, IP permitida o permisos)");
  if (code === -2010 && /insufficient balance/i.test(msg)) return err("insufficient_funds", "Binance: saldo insuficiente");
  if (code === -2013) return err("not_found", "Binance no encuentra esa orden");
  if (code === -2011) return err("conflict", `${text} (no se pudo cancelar)`);
  if (code === -1121) return err("instrument_not_found", "Binance: par no válido");
  if (code === -1021) return err("provider_unavailable", "Binance: el reloj del servidor va desfasado; inténtalo de nuevo", true);
  if (code === -1013 || code === -1100 || code === -1102 || code === -1111 || code === -2010) return err("invalid_request", text);
  if (status >= 500) return write ? err("unknown_outcome", "Binance no confirmó la orden: comprueba su estado antes de repetir") : err("provider_unavailable", text, true);
  if (status === 403) return err("provider_unavailable", "Binance bloqueó la petición (cortafuegos)");
  return err("invalid_request", text);
}

type Params = Record<string, string | number | boolean | undefined>;

export function createApi(deps: ApiDeps) {
  // Desfase entre nuestro reloj y el de Binance (las firmas caducan en recvWindow).
  const offsets = new Map<string, { ms: number; at: number }>();
  async function offset(env: string) {
    const hit = offsets.get(env);
    if (hit && deps.now() - hit.at < 10 * 60_000) return hit.ms;
    const r = (await call({ connectionId: "time", environment: env as "demo", credentials: {} }, "GET", "/api/v3/time", {}, false)) as { serverTime?: number };
    const ms = typeof r?.serverTime === "number" ? r.serverTime - deps.now() : 0;
    offsets.set(env, { ms, at: deps.now() });
    return ms;
  }

  async function call(session: BrokerSession, method: "GET" | "POST" | "DELETE", path: string, params: Params = {}, signed = true): Promise<unknown> {
    if (!ENDPOINTS.has(`${method} ${path}`)) throw err("invalid_request", "Endpoint de Binance no permitido");
    const root = (ENABLED_ENVIRONMENTS as readonly string[]).includes(session.environment) ? BASE[session.environment] : null;
    if (!root) throw err("environment_disabled", `Binance: entorno ${session.environment} no habilitado`);
    const write = method !== "GET";
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) query.set(k, String(v));
    const headers: Record<string, string> = { Accept: "application/json" };
    if (signed) {
      const { apiKey, apiSecret } = session.credentials;
      if (!apiKey || !apiSecret) throw err("misconfigured", "Faltan la clave o el secreto de la API de Binance");
      query.set("recvWindow", "5000");
      query.set("timestamp", String(deps.now() + (await offset(session.environment))));
      let signature: string;
      try {
        signature = signPayload(apiSecret, query.toString());
      } catch (e) {
        throw err("misconfigured", e instanceof Error ? e.message : "Clave de Binance no válida");
      }
      query.set("signature", signature);
      headers["X-MBX-APIKEY"] = apiKey;
    }
    let res: Response;
    try {
      res = await deps.fetch(`${root}${path}${query.size ? `?${query}` : ""}`, { method, headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    } catch {
      if (write) throw err("unknown_outcome", "Sin respuesta de Binance: comprueba el estado de la orden antes de repetir");
      throw err("provider_unavailable", "No se pudo conectar con Binance", true);
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      if (res.ok && write) throw err("unknown_outcome", "Binance devolvió una respuesta no válida: comprueba la orden antes de repetir");
    }
    if (!res.ok) {
      const b = (body ?? {}) as { code?: unknown; msg?: unknown };
      throw mapBinanceError(res.status, typeof b.code === "number" ? b.code : null, typeof b.msg === "string" ? b.msg.slice(0, 200) : "", write);
    }
    if (body === null) throw err("provider_unavailable", "Binance devolvió una respuesta vacía");
    return body;
  }

  // Caché corta de lecturas por conexión (los pesos de la API se agotan rápido).
  const cache = new Map<string, { value: unknown; until: number }>();
  async function read(session: BrokerSession, path: string, params: Params, ttlMs: number, signed = true) {
    const key = `${session.connectionId}:${session.environment}:${path}:${JSON.stringify(params)}`;
    const hit = cache.get(key);
    if (hit && hit.until > deps.now()) return hit.value;
    const value = await call(session, "GET", path, params, signed);
    cache.set(key, { value, until: deps.now() + ttlMs });
    return value;
  }
  function invalidate(session: BrokerSession) {
    for (const k of cache.keys()) if (k.startsWith(`${session.connectionId}:`)) cache.delete(k);
  }

  // Una operación a la vez por par y conexión.
  const inFlight = new Set<string>();
  async function exclusive<T>(session: BrokerSession, symbol: string, fn: () => Promise<T>): Promise<T> {
    const k = `${session.connectionId}:${symbol}`;
    if (inFlight.has(k)) throw err("conflict", "Ya hay otra operación en curso para este par");
    inFlight.add(k);
    try {
      return await fn();
    } finally {
      inFlight.delete(k);
      invalidate(session);
    }
  }

  return { call, read, invalidate, exclusive };
}
