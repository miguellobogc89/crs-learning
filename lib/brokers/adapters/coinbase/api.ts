// lib/brokers/adapters/coinbase/api.ts
// Comunicación con la API REST de Coinbase Advanced Trade: JWT por petición, lista cerrada de endpoints
// (ninguno de envíos ni retiros), caché corta de lecturas y traducción de sus errores al formato común.
// Un POST nunca se reintenta: si no hay respuesta clara, el resultado es «unknown_outcome».
import { BrokerError, type BrokerErrorCode } from "../../types";
import type { BrokerSession } from "../../adapter";
import { buildJwt, HOST, normalizeCredentials } from "./signing";

export const PROVIDER_ID = "coinbase";
const ROOT = `https://${HOST}`;
/** Coinbase no tiene entorno de pruebas para Advanced Trade al contado: solo cuenta real. */
export const ENABLED_ENVIRONMENTS = ["real"] as const;

/** Endpoints permitidos. Las rutas con un id se comprueban por su prefijo. */
const ENDPOINTS: { method: string; path: RegExp }[] = [
  { method: "GET", path: /^\/api\/v3\/brokerage\/market\/products$/ },
  { method: "GET", path: /^\/api\/v3\/brokerage\/accounts$/ },
  { method: "GET", path: /^\/api\/v3\/brokerage\/key_permissions$/ },
  { method: "GET", path: /^\/api\/v3\/brokerage\/orders\/historical\/batch$/ },
  { method: "GET", path: /^\/api\/v3\/brokerage\/orders\/historical\/fills$/ },
  { method: "GET", path: /^\/api\/v3\/brokerage\/orders\/historical\/[A-Za-z0-9-]{1,64}$/ },
  { method: "POST", path: /^\/api\/v3\/brokerage\/orders$/ },
  { method: "POST", path: /^\/api\/v3\/brokerage\/orders\/batch_cancel$/ },
];

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type ApiDeps = { fetch: Fetcher; now: () => number };
export const defaultDeps = (): ApiDeps => ({ fetch: (url, init) => fetch(url, init), now: () => Date.now() });

const err = (code: BrokerErrorCode, message: string, retryable = false) => new BrokerError(code, message, { provider: PROVIDER_ID, retryable });

/** Traducción de los errores de Coinbase ({ error, message }) al formato común. */
export function mapCoinbaseError(status: number, code: string, msg: string, write: boolean): BrokerError {
  const text = `Coinbase: ${msg || code || `error ${status}`}`;
  if (status === 429) return err("rate_limited", "Coinbase: demasiadas peticiones; espera un poco", true);
  if (status === 401) return err("auth_failed", "Coinbase rechazó la clave (nombre de la clave, clave privada ECDSA o IP permitida)");
  if (status === 403 || code === "PERMISSION_DENIED") return err("auth_failed", "La clave de Coinbase no tiene permiso para esto (activa «View» y «Trade»)");
  if (status === 404 || code === "NOT_FOUND") return err("not_found", "Coinbase no encuentra esa orden");
  if (status >= 500) return write ? err("unknown_outcome", "Coinbase no confirmó la orden: comprueba su estado antes de repetir") : err("provider_unavailable", text, true);
  return err("invalid_request", text);
}

/** Motivo técnico de un fallo de red (DNS, conexión cortada, tiempo agotado, certificado…). */
export function networkCause(e: unknown): string {
  const c = (e as { cause?: { code?: unknown; message?: unknown } } | null)?.cause;
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "tiempo de espera agotado";
  const code = typeof c?.code === "string" ? c.code : null;
  const known: Record<string, string> = {
    ENOTFOUND: "no se encuentra el servidor: DNS o red bloqueada",
    ECONNREFUSED: "conexión rechazada",
    ECONNRESET: "conexión cortada: posible cortafuegos o proxy",
    ETIMEDOUT: "tiempo de espera agotado",
    UND_ERR_CONNECT_TIMEOUT: "tiempo de espera agotado al conectar",
    SELF_SIGNED_CERT_IN_CHAIN: "certificado no válido: posible proxy de empresa",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "certificado no válido: posible proxy de empresa",
  };
  if (code) return known[code] ?? code;
  return typeof c?.message === "string" ? c.message.slice(0, 120) : e instanceof Error ? e.message.slice(0, 120) : "error de red";
}

type Params = Record<string, string | number | string[] | undefined>;

export function createApi(deps: ApiDeps) {
  /** session null = petición pública (sin firma). */
  async function call(session: BrokerSession | null, method: "GET" | "POST", path: string, params: Params = {}, body?: Record<string, unknown>): Promise<unknown> {
    if (!ENDPOINTS.some((e) => e.method === method && e.path.test(path))) throw err("invalid_request", "Endpoint de Coinbase no permitido");
    if (session && !(ENABLED_ENVIRONMENTS as readonly string[]).includes(session.environment)) throw err("environment_disabled", `Coinbase: entorno ${session.environment} no habilitado`);
    const write = method !== "GET";
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      for (const one of Array.isArray(v) ? v : [v]) query.append(k, String(one));
    }
    const url = `${ROOT}${path}${query.size ? `?${query}` : ""}`;
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (session) {
      const { name, secret } = normalizeCredentials(session.credentials.apiKey ?? "", session.credentials.apiSecret ?? "");
      if (!name || !secret) throw err("misconfigured", "Faltan el nombre o la clave privada de la API de Coinbase");
      try {
        headers.Authorization = `Bearer ${buildJwt(name, secret, method, path, deps.now())}`;
      } catch (e) {
        throw err("auth_failed", e instanceof Error ? e.message : "La clave privada de Coinbase no es válida");
      }
    }
    let res: Response;
    try {
      res = await deps.fetch(url, { method, headers, body: payload, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      if (write) throw err("unknown_outcome", "Sin respuesta de Coinbase: comprueba el estado de la orden antes de repetir");
      throw err("provider_unavailable", `No se pudo conectar con Coinbase (${networkCause(e)})`, true);
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      if (res.ok && write) throw err("unknown_outcome", "Coinbase devolvió una respuesta no válida: comprueba la orden antes de repetir");
    }
    if (!res.ok) {
      const e = (data ?? {}) as { error?: unknown; message?: unknown; error_details?: unknown };
      const code = typeof e.error === "string" ? e.error : "";
      const msg = typeof e.message === "string" ? e.message : typeof e.error_details === "string" ? e.error_details : "";
      throw mapCoinbaseError(res.status, code, msg.slice(0, 200), write);
    }
    if (data === null) throw err("provider_unavailable", "Coinbase devolvió una respuesta vacía");
    return data;
  }

  const cache = new Map<string, { value: unknown; until: number }>();
  async function read(session: BrokerSession | null, path: string, params: Params, ttlMs: number) {
    const key = `${session?.connectionId ?? "public"}:${path}:${JSON.stringify(params)}`;
    const hit = cache.get(key);
    if (hit && hit.until > deps.now()) return hit.value;
    const value = await call(session, "GET", path, params);
    cache.set(key, { value, until: deps.now() + ttlMs });
    return value;
  }
  function invalidate(session: BrokerSession) {
    for (const k of cache.keys()) if (k.startsWith(`${session.connectionId}:`)) cache.delete(k);
  }

  const inFlight = new Set<string>();
  async function exclusive<T>(session: BrokerSession, product: string, fn: () => Promise<T>): Promise<T> {
    const k = `${session.connectionId}:${product}`;
    if (inFlight.has(k)) throw err("conflict", "Ya hay otra operación en curso para este par");
    inFlight.add(k);
    try {
      return await fn();
    } finally {
      inFlight.delete(k);
      invalidate(session);
    }
  }

  return { call, read, exclusive };
}
