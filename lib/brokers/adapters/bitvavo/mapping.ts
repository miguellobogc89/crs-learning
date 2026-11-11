// lib/brokers/adapters/bitvavo/mapping.ts
// Traducción entre Bitvavo y el contrato común: mercados (todo contra euros: «BTC-EUR», el mismo
// formato que CRS), saldos, órdenes y operaciones. Puro: sin red. Lo prueban los tests.
import { createHash } from "node:crypto";
import { BrokerError, type BrokerAccount, type BrokerEnvironment, type BrokerExecution, type BrokerInstrument, type BrokerOrder, type BrokerPosition, type OrderStatus, type OrderType, type SymbolResolution } from "../../types";
import type { AdapterOrder } from "../../adapter";
import { OPERATOR_ID, PROVIDER_ID } from "./api";

export const QUOTE = "EUR";
const n = (v: unknown) => (typeof v === "string" || typeof v === "number" ? Number(v) : NaN);
const bad = (what: string) => new BrokerError("provider_unavailable", `Bitvavo devolvió ${what}`, { provider: PROVIDER_ID });

// ---------------------------------------------------------------------------
// Mercados
// ---------------------------------------------------------------------------
export type MarketRules = {
  market: string;
  base: string;
  quote: string;
  trading: boolean;
  orderTypes: string[];
  /** Decimales permitidos en la cantidad (si Bitvavo lo informa; si no, 8). */
  quantityDecimals: number;
  minBase: number;
  minQuote: number;
};

export function parseMarkets(data: unknown): Map<string, MarketRules> {
  if (!Array.isArray(data)) throw bad("un catálogo no válido");
  const out = new Map<string, MarketRules>();
  for (const raw of data as Record<string, unknown>[]) {
    if (typeof raw.market !== "string" || typeof raw.base !== "string" || typeof raw.quote !== "string") continue;
    const qd = n(raw.quantityDecimals);
    out.set(raw.market, {
      market: raw.market,
      base: raw.base,
      quote: raw.quote,
      trading: raw.status === "trading",
      orderTypes: Array.isArray(raw.orderTypes) ? raw.orderTypes.filter((t): t is string => typeof t === "string") : [],
      quantityDecimals: Number.isInteger(qd) && qd >= 0 && qd <= 12 ? qd : 8,
      minBase: n(raw.minOrderInBaseAsset) || 0,
      minQuote: n(raw.minOrderInQuoteAsset) || 0,
    });
  }
  return out;
}

export const parsePrices = (data: unknown) => {
  if (!Array.isArray(data)) throw bad("precios no válidos");
  return new Map((data as Record<string, unknown>[]).filter((p) => typeof p.market === "string").map((p) => [p.market as string, n(p.price)]));
};

/** Redondea hacia abajo a los decimales permitidos y lo devuelve como texto. */
export function floorTo(value: number, decimals: number): string {
  const f = 10 ** decimals;
  return (Math.floor(value * f + 1e-9) / f).toFixed(decimals);
}

export const toInstrument = (r: MarketRules): BrokerInstrument => ({
  symbol: r.quote === QUOTE ? r.market : null,
  providerSymbol: r.market,
  name: `${r.base}/${r.quote}`,
  market: "crypto",
  currency: r.quote,
  isin: null,
  quantityStep: 10 ** -r.quantityDecimals,
});

export function resolve(symbol: string, markets: Map<string, MarketRules>): SymbolResolution {
  const m = /^([A-Z0-9]{1,15})-EUR$/.exec(symbol.trim().toUpperCase());
  if (!m) return { status: "not_found" };
  const r = markets.get(`${m[1]}-EUR`);
  if (!r) return { status: "not_found" };
  if (!r.trading) return { status: "unsupported", reason: `${r.market} no se puede operar ahora en Bitvavo` };
  return { status: "ok", instrument: toInstrument(r), how: "par en euros" };
}

// ---------------------------------------------------------------------------
// Órdenes
// ---------------------------------------------------------------------------
/** Bitvavo pide un UUID como clientOrderId: se deriva siempre igual del identificador de CRS. */
export function clientUuid(clientOrderId: string) {
  const h = createHash("sha256").update(`crs:${clientOrderId}`).digest("hex");
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const TYPE_TO_BITVAVO: Record<OrderType, string> = { market: "market", limit: "limit", stop: "stopLoss", stop_limit: "stopLossLimit" };

/** Cuerpo de la orden para Bitvavo, ya ajustado a las reglas del mercado. Valida mínimos. */
export function orderBody(o: AdapterOrder, rules: MarketRules, referencePrice: number | null) {
  const fail = (msg: string) => new BrokerError("invalid_request", `Bitvavo: ${msg}`, { provider: PROVIDER_ID });
  if (!rules.trading) throw fail(`${rules.market} no se puede operar ahora`);
  const type = TYPE_TO_BITVAVO[o.type];
  if (!rules.orderTypes.includes(type)) throw new BrokerError("unsupported", `Bitvavo no admite órdenes ${o.type} en ${rules.market}`, { provider: PROVIDER_ID });
  const amount = floorTo(o.quantity, rules.quantityDecimals);
  if (!(Number(amount) > 0) || Number(amount) < rules.minBase) throw fail(`la cantidad mínima en ${rules.market} es ${rules.minBase}`);
  const ref = o.limitPrice ?? referencePrice;
  if (rules.minQuote > 0 && ref !== null && Number(amount) * ref < rules.minQuote) throw fail(`el importe mínimo en ${rules.market} es ${rules.minQuote} €`);
  const body: Record<string, unknown> = {
    market: rules.market,
    side: o.side,
    orderType: type,
    amount,
    clientOrderId: clientUuid(o.clientOrderId),
    operatorId: OPERATOR_ID,
    responseRequired: true,
  };
  if (o.limitPrice !== null && (type === "limit" || type === "stopLossLimit")) body.price = String(o.limitPrice);
  if (o.stopPrice !== null && type.startsWith("stopLoss")) {
    body.triggerAmount = String(o.stopPrice);
    body.triggerType = "price";
    body.triggerReference = "lastTrade";
  }
  return body;
}

const STATUS: Record<string, OrderStatus> = {
  new: "open",
  awaitingTrigger: "open",
  partiallyFilled: "partially_filled",
  filled: "filled",
  canceled: "cancelled",
  cancelled: "cancelled",
  expired: "expired",
  rejected: "rejected",
};
export const orderStatus = (s: unknown): OrderStatus => (typeof s === "string" ? STATUS[s] ?? "unknown" : "unknown");

const TYPE: Record<string, OrderType> = { market: "market", limit: "limit", stopLoss: "stop", stopLossLimit: "stop_limit", takeProfit: "stop", takeProfitLimit: "stop_limit" };

/** Bitvavo pide el mercado para consultar una orden: el id normalizado lo lleva delante («BTC-EUR:uuid»). */
export const orderKey = (market: string, id: string) => `${market}:${id}`;
export function splitOrderKey(key: string) {
  const m = /^([A-Z0-9]{1,15}-[A-Z]{2,6}):([0-9a-fA-F-]{8,64})$/.exec(key);
  return m ? { market: m[1], id: m[2] } : null;
}

export function parseOrder(value: unknown): BrokerOrder {
  const o = value as Record<string, unknown> | null;
  if (!o || typeof o.market !== "string" || typeof o.orderId !== "string") throw bad("una orden incompleta");
  const filled = n(o.filledAmount);
  const quote = n(o.filledAmountQuote);
  const amount = n(o.amount);
  const price = n(o.price);
  const trigger = n(o.triggerPrice ?? o.triggerAmount);
  return {
    orderId: orderKey(o.market, o.orderId),
    symbol: o.market.endsWith(`-${QUOTE}`) ? o.market : null,
    providerSymbol: o.market,
    side: o.side === "sell" ? "sell" : "buy",
    type: TYPE[String(o.orderType)] ?? "market",
    status: orderStatus(o.status),
    providerStatus: typeof o.status === "string" ? (typeof o.restatementReason === "string" ? `${o.status} (${o.restatementReason})` : o.status) : null,
    quantity: Number.isFinite(amount) ? amount : Number.isFinite(filled) ? filled : 0,
    filledQuantity: Number.isFinite(filled) ? filled : null,
    limitPrice: price > 0 ? price : null,
    stopPrice: trigger > 0 ? trigger : null,
    averageFillPrice: filled > 0 && quote > 0 ? quote / filled : null,
    // Bitvavo no distingue el origen de una orden: no se sabe si la creó CRS.
    createdByApi: null,
    createdAt: typeof o.created === "number" ? new Date(o.created).toISOString() : null,
  };
}

export function parseTrades(data: unknown): BrokerExecution[] {
  if (!Array.isArray(data)) throw bad("operaciones no válidas");
  return (data as Record<string, unknown>[]).map((t) => {
    const market = String(t.market ?? "");
    return {
      executionId: `${market}:${String(t.id)}`,
      orderId: typeof t.orderId === "string" ? orderKey(market, t.orderId) : null,
      symbol: market.endsWith(`-${QUOTE}`) ? market : null,
      providerSymbol: market,
      side: t.side === "sell" ? "sell" : "buy",
      quantity: n(t.amount),
      price: n(t.price),
      currency: QUOTE,
      executedAt: typeof t.timestamp === "number" ? new Date(t.timestamp).toISOString() : null,
    } satisfies BrokerExecution;
  });
}

// ---------------------------------------------------------------------------
// Saldos → cuenta y posiciones
// ---------------------------------------------------------------------------
export type Balance = { asset: string; free: number; locked: number };

export function parseBalances(data: unknown): Balance[] {
  if (!Array.isArray(data)) throw bad("saldos no válidos");
  return (data as Record<string, unknown>[])
    .filter((b) => typeof b.symbol === "string")
    .map((b) => ({ asset: b.symbol as string, free: n(b.available) || 0, locked: n(b.inOrder) || 0 }))
    .filter((b) => b.free + b.locked > 0);
}

export function toPositions(balances: Balance[], markets: Map<string, MarketRules>, prices: Map<string, number>): BrokerPosition[] {
  return balances
    .filter((b) => b.asset !== QUOTE)
    .map((b) => {
      const market = `${b.asset}-${QUOTE}`;
      const tradable = markets.has(market);
      const px = prices.get(market);
      return {
        symbol: tradable ? market : null,
        providerSymbol: tradable ? market : b.asset,
        name: b.asset,
        quantity: b.free + b.locked,
        quantityAvailable: b.free,
        averagePrice: null,
        currentPrice: px !== undefined && px > 0 ? px : null,
        currency: QUOTE,
      };
    });
}

export function toAccount(environment: BrokerEnvironment, balances: Balance[], positions: BrokerPosition[]): BrokerAccount {
  const eur = balances.find((b) => b.asset === QUOTE);
  const invested = positions.reduce((s, p) => s + (p.currentPrice !== null ? p.currentPrice * p.quantity : 0), 0);
  return {
    accountId: "bitvavo",
    label: "Bitvavo",
    environment,
    currency: QUOTE,
    cashAvailable: eur ? eur.free : 0,
    totalValue: (eur ? eur.free + eur.locked : 0) + invested,
    investedValue: invested,
  };
}
