// lib/brokers/adapters/trading212/api.ts
// Comunicación con la API de Trading 212 (antes lib/trading/trading212.ts). Mantiene sus reglas:
// lista cerrada de endpoints, sin reintentar nunca un POST, caché corta para los límites de la API
// y validación estricta de cada respuesta. Ahora las credenciales llegan por conexión, no del .env.
import { BrokerError } from "../../types";
import type { BrokerSession } from "../../adapter";

export const PROVIDER_ID = "trading212";

const BASE: Record<string, string> = {
  demo: "https://demo.trading212.com/api/v0",
  real: "https://live.trading212.com/api/v0",
};
/**
 * Entornos que este adaptador usa de verdad. El real está preparado pero apagado: aunque alguien
 * construya una sesión «real», la petición no sale (defensa en profundidad además de la política).
 */
export const ENABLED_ENVIRONMENTS = ["demo"] as const;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type ApiDeps = { fetch: Fetcher; sleep: (ms: number) => Promise<void>; now: () => number };
export const defaultDeps = (): ApiDeps => ({
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
});

const FIXED_PATHS = new Set([
  "/equity/account/summary",
  "/equity/positions",
  "/equity/orders",
  "/equity/metadata/instruments",
  "/equity/history/orders",
  "/equity/orders/market",
  "/equity/orders/limit",
  "/equity/orders/stop",
  "/equity/orders/stop_limit",
]);

const err = (code: ConstructorParameters<typeof BrokerError>[0], message: string, retryable?: boolean) =>
  new BrokerError(code, message, { provider: PROVIDER_ID, retryable });

/** Mensaje de error del cuerpo de Trading 212, si lo trae. */
async function providerMessage(res: Response) {
  try {
    const body = (await res.json()) as { code?: unknown; message?: unknown; clarification?: unknown };
    return [body.code, body.message, body.clarification].filter((x) => typeof x === "string").join(": ").slice(0, 300);
  } catch {
    return "";
  }
}

export type Request = { method: "GET" | "DELETE" } | { method: "POST"; body: Record<string, unknown> };

export function createApi(deps: ApiDeps) {
  /** Una petición. Un POST nunca se reintenta: si no sabemos si llegó, es «unknown_outcome». */
  async function call(session: BrokerSession, path: string, req: Request = { method: "GET" }): Promise<unknown> {
    const orderId = path.startsWith("/equity/orders/") ? path.slice("/equity/orders/".length) : "";
    const base = path.split("?")[0];
    if (!FIXED_PATHS.has(base) && !/^\d{1,20}$/.test(orderId)) throw err("invalid_request", "Endpoint de Trading 212 no permitido");
    const root = (ENABLED_ENVIRONMENTS as readonly string[]).includes(session.environment) ? BASE[session.environment] : null;
    if (!root) throw err("environment_disabled", `Trading 212: entorno ${session.environment} no habilitado`);
    const { apiKey, apiSecret } = session.credentials;
    if (!apiKey || !apiSecret) throw err("misconfigured", "Faltan la clave o el secreto de la API de Trading 212");
    const isPost = req.method === "POST";

    let res: Response;
    try {
      res = await deps.fetch(`${root}${path}`, {
        method: req.method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
          Accept: "application/json",
          ...(isPost ? { "Content-Type": "application/json" } : {}),
        },
        ...(req.method === "POST" ? { body: JSON.stringify(req.body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Un POST pudo llegar aunque no tengamos respuesta.
      if (isPost || req.method === "DELETE") throw err("unknown_outcome", "Sin respuesta de Trading 212: comprueba el estado de la orden antes de repetir");
      throw err("provider_unavailable", "No se pudo conectar con Trading 212", true);
    }

    if (res.status === 429) throw err("rate_limited", "Trading 212: límite de consultas alcanzado; inténtalo pasados unos segundos", true);
    if (res.status === 401) throw err("auth_failed", "Trading 212 rechazó las credenciales");
    // 403: la clave es válida pero no tiene ese permiso en Trading 212 (no se marca la conexión como rota).
    if (res.status === 403) throw err("permission_denied", "La clave de Trading 212 no tiene permiso para esta operación (revisa los permisos de la clave en Trading 212)");
    if (res.status === 404) throw err("not_found", "Trading 212 no encuentra ese recurso");
    if (res.status >= 500) {
      if (isPost) throw err("unknown_outcome", `Trading 212 devolvió un error ${res.status}: comprueba el estado antes de repetir`);
      throw err("provider_unavailable", `Trading 212 devolvió un error ${res.status}`, !isPost);
    }
    if (!res.ok) {
      // 4xx: el bróker recibió la petición y la rechazó (no se ejecutó nada).
      const msg = await providerMessage(res);
      if (/insufficient|not enough|funds/i.test(msg)) throw err("insufficient_funds", `Trading 212: saldo insuficiente${msg ? ` (${msg})` : ""}`);
      throw err("invalid_request", `Trading 212 rechazó la petición (${res.status})${msg ? `: ${msg}` : ""}`);
    }
    if (req.method === "DELETE") return { ok: true };
    try {
      return await res.json();
    } catch {
      if (isPost) throw err("unknown_outcome", "Trading 212 devolvió una respuesta no válida: comprueba la orden antes de repetir");
      throw err("provider_unavailable", "Trading 212 devolvió una respuesta no válida");
    }
  }

  // Caché corta + deduplicación de lecturas, por conexión (cada clave tiene sus propios límites).
  const cache = new Map<string, { value?: unknown; expiresAt: number; pending?: Promise<unknown> }>();
  async function read(session: BrokerSession, path: string, ttlMs: number, retryWaitMs: number): Promise<unknown> {
    const key = `${session.connectionId}:${session.environment}:${path}`;
    const hit = cache.get(key);
    if (hit?.pending) return hit.pending;
    if (hit?.value !== undefined && hit.expiresAt > deps.now()) return hit.value;
    const pending = (async () => {
      try {
        return await call(session, path);
      } catch (e) {
        // Las lecturas sí se pueden repetir una vez tras un límite de consultas.
        if (!(e instanceof BrokerError) || e.code !== "rate_limited" || retryWaitMs <= 0) throw e;
        await deps.sleep(retryWaitMs);
        return call(session, path);
      }
    })();
    cache.set(key, { pending, expiresAt: 0 });
    try {
      const value = await pending;
      cache.set(key, { value, expiresAt: deps.now() + ttlMs });
      return value;
    } catch (e) {
      cache.delete(key);
      throw e;
    }
  }
  /** Tras una orden, saldo, posiciones y órdenes pueden cambiar. */
  function invalidate(session: BrokerSession) {
    for (const k of cache.keys()) if (k.startsWith(`${session.connectionId}:`) && !k.endsWith("/equity/metadata/instruments")) cache.delete(k);
  }

  // Bloqueo por valor: Trading 212 no admite bien dos operaciones simultáneas sobre el mismo instrumento.
  const inFlight = new Set<string>();
  async function exclusive<T>(session: BrokerSession, ticker: string, fn: () => Promise<T>): Promise<T> {
    const k = `${session.connectionId}:${ticker}`;
    if (inFlight.has(k)) throw err("conflict", "Ya hay otra operación en curso para este valor");
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

export type Api = ReturnType<typeof createApi>;
