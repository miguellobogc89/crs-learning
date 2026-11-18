import type { BrokerEnvironment } from "../../types";
import { BrokerError, type BrokerAccount, type BrokerExecution, type BrokerInstrument, type BrokerOrder, type BrokerPosition, type OrderStatus } from "../../types";

export type KrakenOrderInput = {
  symbol: string;
  side: "buy" | "sell";
  size: number;
  type: "lmt" | "stp" | "mkt";
  limitPrice?: number;
  stopPrice?: number;
  postOnly?: boolean;
  reduceOnly?: boolean;
};

export type KrakenFuturesAccount = {
  accountId: "flex";
  currency: "EUR" | "USD";
  /** Portfolio value in currency. Kraken reports these values in USD. */
  balance: number;
  /** Available margin in currency (not necessarily withdrawable cash). */
  availableMargin: number;
  /** EUR totals only when an EUR/USD valuation is available from Kraken collateral. */
  balanceEur: number | null;
  availableMarginEur: number | null;
  eurUsdRate: number | null;
};

export type KrakenTicker = {
  symbol: string;
  last: number | null;
  markPrice: number | null;
  bid: number | null;
  ask: number | null;
  fundingRate: number | null;
  currency: "USD";
};

export type KrakenContract = {
  symbol: string;
  base: string;
  quote: "USD";
  tickSize: number | null;
  contractSize: number | null;
  tradeable: boolean;
  isin: string | null;
};

export type KrakenOpenPosition = {
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number | null;
  unrealizedPnl: number | null;
  currency: "USD";
};

export type KrakenFill = {
  id: string;
  orderId: string | null;
  symbol: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  timestamp: string | null;
};

export type KrakenFundingRate = { symbol: string; timestamp: string; fundingRate: number; relativeFundingRate: number | null };

type Row = Record<string, unknown>;
const fail = (context: string) => new BrokerError("provider_unavailable", `Kraken Futures devolvió ${context} no válidos.`, { provider: "kraken" });
const record = (value: unknown): Row | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const string = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const timestamp = (value: unknown): string | null => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
};

export function krakenSymbol(symbol: string): string {
  const candidate = symbol.trim().toUpperCase().replace(/^PF_/, "").replace(/-?PERP$/, "").replace(/-?USD$/, "");
  const base = candidate === "BTC" ? "XBT" : candidate;
  if (!/^[A-Z0-9]{2,12}$/.test(base)) throw new BrokerError("invalid_request", "Contrato perpetual de Kraken Futures no válido.", { provider: "kraken" });
  return `PF_${base}USD`;
}

export function isKrakenPerpetual(symbol: string): boolean {
  return /^PF_[A-Z0-9]{2,12}USD$/.test(symbol);
}

export function baseOf(symbol: string): string {
  const match = /^PF_([A-Z0-9]+)USD$/.exec(symbol);
  if (!match) throw new BrokerError("invalid_request", "El símbolo no es un perpetual lineal de Kraken Futures.", { provider: "kraken" });
  return match[1] === "XBT" ? "BTC" : match[1];
}

/** Avoid mixing Kraken's USD-valued portfolio totals with actual EUR amounts. */
export function mapAccount(payload: Row, environment: BrokerEnvironment): { raw: KrakenFuturesAccount; broker: BrokerAccount } {
  const accounts = record(payload.accounts);
  const flex = record(accounts?.flex);
  if (!flex) throw fail("datos de la cuenta de futuros multicollateral");
  const balanceUsd = number(flex.portfolioValue) ?? number(flex.balanceValue);
  const marginUsd = number(flex.availableMargin);
  if (balanceUsd === null || marginUsd === null) throw fail("balance y garantía disponible");
  const eur = record(record(flex.currencies)?.EUR);
  const eurQuantity = number(eur?.quantity);
  const eurValue = number(eur?.value);
  const rate = eurQuantity !== null && eurQuantity > 0 && eurValue !== null && eurValue > 0 ? eurValue / eurQuantity : null;
  const balanceEur = rate ? balanceUsd / rate : null;
  const availableMarginEur = rate ? marginUsd / rate : null;
  const currency: "EUR" | "USD" = rate ? "EUR" : "USD";
  const raw: KrakenFuturesAccount = {
    accountId: "flex", currency, balance: balanceEur ?? balanceUsd,
    availableMargin: availableMarginEur ?? marginUsd, balanceEur, availableMarginEur, eurUsdRate: rate,
  };
  return {
    raw,
    broker: {
      accountId: "flex", label: "Kraken Futures · Multicollateral", environment,
      currency, totalValue: raw.balance, cashAvailable: raw.availableMargin, investedValue: null,
    },
  };
}

export function mapTicker(value: unknown): KrakenTicker {
  const r = record(value);
  const symbol = string(r?.symbol);
  if (!isKrakenPerpetual(symbol)) throw fail("datos del ticker perpetual");
  return {
    symbol, last: number(r?.last), markPrice: number(r?.markPrice), bid: number(r?.bid),
    ask: number(r?.ask), fundingRate: number(r?.fundingRate), currency: "USD",
  };
}

export function mapContracts(value: unknown): KrakenContract[] {
  if (!Array.isArray(value)) throw fail("catálogo de contratos");
  return value.flatMap((item) => {
    const r = record(item);
    const symbol = string(r?.symbol);
    if (!isKrakenPerpetual(symbol) || r?.tradeable !== true || r?.isExpired === true) return [];
    return [{
      symbol, base: baseOf(symbol), quote: "USD" as const,
      tickSize: number(r.tickSize), contractSize: number(r.contractSize),
      tradeable: true, isin: string(r.isin) || null,
    }];
  });
}

export function toInstrument(contract: KrakenContract): BrokerInstrument {
  return {
    symbol: `${contract.base}-PERP`, providerSymbol: contract.symbol,
    name: `${contract.base} perpetual`, market: "crypto", currency: "USD",
    // Kraken's contractSize describes contract value, not a tradable quantity increment.
    isin: contract.isin, quantityStep: null,
  };
}

export function mapPositions(value: unknown): KrakenOpenPosition[] {
  if (!Array.isArray(value)) throw fail("posiciones abiertas");
  return value.filter((item) => isKrakenPerpetual(string(record(item)?.symbol))).map((item) => {
    const r = record(item);
    const symbol = string(r?.symbol);
    const size = number(r?.size);
    if (!isKrakenPerpetual(symbol) || (r?.side !== "long" && r?.side !== "short") || size === null || size < 0) throw fail("posiciones abiertas");
    return { symbol, side: r.side, size, entryPrice: number(r.price), unrealizedPnl: number(r.unrealizedPnl), currency: "USD" };
  });
}

export function toBrokerPosition(position: KrakenOpenPosition, ticker?: KrakenTicker): BrokerPosition {
  const base = baseOf(position.symbol);
  return {
    symbol: `${base}-PERP`, providerSymbol: position.symbol,
    name: `${base} perpetual · ${position.side === "short" ? "corto" : "largo"}`,
    quantity: position.side === "short" ? -position.size : position.size,
    quantityAvailable: null, averagePrice: position.entryPrice,
    currentPrice: ticker?.markPrice ?? ticker?.last ?? null, currency: "USD",
  };
}

const statuses: Record<string, OrderStatus> = {
  untouched: "open", partial: "partially_filled", partially_filled: "partially_filled",
  filled: "filled", cancelled: "cancelled", canceled: "cancelled", rejected: "rejected", expired: "expired",
};

export function mapOrders(value: unknown): BrokerOrder[] {
  if (!Array.isArray(value)) throw fail("órdenes abiertas");
  return value.filter((item) => isKrakenPerpetual(string(record(item)?.symbol))).map((item) => {
    const r = record(item);
    if (!r) throw fail("órdenes abiertas");
    const symbol = string(r?.symbol);
    const orderId = string(r?.order_id);
    const side = r?.side;
    const quantity = number(r?.filledSize) !== null && number(r?.unfilledSize) !== null
      ? Number(r?.filledSize) + Number(r?.unfilledSize) : number(r?.size);
    if (!isKrakenPerpetual(symbol) || !orderId || (side !== "buy" && side !== "sell") || quantity === null) throw fail("órdenes abiertas");
    const orderType = string(r.orderType);
    return {
      orderId, providerSymbol: symbol, symbol: `${baseOf(symbol)}-PERP`, side,
      type: orderType === "mkt" ? "market" : orderType === "stp" ? "stop" : "limit",
      status: statuses[string(r.status)] ?? "unknown", providerStatus: string(r.status) || null,
      quantity, filledQuantity: number(r.filledSize), limitPrice: number(r.limitPrice),
      stopPrice: number(r.stopPrice), averageFillPrice: null, createdByApi: null,
      createdAt: timestamp(r.receivedTime),
    };
  });
}

export function mapFills(value: unknown): KrakenFill[] {
  if (!Array.isArray(value)) throw fail("ejecuciones");
  return value.filter((item) => isKrakenPerpetual(string(record(item)?.symbol))).map((item) => {
    const r = record(item);
    if (!r) throw fail("ejecuciones");
    const id = string(r?.fill_id);
    const symbol = string(r?.symbol);
    const side = r?.side;
    const size = number(r?.size);
    const price = number(r?.price);
    if (!id || !isKrakenPerpetual(symbol) || (side !== "buy" && side !== "sell") || size === null || price === null) throw fail("ejecuciones");
    return { id, orderId: string(r.order_id) || null, symbol, side, size, price, timestamp: timestamp(r.fillTime) };
  });
}

export function toBrokerExecution(fill: KrakenFill): BrokerExecution {
  return {
    executionId: fill.id, orderId: fill.orderId, providerSymbol: fill.symbol,
    symbol: `${baseOf(fill.symbol)}-PERP`, side: fill.side, quantity: fill.size,
    price: fill.price, currency: "USD", executedAt: fill.timestamp,
  };
}

export function mapFundingRates(value: unknown, symbol: string): KrakenFundingRate[] {
  if (!Array.isArray(value)) throw fail("histórico de funding");
  return value.map((item) => {
    const r = record(item);
    const time = timestamp(r?.timestamp);
    const rate = number(r?.fundingRate);
    if (!time || rate === null) throw fail("histórico de funding");
    return { symbol, timestamp: time, fundingRate: rate, relativeFundingRate: number(r?.relativeFundingRate) };
  });
}
