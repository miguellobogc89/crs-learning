import { createHmac } from "node:crypto";
import type { BrokerSession } from "../../adapter";
import { BrokerError, type BrokerErrorCode } from "../../types";

export const ID = "okx";
const ROOT = "https://eea.okx.com";
const endpoints = {
  config: ["GET", "/api/v5/account/config"],
  balance: ["GET", "/api/v5/account/balance"],
  instruments: ["GET", "/api/v5/public/instruments"],
  tickers: ["GET", "/api/v5/market/tickers"],
  pending: ["GET", "/api/v5/trade/orders-pending"],
  fills: ["GET", "/api/v5/trade/fills"],
  order: ["GET", "/api/v5/trade/order"],
  place: ["POST", "/api/v5/trade/order"],
  cancel: ["POST", "/api/v5/trade/cancel-order"],
} as const;

type Row = Record<string, unknown>;
export type ApiDeps = { fetch: typeof fetch; now: () => number; brokerCode?: string };

export const okxError = (code: BrokerErrorCode, message: string) => new BrokerError(code, message, { provider: ID });
const unknown = () => okxError("unknown_outcome", "OKX no confirmó la operación. Consulta su estado antes de repetir.");
const unavailable = () => okxError("provider_unavailable", "OKX no devolvió una respuesta válida.");

function responseError(code: string, status: number, write: boolean) {
  if (status === 429 || code === "50011" || code === "50040" || code === "50061") return okxError("rate_limited", "OKX: demasiadas peticiones.");
  if (status >= 500 || ["50001", "50004", "50013", "50026", "51016"].includes(code)) return write ? unknown() : unavailable();
  if (status === 401 || status === 403 || /^501\d{2}$/.test(code)) return okxError("auth_failed", "OKX rechazó la credencial. Revisa la clave, el secreto, la frase de contraseña, el entorno y las IP autorizadas.");
  if (code === "50030") return okxError("permission_denied", `OKX rechazó la operación (código ${code}). Revisa los permisos de la clave.`);
  if (code === "51008") return okxError("insufficient_funds", "OKX: saldo disponible insuficiente.");
  if (code === "51603") return okxError("not_found", "OKX no encuentra esa orden.");
  if (code === "51001") return okxError("instrument_not_found", "OKX no encuentra ese par.");
  if (!/^\d{5}$/.test(code)) return write ? unknown() : unavailable();
  return okxError("invalid_request", `OKX rechazó la petición (código ${code}).`);
}

export function createApi(deps: ApiDeps) {
  return async function call(
    endpoint: keyof typeof endpoints,
    session: BrokerSession,
    options: { query?: Record<string, string>; body?: Row } = {},
  ): Promise<Row[]> {
    const [method, route] = endpoints[endpoint];
    const write = method === "POST";
    const query = new URLSearchParams(options.query).toString();
    const path = query ? `${route}?${query}` : route;
    const body = options.body ? JSON.stringify(options.body) : "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session.environment === "demo") headers["x-simulated-trading"] = "1";
    if (endpoint !== "instruments" && endpoint !== "tickers") {
      const { apiKey, apiSecret, passphrase } = session.credentials;
      if (!apiKey || !apiSecret || !passphrase) throw okxError("auth_failed", "Faltan credenciales de OKX.");
      const timestamp = new Date(deps.now()).toISOString();
      headers["OK-ACCESS-KEY"] = apiKey;
      headers["OK-ACCESS-PASSPHRASE"] = passphrase;
      headers["OK-ACCESS-TIMESTAMP"] = timestamp;
      headers["OK-ACCESS-SIGN"] = createHmac("sha256", apiSecret).update(timestamp + method + path + body).digest("base64");
    }

    let response: Response;
    let payload: { code?: unknown; data?: unknown } | null;
    try {
      response = await deps.fetch(ROOT + path, {
        method, headers, body: body || undefined, cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw write ? unknown() : unavailable();
    }
    if (response.status >= 500 || response.status === 429 || response.status === 401 || response.status === 403) {
      throw responseError("", response.status, write);
    }
    try {
      payload = await response.json();
    } catch {
      throw write ? unknown() : unavailable();
    }
    const rows = Array.isArray(payload?.data) ? payload.data.filter((row): row is Row => row !== null && typeof row === "object" && !Array.isArray(row)) : null;
    const code = typeof payload?.code === "string" ? payload.code : "";
    const itemCode = write && typeof rows?.[0]?.sCode === "string" ? rows[0].sCode : "";
    if (itemCode && itemCode !== "0") throw responseError(itemCode, response.status, write);
    if (!response.ok || code !== "0") throw responseError(code, response.status, write);
    if (!rows || rows.length !== (payload?.data as unknown[]).length || (write && itemCode !== "0")) throw write ? unknown() : unavailable();
    return rows;
  };
}
