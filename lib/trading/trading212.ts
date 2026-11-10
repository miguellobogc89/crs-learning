// Conector Trading 212: primera fase, solo lectura de la cuenta Demo.
import "server-only";

const DEMO_API = "https://demo.trading212.com/api/v0";

export type Trading212DemoSummary = {
  environment: "demo";
  currency: string;
  availableToTrade: number;
  totalValue: number;
  investedValue: number;
};

export class Trading212Error extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "Trading212Error";
  }
}

/** Consulta exclusivamente el saldo Demo, sin exponer credenciales ni el identificador de cuenta. */
export async function getTrading212DemoSummary(): Promise<Trading212DemoSummary> {
  if (process.env.TRADING212_ENV !== "demo") {
    throw new Trading212Error("Trading 212 debe estar configurado en modo demo", 503);
  }
  const key = process.env.TRADING212_API_KEY;
  const secret = process.env.TRADING212_API_SECRET;
  if (!key || !secret) {
    throw new Trading212Error("Faltan TRADING212_API_KEY o TRADING212_API_SECRET", 503);
  }

  let response: Response;
  try {
    response = await fetch(`${DEMO_API}/equity/account/summary`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Trading212Error("No se pudo conectar con Trading 212 Demo");
  }

  if (response.status === 429) {
    throw new Trading212Error("Límite de consultas alcanzado; inténtalo pasados unos segundos", 429);
  }
  if (response.status === 401 || response.status === 403) {
    throw new Trading212Error("Trading 212 rechazó las credenciales o los permisos de lectura", 502);
  }
  if (!response.ok) {
    throw new Trading212Error(`Trading 212 devolvió un error HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Trading212Error("Trading 212 devolvió una respuesta no válida");
  }
  const data = body as {
    currency?: unknown;
    totalValue?: unknown;
    cash?: { availableToTrade?: unknown };
    investments?: { currentValue?: unknown };
  } | null;
  const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

  if (
    !data ||
    typeof data.currency !== "string" ||
    !isAmount(data.cash?.availableToTrade) ||
    !isAmount(data.totalValue) ||
    !isAmount(data.investments?.currentValue)
  ) {
    throw new Trading212Error("Trading 212 devolvió datos de cuenta incompletos");
  }

  return {
    environment: "demo",
    currency: data.currency,
    availableToTrade: data.cash.availableToTrade,
    totalValue: data.totalValue,
    investedValue: data.investments.currentValue,
  };
}
