// lib/brokers/adapters/trading212/mapping.ts
// Traducción entre Trading 212 y el contrato común: respuestas, estados, tipos de orden y símbolos.
// Puro: sin red. Lo prueban los tests con respuestas de ejemplo.
import { BrokerError, type BrokerAccount, type BrokerExecution, type BrokerInstrument, type BrokerOrder, type BrokerPosition, type BrokerEnvironment, type OrderStatus, type OrderType, type SymbolResolution } from "../../types";
import type { AdapterOrder } from "../../adapter";
import { PROVIDER_ID } from "./api";

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const bad = (what: string) => new BrokerError("provider_unavailable", `Trading 212 devolvió ${what}`, { provider: PROVIDER_ID });

// ---------------------------------------------------------------------------
// Estados y tipos
// ---------------------------------------------------------------------------
const STATUS: Record<string, OrderStatus> = {
  LOCAL: "open",
  UNCONFIRMED: "open",
  CONFIRMED: "open",
  NEW: "open",
  REPLACING: "open",
  REPLACED: "open",
  CANCELLING: "open",
  PARTIALLY_FILLED: "partially_filled",
  FILLED: "filled",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
};
export const orderStatus = (s: unknown): OrderStatus => (typeof s === "string" ? STATUS[s.toUpperCase()] ?? "unknown" : "unknown");

const TYPE: Record<string, OrderType> = { MARKET: "market", LIMIT: "limit", STOP: "stop", STOP_LIMIT: "stop_limit" };
const orderType = (t: unknown): OrderType => (typeof t === "string" ? TYPE[t.toUpperCase()] ?? "market" : "market");

/** Ruta y cuerpo de cada tipo de orden. Trading 212 usa cantidad NEGATIVA para vender. */
export function orderRequest(o: AdapterOrder): { path: string; body: Record<string, unknown> } {
  const quantity = o.side === "sell" ? -o.quantity : o.quantity;
  const timeValidity = o.timeInForce === "gtc" ? "GOOD_TILL_CANCEL" : "DAY";
  switch (o.type) {
    case "market":
      return { path: "/equity/orders/market", body: { ticker: o.providerSymbol, quantity, extendedHours: false } };
    case "limit":
      return { path: "/equity/orders/limit", body: { ticker: o.providerSymbol, quantity, limitPrice: o.limitPrice, timeValidity } };
    case "stop":
      return { path: "/equity/orders/stop", body: { ticker: o.providerSymbol, quantity, stopPrice: o.stopPrice, timeValidity } };
    case "stop_limit":
      return { path: "/equity/orders/stop_limit", body: { ticker: o.providerSymbol, quantity, stopPrice: o.stopPrice, limitPrice: o.limitPrice, timeValidity } };
  }
}

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------
export function parseSummary(data: unknown, environment: BrokerEnvironment): BrokerAccount {
  const d = data as { currency?: unknown; totalValue?: unknown; cash?: { availableToTrade?: unknown }; investments?: { currentValue?: unknown } } | null;
  if (!d || typeof d.currency !== "string" || !num(d.cash?.availableToTrade) || !num(d.totalValue)) throw bad("datos de cuenta incompletos");
  return {
    accountId: "principal",
    label: environment === "demo" ? "Trading 212 · Demo" : "Trading 212",
    environment,
    currency: d.currency,
    cashAvailable: d.cash!.availableToTrade as number,
    totalValue: d.totalValue,
    investedValue: num(d.investments?.currentValue) ? d.investments!.currentValue as number : null,
  };
}

export function parsePositions(data: unknown, toSymbol: (ticker: string) => string | null): BrokerPosition[] {
  if (!Array.isArray(data)) throw bad("posiciones no válidas");
  return data.map((value: unknown) => {
    const p = value as { instrument?: { ticker?: unknown; name?: unknown; currency?: unknown }; ticker?: unknown; quantity?: unknown; quantityAvailableForTrading?: unknown; averagePricePaid?: unknown; averagePrice?: unknown; currentPrice?: unknown } | null;
    const ticker = str(p?.instrument?.ticker) ?? str(p?.ticker);
    const avg = num(p?.averagePricePaid) ? p!.averagePricePaid : p?.averagePrice;
    if (!p || !ticker || !num(p.quantity) || !num(avg)) throw bad("una posición incompleta");
    return {
      symbol: toSymbol(ticker),
      providerSymbol: ticker,
      name: str(p.instrument?.name),
      quantity: p.quantity,
      quantityAvailable: num(p.quantityAvailableForTrading) ? p.quantityAvailableForTrading : null,
      averagePrice: avg as number,
      currentPrice: num(p.currentPrice) ? p.currentPrice : null,
      currency: str(p.instrument?.currency),
    };
  });
}

export function parseOrder(value: unknown, toSymbol: (ticker: string) => string | null): BrokerOrder {
  const o = value as { id?: unknown; ticker?: unknown; side?: unknown; type?: unknown; status?: unknown; quantity?: unknown; filledQuantity?: unknown; stopPrice?: unknown; limitPrice?: unknown; filledValue?: unknown; initiatedFrom?: unknown; creationTime?: unknown; createdAt?: unknown; instrument?: { ticker?: unknown } } | null;
  const ticker = str(o?.ticker) ?? str(o?.instrument?.ticker);
  if (!o || !(num(o.id) || typeof o.id === "string") || !ticker || !num(o.quantity)) throw bad("una orden incompleta");
  const side = o.side === "SELL" || o.side === "sell" ? "sell" : o.side === "BUY" || o.side === "buy" ? "buy" : o.quantity < 0 ? "sell" : "buy";
  const filled = num(o.filledQuantity) ? Math.abs(o.filledQuantity) : null;
  return {
    orderId: String(o.id),
    symbol: toSymbol(ticker),
    providerSymbol: ticker,
    side,
    type: orderType(o.type),
    status: orderStatus(o.status),
    providerStatus: str(o.status),
    quantity: Math.abs(o.quantity),
    filledQuantity: filled,
    limitPrice: num(o.limitPrice) ? o.limitPrice : null,
    stopPrice: num(o.stopPrice) ? o.stopPrice : null,
    averageFillPrice: filled && num(o.filledValue) ? Math.abs(o.filledValue) / filled : null,
    createdByApi: typeof o.initiatedFrom === "string" ? o.initiatedFrom === "API" : null,
    createdAt: str(o.creationTime) ?? str(o.createdAt),
  };
}

export const parseOrders = (data: unknown, toSymbol: (ticker: string) => string | null) => {
  if (!Array.isArray(data)) throw bad("órdenes no válidas");
  return data.map((o) => parseOrder(o, toSymbol));
};

/**
 * Historial de órdenes. Trading 212 ha usado dos formatos: plano ({ id, ticker, status, fillPrice… })
 * y anidado ({ order: {…}, fill: {…} }). Se aceptan los dos; lo que no se entiende se ignora.
 */
export function parseHistory(data: unknown, toSymbol: (ticker: string) => string | null): { orders: BrokerOrder[]; executions: BrokerExecution[] } {
  const items = Array.isArray((data as { items?: unknown })?.items) ? (data as { items: unknown[] }).items : Array.isArray(data) ? data : null;
  if (!items) throw bad("un historial no válido");
  const orders: BrokerOrder[] = [];
  const executions: BrokerExecution[] = [];
  for (const raw of items) {
    const r = raw as Record<string, unknown> & { order?: Record<string, unknown>; fill?: Record<string, unknown> };
    const flat = r.order ? { ...r.order, ...(r.fill ? { fillPrice: r.fill.price, filledQuantity: r.order.filledQuantity ?? r.fill.quantity, dateExecuted: r.fill.filledAt, fillId: r.fill.id } : {}) } : r;
    let order: BrokerOrder;
    try {
      order = parseOrder({ ...flat, quantity: flat.quantity ?? flat.orderedQuantity ?? flat.filledQuantity }, toSymbol);
    } catch {
      continue;
    }
    const price = num(flat.fillPrice) ? flat.fillPrice : null;
    if (price !== null && order.averageFillPrice === null) order.averageFillPrice = price;
    orders.push(order);
    const qty = order.filledQuantity ?? (order.status === "filled" ? order.quantity : null);
    if (qty && price !== null) {
      executions.push({
        executionId: str(flat.fillId) ?? (num(flat.fillId) ? String(flat.fillId) : `${order.orderId}:fill`),
        orderId: order.orderId,
        symbol: order.symbol,
        providerSymbol: order.providerSymbol,
        side: order.side,
        quantity: qty,
        price,
        currency: null,
        executedAt: str(flat.dateExecuted) ?? str(flat.dateModified) ?? null,
      });
    }
  }
  return { orders, executions };
}

// ---------------------------------------------------------------------------
// Instrumentos y símbolos (antes en lib/trading/broker/logic.ts)
// ---------------------------------------------------------------------------
export type CatalogItem = { ticker: string; name: string; shortName: string | null; isin: string | null; currency: string | null; type: string | null };

export function parseCatalog(data: unknown): CatalogItem[] {
  if (!Array.isArray(data)) throw bad("instrumentos no válidos");
  return data
    .map((v) => v as Record<string, unknown>)
    .filter((i) => typeof i.ticker === "string" && typeof i.name === "string")
    .map((i) => ({
      ticker: i.ticker as string,
      name: i.name as string,
      shortName: str(i.shortName),
      isin: str(i.isin),
      currency: str(i.currencyCode),
      type: str(i.type),
    }));
}

/** Convención de Trading 212 para la Bolsa de Madrid: «<BASE>e_EQ» (IBE.MC → IBEe_EQ). */
export const symbolFromTicker = (ticker: string) => {
  const m = /^([A-Z0-9]{1,12})e_EQ$/.exec(ticker);
  return m ? `${m[1]}.MC` : null;
};

export const toInstrument = (c: CatalogItem): BrokerInstrument => ({
  symbol: symbolFromTicker(c.ticker),
  providerSymbol: c.ticker,
  name: c.name,
  market: (c.type ?? "STOCK") === "STOCK" || c.type === "ETF" ? "bolsa" : null,
  currency: c.currency,
  isin: c.isin,
  quantityStep: null,
});

/**
 * Busca el instrumento de Trading 212 de un valor de la Bolsa de Madrid («SAN.MC»).
 * Solo se acepta automáticamente cuando hay un único candidato en euros; si no, queda para revisión.
 */
export function matchInstrument(symbol: string, catalog: CatalogItem[], knownIsin?: string | null): SymbolResolution {
  const m = /^([A-Z0-9]{1,12})\.MC$/.exec(symbol.trim().toUpperCase());
  if (!m) return { status: "not_found" };
  const base = m[1];
  const stocks = catalog.filter((c) => (c.type ?? "STOCK") === "STOCK" && (c.currency ?? "EUR") === "EUR");
  const ok = (c: CatalogItem, how: string): SymbolResolution => ({ status: "ok", instrument: { ...toInstrument(c), symbol: `${base}.MC` }, how });
  if (knownIsin) {
    const byIsin = stocks.filter((c) => c.isin?.toUpperCase() === knownIsin.toUpperCase());
    if (byIsin.length === 1) return ok(byIsin[0], "ISIN");
    if (byIsin.length > 1) return { status: "ambiguous", candidates: byIsin.map(toInstrument) };
  }
  const exact = stocks.filter((c) => c.ticker === `${base}e_EQ`);
  if (exact.length === 1) return ok(exact[0], "ticker de Madrid");
  const loose = stocks.filter((c) => (c.shortName ?? "").toUpperCase() === base);
  if (loose.length === 1) return ok(loose[0], "nombre corto");
  const all = [...new Map([...exact, ...loose].map((c) => [c.ticker, c])).values()];
  return all.length ? { status: "ambiguous", candidates: all.slice(0, 8).map(toInstrument) } : { status: "not_found" };
}
