// lib/brokers/adapters/binance/mapping.ts
// Traducción entre Binance (spot) y el contrato común: pares, reglas de cantidad y precio, saldos,
// órdenes y operaciones. Puro: sin red. Lo prueban los tests con respuestas de ejemplo.
import { BrokerError, type BrokerAccount, type BrokerEnvironment, type BrokerExecution, type BrokerInstrument, type BrokerOrder, type BrokerPosition, type OrderStatus, type OrderType, type SymbolResolution } from "../../types";
import type { AdapterOrder } from "../../adapter";
import { PROVIDER_ID } from "./api";

/** CRS solo opera crypto contra euros: BTC-EUR ↔ BTCEUR. */
export const QUOTE = "EUR";
export const toPair = (symbol: string) => {
  const m = /^([A-Z0-9]{2,12})-EUR$/.exec(symbol.trim().toUpperCase());
  return m ? `${m[1]}${QUOTE}` : null;
};
export const fromPair = (pair: string, rules?: Map<string, PairRules>) => {
  const r = rules?.get(pair);
  if (r) return r.quote === QUOTE ? `${r.base}-EUR` : null;
  return pair.endsWith(QUOTE) ? `${pair.slice(0, -QUOTE.length)}-EUR` : null;
};

const n = (v: unknown) => (typeof v === "string" || typeof v === "number" ? Number(v) : NaN);
const bad = (what: string) => new BrokerError("provider_unavailable", `Binance devolvió ${what}`, { provider: PROVIDER_ID });

// ---------------------------------------------------------------------------
// Reglas de cada par (exchangeInfo)
// ---------------------------------------------------------------------------
export type PairRules = {
  pair: string;
  base: string;
  quote: string;
  trading: boolean;
  orderTypes: string[];
  stepSize: string | null;
  minQty: number;
  tickSize: string | null;
  minNotional: number;
};

export function parseExchangeInfo(data: unknown): Map<string, PairRules> {
  const list = (data as { symbols?: unknown })?.symbols;
  if (!Array.isArray(list)) throw bad("un catálogo no válido");
  const out = new Map<string, PairRules>();
  for (const raw of list) {
    const s = raw as { symbol?: unknown; status?: unknown; baseAsset?: unknown; quoteAsset?: unknown; orderTypes?: unknown; filters?: unknown };
    if (typeof s.symbol !== "string" || typeof s.baseAsset !== "string" || typeof s.quoteAsset !== "string") continue;
    const filters = Array.isArray(s.filters) ? (s.filters as Record<string, unknown>[]) : [];
    const f = (type: string) => filters.find((x) => x.filterType === type);
    const lot = f("LOT_SIZE");
    const price = f("PRICE_FILTER");
    const notional = f("NOTIONAL") ?? f("MIN_NOTIONAL");
    out.set(s.symbol, {
      pair: s.symbol,
      base: s.baseAsset,
      quote: s.quoteAsset,
      trading: s.status === "TRADING",
      orderTypes: Array.isArray(s.orderTypes) ? s.orderTypes.filter((t): t is string => typeof t === "string") : [],
      stepSize: typeof lot?.stepSize === "string" ? lot.stepSize : null,
      minQty: n(lot?.minQty) || 0,
      tickSize: typeof price?.tickSize === "string" ? price.tickSize : null,
      minNotional: n(notional?.minNotional) || 0,
    });
  }
  return out;
}

/** Decimales que permite un paso («0.00010000» → 4). */
export const decimalsOf = (step: string | null) => {
  if (!step) return 8;
  const [, frac = ""] = step.split(".");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed.length;
};

/** Redondea hacia abajo al paso permitido y lo devuelve como texto (Binance rechaza decimales de más). */
export function floorToStep(value: number, step: string | null): string {
  const s = Number(step);
  const dec = decimalsOf(step);
  if (!step || !(s > 0)) return value.toFixed(dec);
  // Se trabaja en enteros de pasos para evitar errores de coma flotante.
  const units = Math.floor(value / s + 1e-9);
  return (units * s).toFixed(dec);
}

const TYPE_TO_BINANCE: Record<OrderType, string> = { market: "MARKET", limit: "LIMIT", stop: "STOP_LOSS", stop_limit: "STOP_LOSS_LIMIT" };

/** Parámetros de la orden para Binance, ya ajustados a las reglas del par. Valida mínimos. */
export function orderParams(o: AdapterOrder, rules: PairRules, referencePrice: number | null) {
  const fail = (msg: string) => new BrokerError("invalid_request", `Binance: ${msg}`, { provider: PROVIDER_ID });
  if (!rules.trading) throw fail(`${rules.pair} no se puede operar ahora`);
  const type = TYPE_TO_BINANCE[o.type];
  if (!rules.orderTypes.includes(type)) throw new BrokerError("unsupported", `Binance no admite órdenes ${o.type} en ${rules.pair}`, { provider: PROVIDER_ID });
  const quantity = floorToStep(o.quantity, rules.stepSize);
  if (!(Number(quantity) > 0) || Number(quantity) < rules.minQty) throw fail(`la cantidad mínima en ${rules.pair} es ${rules.minQty}`);
  const price = o.limitPrice !== null ? floorToStep(o.limitPrice, rules.tickSize) : undefined;
  const stopPrice = o.stopPrice !== null ? floorToStep(o.stopPrice, rules.tickSize) : undefined;
  const ref = price !== undefined ? Number(price) : referencePrice;
  if (rules.minNotional > 0 && ref !== null && Number(quantity) * ref < rules.minNotional) {
    throw fail(`el importe mínimo en ${rules.pair} es ${rules.minNotional} ${rules.quote}`);
  }
  return {
    symbol: rules.pair,
    side: o.side === "sell" ? "SELL" : "BUY",
    type,
    quantity,
    ...(price !== undefined && (type === "LIMIT" || type === "STOP_LOSS_LIMIT") ? { price, timeInForce: "GTC" } : {}),
    ...(stopPrice !== undefined && type.startsWith("STOP") ? { stopPrice } : {}),
    newClientOrderId: o.clientOrderId,
    newOrderRespType: "RESULT",
  } as Record<string, string>;
}

// ---------------------------------------------------------------------------
// Estados y órdenes
// ---------------------------------------------------------------------------
const STATUS: Record<string, OrderStatus> = {
  NEW: "open",
  PENDING_NEW: "open",
  PENDING_CANCEL: "open",
  PARTIALLY_FILLED: "partially_filled",
  FILLED: "filled",
  CANCELED: "cancelled",
  REJECTED: "rejected",
  EXPIRED: "expired",
  EXPIRED_IN_MATCH: "expired",
};
export const orderStatus = (s: unknown): OrderStatus => (typeof s === "string" ? STATUS[s] ?? "unknown" : "unknown");
const TYPE: Record<string, OrderType> = { MARKET: "market", LIMIT: "limit", LIMIT_MAKER: "limit", STOP_LOSS: "stop", STOP_LOSS_LIMIT: "stop_limit", TAKE_PROFIT: "stop", TAKE_PROFIT_LIMIT: "stop_limit" };

/** El id de orden de Binance solo es único por par: el normalizado lleva el par delante («BTCEUR:123»). */
export const orderKey = (pair: string, id: string | number) => `${pair}:${id}`;
export function splitOrderKey(key: string) {
  const m = /^([A-Z0-9]{2,20}):(\d{1,20})$/.exec(key);
  return m ? { pair: m[1], id: m[2] } : null;
}

export function parseOrder(value: unknown, rules?: Map<string, PairRules>): BrokerOrder {
  const o = value as Record<string, unknown> | null;
  if (!o || typeof o.symbol !== "string" || !(typeof o.orderId === "number" || typeof o.orderId === "string")) throw bad("una orden incompleta");
  const qty = n(o.origQty);
  const filled = n(o.executedQty);
  const quote = n(o.cummulativeQuoteQty);
  const price = n(o.price);
  const stop = n(o.stopPrice);
  return {
    orderId: orderKey(o.symbol, o.orderId as string | number),
    symbol: fromPair(o.symbol, rules),
    providerSymbol: o.symbol,
    side: o.side === "SELL" ? "sell" : "buy",
    type: TYPE[String(o.type)] ?? "market",
    status: orderStatus(o.status),
    providerStatus: typeof o.status === "string" ? o.status : null,
    quantity: Number.isFinite(qty) ? qty : 0,
    filledQuantity: Number.isFinite(filled) ? filled : null,
    limitPrice: price > 0 ? price : null,
    stopPrice: stop > 0 ? stop : null,
    averageFillPrice: filled > 0 && quote > 0 ? quote / filled : null,
    // Las de CRS llevan nuestro identificador; las demás se crearon fuera (app de Binance u otra integración).
    createdByApi: typeof o.clientOrderId === "string" ? o.clientOrderId.startsWith("crs") : null,
    createdAt: typeof o.time === "number" ? new Date(o.time).toISOString() : typeof o.transactTime === "number" ? new Date(o.transactTime).toISOString() : null,
  };
}

export function parseTrades(pair: string, data: unknown, rules?: Map<string, PairRules>): BrokerExecution[] {
  if (!Array.isArray(data)) throw bad("operaciones no válidas");
  return data.map((raw) => {
    const t = raw as Record<string, unknown>;
    return {
      executionId: `${pair}:${String(t.id)}`,
      orderId: t.orderId !== undefined ? orderKey(pair, t.orderId as number) : null,
      symbol: fromPair(pair, rules),
      providerSymbol: pair,
      side: t.isBuyer ? "buy" : "sell",
      quantity: n(t.qty),
      price: n(t.price),
      currency: rules?.get(pair)?.quote ?? null,
      executedAt: typeof t.time === "number" ? new Date(t.time).toISOString() : null,
    } satisfies BrokerExecution;
  });
}

// ---------------------------------------------------------------------------
// Saldos → cuenta y posiciones
// ---------------------------------------------------------------------------
export type Balance = { asset: string; free: number; locked: number };

export function parseBalances(data: unknown): { accountId: string; canTrade: boolean; balances: Balance[] } {
  const d = data as { uid?: unknown; canTrade?: unknown; balances?: unknown } | null;
  if (!d || !Array.isArray(d.balances)) throw bad("datos de cuenta no válidos");
  const balances = (d.balances as Record<string, unknown>[])
    .filter((b) => typeof b.asset === "string")
    .map((b) => ({ asset: b.asset as string, free: n(b.free) || 0, locked: n(b.locked) || 0 }))
    .filter((b) => b.free + b.locked > 0);
  return { accountId: d.uid !== undefined ? String(d.uid) : "spot", canTrade: d.canTrade !== false, balances };
}

export const parsePrices = (data: unknown) => {
  if (!Array.isArray(data)) throw bad("precios no válidos");
  return new Map((data as Record<string, unknown>[]).filter((p) => typeof p.symbol === "string").map((p) => [p.symbol as string, n(p.price)]));
};

/** Pares en euros de los activos con saldo (los que se pueden operar desde CRS). */
export const eurPairsOf = (balances: Balance[], rules: Map<string, PairRules>) =>
  balances.map((b) => `${b.asset}${QUOTE}`).filter((p) => rules.has(p));

/**
 * Cómo valorar en euros cada activo: con su par en euros si lo tiene; si no, pasando por USDT
 * (XUSDT y EURUSDT) o por BTC (XBTC y BTCEUR). Devuelve los pares de precio que hacen falta.
 */
export type Route = { kind: "eur"; pair: string } | { kind: "via"; pair: string; bridge: string; invertBridge: boolean } | { kind: "usdt" };
export function valuationRoutes(balances: Balance[], rules: Map<string, PairRules>) {
  const routes = new Map<string, Route>();
  const usdtBridge = rules.has(`EURUSDT`) ? { bridge: "EURUSDT", invert: true } : rules.has("USDTEUR") ? { bridge: "USDTEUR", invert: false } : null;
  for (const { asset } of balances) {
    if (asset === QUOTE) continue;
    if (rules.has(`${asset}${QUOTE}`)) routes.set(asset, { kind: "eur", pair: `${asset}${QUOTE}` });
    else if (asset === "USDT" && usdtBridge) routes.set(asset, { kind: "usdt" });
    else if (rules.has(`${asset}USDT`) && usdtBridge) routes.set(asset, { kind: "via", pair: `${asset}USDT`, bridge: usdtBridge.bridge, invertBridge: usdtBridge.invert });
    else if (rules.has(`${asset}BTC`) && rules.has("BTCEUR")) routes.set(asset, { kind: "via", pair: `${asset}BTC`, bridge: "BTCEUR", invertBridge: false });
  }
  const pairs = new Set<string>();
  for (const r of routes.values()) {
    if (r.kind === "eur") pairs.add(r.pair);
    else if (r.kind === "via") {
      pairs.add(r.pair);
      pairs.add(r.bridge);
    } else if (usdtBridge) pairs.add(usdtBridge.bridge);
  }
  return { routes, pairs: [...pairs], usdtBridge };
}

/** Precio en euros de un activo según su ruta (null si no se puede valorar). */
export function eurPrice(asset: string, v: ReturnType<typeof valuationRoutes>, prices: Map<string, number>): number | null {
  const r = v.routes.get(asset);
  if (!r) return null;
  const px = (p: string) => {
    const x = prices.get(p);
    return x !== undefined && x > 0 ? x : null;
  };
  if (r.kind === "eur") return px(r.pair);
  const bridge = (name: string, invert: boolean) => {
    const b = px(name);
    return b === null ? null : invert ? 1 / b : b;
  };
  if (r.kind === "usdt") return v.usdtBridge ? bridge(v.usdtBridge.bridge, v.usdtBridge.invert) : null;
  const a = px(r.pair);
  const b = bridge(r.bridge, r.invertBridge);
  return a === null || b === null ? null : a * b;
}

export function toPositions(balances: Balance[], rules: Map<string, PairRules>, prices: Map<string, number>): BrokerPosition[] {
  const v = valuationRoutes(balances, rules);
  return balances
    .filter((b) => b.asset !== QUOTE)
    .map((b) => {
      const pair = `${b.asset}${QUOTE}`;
      // Operable desde CRS solo si tiene par en euros; valorado en euros siempre que haya ruta.
      const tradable = rules.has(pair);
      return {
        symbol: tradable ? `${b.asset}-EUR` : null,
        providerSymbol: tradable ? pair : b.asset,
        name: b.asset,
        quantity: b.free + b.locked,
        quantityAvailable: b.free,
        // Binance no da el precio medio de compra de un saldo al contado.
        averagePrice: null,
        currentPrice: eurPrice(b.asset, v, prices),
        currency: QUOTE,
      };
    });
}

export function toAccount(id: string, environment: BrokerEnvironment, balances: Balance[], positions: BrokerPosition[]): BrokerAccount {
  const eur = balances.find((b) => b.asset === QUOTE);
  const invested = positions.reduce((s, p) => s + (p.currentPrice !== null ? p.currentPrice * p.quantity : 0), 0);
  const cash = eur ? eur.free : 0;
  return {
    accountId: id,
    label: environment === "demo" ? "Binance · Testnet" : "Binance · Spot",
    environment,
    currency: QUOTE,
    cashAvailable: cash,
    totalValue: (eur ? eur.free + eur.locked : 0) + invested,
    investedValue: invested,
  };
}

export const toInstrument = (r: PairRules): BrokerInstrument => ({
  symbol: r.quote === QUOTE ? `${r.base}-EUR` : null,
  providerSymbol: r.pair,
  name: `${r.base}/${r.quote}`,
  market: "crypto",
  currency: r.quote,
  isin: null,
  quantityStep: r.stepSize ? Number(r.stepSize) : null,
});

export function resolve(symbol: string, rules: Map<string, PairRules>): SymbolResolution {
  const pair = toPair(symbol);
  if (!pair) return { status: "not_found" };
  const r = rules.get(pair);
  if (!r) return { status: "not_found" };
  if (!r.trading) return { status: "unsupported", reason: `${pair} no se puede operar ahora en Binance` };
  return { status: "ok", instrument: toInstrument(r), how: "par en euros" };
}
