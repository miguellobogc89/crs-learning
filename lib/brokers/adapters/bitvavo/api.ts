// lib/brokers/adapters/bitvavo/api.ts
// Comunicación con la API REST de Bitvavo: peticiones firmadas (HMAC-SHA256 en hexadecimal de
// timestamp + MÉTODO + /v2/ruta[?consulta] + cuerpo), lista cerrada de endpoints (ninguno de retiros),
// desfase de reloj, caché corta de lecturas y traducción de sus errores al formato común.
// Un POST/DELETE nunca se reintenta: si no hay respuesta clara, el resultado es «unknown_outcome».
import { createHmac } from "node:crypto";
import { BrokerError, type BrokerErrorCode } from "../../types";
import type { BrokerSession } from "../../adapter";

export const PROVIDER_ID = "bitvavo";
const ROOT = "https://api.bitvavo.com";
/** Bitvavo no tiene entorno de pruebas público: solo cuenta real. */
export const ENABLED_ENVIRONMENTS = ["real"] as const;
/** Identificador del «operador» que exige Bitvavo en cada orden (MiCA): CRS. */
export const OPERATOR_ID = 21200;

const ENDPOINTS = new Set([
  "GET /time",
  "GET /markets",
  "GET /ticker/price",
  "GET /balance",
  "GET /account",
  "GET /ordersOpen",
  "GET /order",
  "GET /trades",
  "POST /order",
  "DELETE /order",
]);

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type ApiDeps = { fetch: Fetcher; now: () => number };
export const defaultDeps = (): ApiDeps => ({ fetch: (url, init) => fetch(url, init), now: () => Date.now() });

const err = (code: BrokerErrorCode, message: string, retryable = false) => new BrokerError(code, message, { provider: PROVIDER_ID, retryable });

/** Firma de Bitvavo (hex). `path` incluye /v2 y la consulta, si la hay. */
export function bitvavoSignature(secret: string, timestamp: number, method: string, path: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}${method}${path}${body}`).digest("hex");
}

/** Traducción de los errores de Bitvavo ({ errorCode, error }) al formato común. */
export function mapBitvavoError(status: number, code: number | null, msg: string, write: boolean): BrokerError {
  const text = `Bitvavo: ${msg || `error ${status}`}`;
  if (status === 429 || code === 105 || code === 112) return err("rate_limited", "Bitvavo: demasiadas peticiones; espera un poco", true);
  if (code === 300 || code === 301 || code === 302 || code === 305 || code === 309 || status === 401) return err("auth_failed", "Bitvavo rechazó la clave (clave, secreto o IP permitida)");
  if (code === 310) return err("auth_failed", "La clave de Bitvavo no tiene permiso para operar (activa «Operar con activos digitales»)");
  if (code === 311) return err("auth_failed", "La clave de Bitvavo no tiene permiso de lectura (activa «Ver información»)");
  if (code === 303 || code === 304) return err("provider_unavailable", "Bitvavo: el reloj va desfasado; inténtalo de nuevo", true);
  if (code === 216) return err("insufficient_funds", "Bitvavo: saldo insuficiente");
  if (code === 240 || status === 404) return err("not_found", "Bitvavo no encuentra esa orden");
  if (code === 233) return err("conflict", `${text} (ya no se puede cancelar)`);
  if (code === 109) return write ? err("unknown_outcome", "Bitvavo no respondió a tiempo: comprueba la orden antes de repetir") : err("provider_unavailable", text, true);
  if (status >= 500) return write ? err("unknown_outcome", "Bitvavo no confirmó la orden: comprueba su estado antes de repetir") : err("provider_unavailable", text, true);
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

type Params = Record<string, string | number | undefined>;

export function createApi(deps: ApiDeps) {
  let clock: { ms: number; at: number } | null = null;
  async function offset() {
    if (clock && deps.now() - clock.at < 10 * 60_000) return clock.ms;
    const r = (await call(null, "GET", "/time")) as { time?: number };
    clock = { ms: typeof r?.time === "number" ? r.time - deps.now() : 0, at: deps.now() };
    return clock.ms;
  }

  /** session null = petición pública (sin firma). */
  async function call(session: BrokerSession | null, method: "GET" | "POST" | "DELETE", path: string, params: Params = {}, body?: Record<string, unknown>): Promise<unknown> {
    if (!ENDPOINTS.has(`${method} ${path}`)) throw err("invalid_request", "Endpoint de Bitvavo no permitido");
    if (session && !(ENABLED_ENVIRONMENTS as readonly string[]).includes(session.environment)) throw err("environment_disabled", `Bitvavo: entorno ${session.environment} no habilitado`);
    const write = method !== "GET";
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) query.set(k, String(v));
    const full = `/v2${path}${query.size ? `?${query}` : ""}`;
    const payload = body ? JSON.stringify(body) : "";
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (session) {
      const { apiKey, apiSecret } = session.credentials;
      if (!apiKey || !apiSecret) throw err("misconfigured", "Faltan la clave o el secreto de la API de Bitvavo");
      const ts = deps.now() + (await offset());
      headers["Bitvavo-Access-Key"] = apiKey;
      headers["Bitvavo-Access-Timestamp"] = String(ts);
      headers["Bitvavo-Access-Signature"] = bitvavoSignature(apiSecret, ts, method, full, payload);
      headers["Bitvavo-Access-Window"] = "10000";
    }
    let res: Response;
    try {
      res = await deps.fetch(`${ROOT}${full}`, { method, headers, body: payload || undefined, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      if (write) throw err("unknown_outcome", "Sin respuesta de Bitvavo: comprueba el estado de la orden antes de repetir");
      throw err("provider_unavailable", `No se pudo conectar con Bitvavo (${networkCause(e)})`, true);
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      if (res.ok && write) throw err("unknown_outcome", "Bitvavo devolvió una respuesta no válida: comprueba la orden antes de repetir");
    }
    const e = data as { errorCode?: unknown; error?: unknown } | null;
    if (!res.ok || (e && !Array.isArray(e) && typeof e.errorCode === "number")) {
      throw mapBitvavoError(res.status, typeof e?.errorCode === "number" ? e.errorCode : null, typeof e?.error === "string" ? e.error.slice(0, 200) : "", write);
    }
    if (data === null) throw err("provider_unavailable", "Bitvavo devolvió una respuesta vacía");
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
  async function exclusive<T>(session: BrokerSession, market: string, fn: () => Promise<T>): Promise<T> {
    const k = `${session.connectionId}:${market}`;
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
