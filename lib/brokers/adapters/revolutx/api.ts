// lib/brokers/adapters/revolutx/api.ts
// Llamadas a la API REST de Revolut X (https://revx.revolut.com/api/1.0). Las privadas van firmadas con
// la clave Ed25519 del usuario: firma en base64 de «timestamp + MÉTODO + ruta (desde /api) + consulta
// (sin «?») + cuerpo (JSON compacto)», en las cabeceras X-Revx-API-Key, X-Revx-Timestamp y
// X-Revx-Signature. Nunca reintenta una escritura: si no sabe si llegó, «unknown_outcome».
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import type { BrokerSession } from "../../adapter";
import { BrokerError, type BrokerErrorCode } from "../../types";

export const ID = "revolutx";
const ROOT = "https://revx.revolut.com";
const PREFIX = "/api/1.0";

export type ApiDeps = { fetch: typeof fetch; now: () => number };
export const revxError = (code: BrokerErrorCode, message: string) => new BrokerError(code, message, { provider: ID });
const unknown = () => revxError("unknown_outcome", "Revolut X no confirmó la operación. Consulta su estado antes de repetir.");
const unavailable = () => revxError("provider_unavailable", "Revolut X no devolvió una respuesta válida.");

/** Cabecera DER de una clave privada Ed25519 en PKCS#8 (le sigue la semilla de 32 bytes). */
const ED25519_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const keys = new Map<string, KeyObject>();

/** Clave privada Ed25519: el PEM «PRIVATE KEY» que genera OpenSSL (aunque llegue en una línea) o la semilla en base64. */
export function privateKeyOf(raw: string): KeyObject {
  const text = raw.replace(/\\n/g, "\n").trim();
  const hit = keys.get(text);
  if (hit) return hit;
  let key: KeyObject;
  try {
    const pem = /-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/.exec(text);
    if (pem) {
      const lines = pem[1].replace(/\s+/g, "").match(/.{1,64}/g) ?? [];
      key = createPrivateKey(`-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`);
    } else {
      const bytes = Buffer.from(text.replace(/\s+/g, ""), "base64");
      if (bytes.length !== 32 && bytes.length !== 64) throw new Error("tamaño");
      key = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8, bytes.subarray(0, 32)]), format: "der", type: "pkcs8" });
    }
  } catch {
    throw revxError("auth_failed", "La clave privada de Revolut X no es válida: pega el bloque «-----BEGIN PRIVATE KEY-----» completo.");
  }
  if (key.asymmetricKeyType !== "ed25519") throw revxError("auth_failed", "Revolut X solo admite claves Ed25519.");
  keys.set(text, key);
  return key;
}

/** Firma de una petición (exportada para los tests). */
export function signature(key: KeyObject, timestamp: number, method: string, path: string, query: string, body: string) {
  return sign(null, Buffer.from(`${timestamp}${method.toUpperCase()}${path}${query}${body}`), key).toString("base64");
}

/** Consulta en el mismo formato que el cliente oficial: claves ordenadas y valores con encodeURIComponent. */
export function queryString(q: Record<string, string> = {}) {
  return Object.keys(q)
    .filter((k) => q[k] !== undefined && q[k] !== "")
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`)
    .join("&");
}

function responseError(status: number, message: string, write: boolean) {
  if (status === 429) return revxError("rate_limited", "Revolut X: demasiadas peticiones.");
  if (status === 401 || status === 403) return revxError("auth_failed", "Revolut X rechazó la clave. Revisa la clave de API, la clave privada y sus permisos.");
  if (status === 404) return revxError("not_found", "Revolut X no encuentra ese recurso.");
  if (status >= 500) return write ? unknown() : unavailable();
  if (/insufficient|not enough|balance/i.test(message)) return revxError("insufficient_funds", "Revolut X: saldo disponible insuficiente.");
  return revxError("invalid_request", `Revolut X rechazó la petición${message ? `: ${message.slice(0, 160)}` : ""}.`);
}

export function createApi(deps: ApiDeps) {
  return async function call(
    method: "GET" | "POST" | "DELETE",
    route: string,
    session: BrokerSession | null,
    options: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<unknown> {
    const write = method !== "GET";
    const path = PREFIX + route;
    const query = queryString(options.query);
    const body = options.body === undefined ? "" : JSON.stringify(options.body);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (session) {
      const { apiKey, privateKey } = session.credentials;
      if (!apiKey || !privateKey) throw revxError("auth_failed", "Faltan credenciales de Revolut X.");
      const timestamp = deps.now();
      headers["X-Revx-API-Key"] = apiKey.trim();
      headers["X-Revx-Timestamp"] = String(timestamp);
      headers["X-Revx-Signature"] = signature(privateKeyOf(privateKey), timestamp, method, path, query, body);
    }
    let response: Response;
    try {
      response = await deps.fetch(`${ROOT}${path}${query ? `?${query}` : ""}`, {
        method,
        headers,
        body: body || undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw write ? unknown() : unavailable();
    }
    if (response.status === 204) return null;
    let payload: unknown = null;
    try {
      const text = await response.text();
      payload = text ? JSON.parse(text) : null;
    } catch {
      if (!response.ok) throw responseError(response.status, "", write);
      throw write ? unknown() : unavailable();
    }
    if (!response.ok) {
      const message = payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string" ? (payload as { message: string }).message : "";
      throw responseError(response.status, message, write);
    }
    return payload;
  };
}
