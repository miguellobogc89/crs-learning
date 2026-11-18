import type { BrokerSession } from "../../adapter";
import { BrokerError } from "../../types";
import { signKrakenRequest } from "./signing";

export type KrakenApiDeps = { fetch: typeof fetch };
export const defaultKrakenDeps = (): KrakenApiDeps => ({ fetch: (input, init) => fetch(input, init) });

type Endpoint =
  | "accounts" | "tickers" | "instruments" | "openorders" | "openpositions"
  | "fills" | "historical-funding-rates" | "sendorder" | "cancelorder" | `tickers/${string}`;

export type KrakenApiResponse = Record<string, unknown>;
const PROVIDER = "kraken";

function failure(status: number, message: string, write: boolean): BrokerError {
  if (status === 401 || status === 403 || /auth|api.?key|signature|nonce|invalid.?key/i.test(message)) {
    return new BrokerError("auth_failed", "Kraken Futures rechazó la clave API, el secreto o los permisos.", { provider: PROVIDER });
  }
  if (status === 429 || /rate.?limit|too.?many/i.test(message)) {
    return new BrokerError("rate_limited", "Kraken Futures ha limitado las peticiones.", { provider: PROVIDER, retryable: !write });
  }
  if (/insufficient.?margin|insufficient.?funds/i.test(message)) {
    return new BrokerError("insufficient_funds", "Kraken Futures: garantía insuficiente.", { provider: PROVIDER });
  }
  if (write && status >= 500) return unknownOutcome();
  return new BrokerError(status >= 500 ? "provider_unavailable" : "invalid_request", `Kraken Futures: ${message.slice(0, 160) || `error HTTP ${status}`}.`, { provider: PROVIDER });
}

function unknownOutcome() {
  return new BrokerError("unknown_outcome", "No se sabe si Kraken Futures recibió la orden; comprueba su estado antes de repetir.", { provider: PROVIDER });
}

/** Requests have no automatic retries, particularly for sendorder and cancelorder. */
export function createKrakenApi(deps: KrakenApiDeps = defaultKrakenDeps()) {
  return async function request(
    session: BrokerSession,
    endpoint: Endpoint,
    options: { method?: "GET" | "POST"; public?: boolean; params?: Record<string, string> } = {},
  ): Promise<KrakenApiResponse> {
    const method = options.method ?? "GET";
    const write = method === "POST";
    if (write && endpoint !== "sendorder" && endpoint !== "cancelorder") {
      throw new BrokerError("invalid_request", "Método de Kraken Futures no permitido.", { provider: PROVIDER });
    }
    if (endpoint.startsWith("tickers/") && !/^tickers\/PF_[A-Z0-9]{2,12}USD$/.test(endpoint)) {
      throw new BrokerError("invalid_request", "Ticker de Kraken Futures no válido.", { provider: PROVIDER });
    }
    const endpointPath = `/api/v3/${endpoint}`;
    const params = new URLSearchParams(options.params).toString();
    const query = !write && params ? `?${params}` : "";
    const body = write ? params : undefined;
    const origin = session.environment === "demo" ? "https://demo-futures.kraken.com" : "https://futures.kraken.com";
    const headers: Record<string, string> = { Accept: "application/json" };
    if (write) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (!options.public) {
      const { apiKey, apiSecret } = session.credentials;
      if (!apiKey || !apiSecret) throw new BrokerError("auth_failed", "Faltan la API key o el secreto de Kraken Futures.", { provider: PROVIDER });
      let signature: string;
      try {
        signature = signKrakenRequest(params, endpointPath, apiSecret);
      } catch {
        throw new BrokerError("auth_failed", "Secreto de Kraken Futures no válido (debe estar en base64).", { provider: PROVIDER });
      }
      headers.APIKey = apiKey;
      headers.Authent = signature;
    }

    let response: Response;
    try {
      response = await deps.fetch(`${origin}/derivatives${endpointPath}${query}`, {
        method, headers, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw write ? unknownOutcome() : new BrokerError("provider_unavailable", "No se pudo contactar con Kraken Futures.", { provider: PROVIDER, retryable: true });
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw write ? unknownOutcome() : new BrokerError("provider_unavailable", "Kraken Futures devolvió una respuesta ilegible.", { provider: PROVIDER });
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw write ? unknownOutcome() : new BrokerError("provider_unavailable", "Respuesta inesperada de Kraken Futures.", { provider: PROVIDER });
    }
    const payload = data as KrakenApiResponse;
    const error = typeof payload.error === "string" ? payload.error : typeof payload.result === "string" && payload.result !== "success" ? payload.result : "";
    if (!response.ok || error) throw failure(response.status, error, write);
    if (payload.result !== "success") {
      throw write ? unknownOutcome() : new BrokerError("provider_unavailable", "Kraken Futures no confirmó la respuesta.", { provider: PROVIDER });
    }
    return payload;
  };
}
