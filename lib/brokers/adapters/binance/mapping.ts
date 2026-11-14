// lib/brokers/adapters/binance/mapping.ts
// Traducción entre Binance (spot) y el contrato común: pares, reglas de cantidad y precio, saldos,
// órdenes y operaciones. Puro: sin red. Lo prueban los tests con respuestas de ejemplo.
import { BrokerError, type BrokerAccount, type BrokerEnvironment, type BrokerExecution, type BrokerInstrument, type BrokerOrder, type BrokerPosition, type CashBalance, type CashCurrency, type OrderStatus, type OrderType, type SymbolResolution } from "../../types";
import type { AdapterOrder, CashConversionPlan } from "../../adapter";
import { PROVIDER_ID } from "./api";

/**
 * CRS habla de crypto en euros (BTC-EUR). En Binance se opera contra euros (BTCEUR) o, si tu efectivo
 * está en USDC (en la UE no hay USDT al contado), contra USDC (BTCUSDC); todo se enseña en euros.
 */
export const QUOTE = "EUR";
export const USDC = "USDC";
/** Par para cambiar euros y USDC (base EUR, cotiza en USDC). */
export const FX_PAIR = "EURUSDC";
export const toPair = (symbol: string) => {
  const m = /^([A-Z0-9]{2,12})-EUR$/.exec(symbol.trim().toUpperCase());
  return m ? `${m[1]}${QUOTE}` : null;
};
export const fromPair = (pair: string, rules?: Map<string, PairRules>) => {
  const r = rules?.get(pair);
  if (r) return r.quote === QUOTE || (r.quote === USDC && r.base !== QUOTE) ? `${r.base}-EUR` : null;
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

/** `usdcEur` = euros por 1 USDC, para dar en euros el precio de las órdenes en USDC. */
export function parseOrder(value: unknown, rules?: Map<string, PairRules>, usdcEur: number | null = null): BrokerOrder {
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
    averageFillPriceEur: !(filled > 0 && quote > 0) ? null : rules?.get(o.symbol)?.quote === USDC ? (usdcEur ? (quote / filled) * usdcEur : null) : quote / filled,
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

/** Pares en euros y en USDC de los activos con saldo (los que se pueden operar desde CRS). */
export const eurPairsOf = (balances: Balance[], rules: Map<string, PairRules>) =>
  balances.filter((b) => b.asset !== QUOTE && b.asset !== USDC).flatMap((b) => [`${b.asset}${QUOTE}`, `${b.asset}${USDC}`]).filter((p) => rules.has(p));

/**
 * Cómo valorar en euros cada activo: con su par en euros si lo tiene; si no, pasando por USDT
 * (XUSDT y EURUSDT) o por BTC (XBTC y BTCEUR). Devuelve los pares de precio que hacen falta.
 */
export type Route = { kind: "eur"; pair: string } | { kind: "via"; pair: string; bridge: string; invertBridge: boolean } | { kind: "usdt" } | { kind: "usdc" };
export function valuationRoutes(balances: Balance[], rules: Map<string, PairRules>) {
  const routes = new Map<string, Route>();
  const usdtBridge = rules.has(`EURUSDT`) ? { bridge: "EURUSDT", invert: true } : rules.has("USDTEUR") ? { bridge: "USDTEUR", invert: false } : null;
  const usdcBridge = rules.has(FX_PAIR) ? { bridge: FX_PAIR, invert: true } : rules.has("USDCEUR") ? { bridge: "USDCEUR", invert: false } : null;
  for (const { asset } of balances) {
    if (asset === QUOTE) continue;
    if (rules.has(`${asset}${QUOTE}`)) routes.set(asset, { kind: "eur", pair: `${asset}${QUOTE}` });
    else if (asset === USDC && usdcBridge) routes.set(asset, { kind: "usdc" });
    else if (rules.has(`${asset}${USDC}`) && usdcBridge) routes.set(asset, { kind: "via", pair: `${asset}${USDC}`, bridge: usdcBridge.bridge, invertBridge: usdcBridge.invert });
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
    } else if (r.kind === "usdc") {
      if (usdcBridge) pairs.add(usdcBridge.bridge);
    } else if (usdtBridge) pairs.add(usdtBridge.bridge);
  }
  // El cambio euro/USDC hace falta siempre que exista: para el efectivo y para las órdenes en USDC.
  if (usdcBridge) pairs.add(usdcBridge.bridge);
  return { routes, pairs: [...pairs], usdtBridge, usdcBridge };
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
  if (r.kind === "usdc") return v.usdcBridge ? bridge(v.usdcBridge.bridge, v.usdcBridge.invert) : null;
  const a = px(r.pair);
  const b = bridge(r.bridge, r.invertBridge);
  return a === null || b === null ? null : a * b;
}

/** Euros por 1 USDC, del par de cambio (null si no hay precio). */
export function usdcInEur(rules: Map<string, PairRules>, prices: Map<string, number>): number | null {
  const v = valuationRoutes([{ asset: USDC, free: 1, locked: 0 }], rules);
  return eurPrice(USDC, v, prices);
}

/** Efectivo libre por moneda (euros y USDC) y su valor en euros. */
export function cashOf(balances: Balance[], rules: Map<string, PairRules>, prices: Map<string, number>): CashBalance[] {
  const eur = balances.find((b) => b.asset === QUOTE)?.free ?? 0;
  const out: CashBalance[] = [{ currency: QUOTE, amount: eur, valueEur: eur }];
  const fx = usdcInEur(rules, prices);
  const usdc = balances.find((b) => b.asset === USDC)?.free ?? 0;
  if (usdc > 0 || fx) out.push({ currency: USDC, amount: usdc, valueEur: usdc * (fx ?? 0) });
  return out;
}

/** Con qué efectivo se compra: el que más valor tenga ahora mismo (a igualdad, euros). */
export function cashCurrencyOf(cash: CashBalance[]): CashCurrency {
  const eur = cash.find((c) => c.currency === QUOTE)?.valueEur ?? 0;
  const usdc = cash.find((c) => c.currency === USDC)?.valueEur ?? 0;
  return usdc > eur ? USDC : QUOTE;
}

/** Par con el que se opera una moneda: en la moneda de tu efectivo si existe; si no, en la otra. */
export function pairFor(asset: string, rules: Map<string, PairRules>, prefer: CashCurrency = QUOTE): PairRules | null {
  if (asset === QUOTE || asset === USDC) return null;
  for (const q of prefer === USDC ? [USDC, QUOTE] : [QUOTE, USDC]) {
    const r = rules.get(`${asset}${q}`);
    if (r && r.trading) return r;
  }
  return null;
}

export function toPositions(balances: Balance[], rules: Map<string, PairRules>, prices: Map<string, number>, prefer: CashCurrency = QUOTE): BrokerPosition[] {
  const v = valuationRoutes(balances, rules);
  return balances
    .filter((b) => b.asset !== QUOTE && b.asset !== USDC)
    .map((b) => {
      // Operable desde CRS si tiene par en euros o en USDC; valorado en euros siempre que haya ruta.
      const r = pairFor(b.asset, rules, prefer);
      return {
        symbol: r ? `${b.asset}-EUR` : null,
        providerSymbol: r ? r.pair : b.asset,
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

export function toAccount(id: string, environment: BrokerEnvironment, balances: Balance[], positions: BrokerPosition[], cash?: CashBalance[]): BrokerAccount {
  const eur = balances.find((b) => b.asset === QUOTE);
  const invested = positions.reduce((s, p) => s + (p.currentPrice !== null ? p.currentPrice * p.quantity : 0), 0);
  const usdc = cash?.find((c) => c.currency === USDC);
  const usdcBal = balances.find((b) => b.asset === USDC);
  const usdcRate = usdc && usdc.amount > 0 ? usdc.valueEur / usdc.amount : 0;
  const usdcTotal = usdcBal ? (usdcBal.free + usdcBal.locked) * usdcRate : 0;
  return {
    accountId: id,
    label: environment === "demo" ? "Binance · Testnet" : "Binance · Spot",
    environment,
    currency: QUOTE,
    cashAvailable: cash ? cash.reduce((s, c) => s + c.valueEur, 0) : eur ? eur.free : 0,
    totalValue: (eur ? eur.free + eur.locked : 0) + usdcTotal + invested,
    investedValue: invested,
    ...(cash ? { cash } : {}),
  };
}

export const toInstrument = (r: PairRules): BrokerInstrument => ({
  symbol: r.quote === QUOTE || r.quote === USDC ? `${r.base}-EUR` : null,
  providerSymbol: r.pair,
  name: `${r.base}/${r.quote}`,
  market: "crypto",
  currency: r.quote,
  isin: null,
  quantityStep: r.stepSize ? Number(r.stepSize) : null,
});

export function resolve(symbol: string, rules: Map<string, PairRules>, prefer: CashCurrency = QUOTE): SymbolResolution {
  const m = /^([A-Z0-9]{2,12})-EUR$/.exec(symbol.trim().toUpperCase());
  if (!m) return { status: "not_found" };
  const asset = m[1];
  if (asset === USDC) return { status: "unsupported", reason: "USDC es efectivo: se cambia desde la conexión, no se compra" };
  const r = pairFor(asset, rules, prefer);
  if (r) return { status: "ok", instrument: toInstrument(r), how: r.quote === QUOTE ? "par en euros" : "par en USDC (tu efectivo está en USDC)" };
  const known = rules.get(`${asset}${QUOTE}`) ?? rules.get(`${asset}${USDC}`);
  if (known) return { status: "unsupported", reason: `${known.pair} no se puede operar ahora en Binance` };
  return { status: "not_found" };
}

/** Margen para que el cambio no pida más de lo que hay si el precio se mueve al ejecutar. */
const FX_MARGIN = 0.995;

/** Cambio de efectivo con EURUSDC (base EUR): a USDC se venden euros; a euros se compran euros con USDC. */
export function conversionPlan(to: CashCurrency, amount: number, rules: Map<string, PairRules>, prices: Map<string, number>): CashConversionPlan {
  const fail = (msg: string) => new BrokerError("invalid_request", `Binance: ${msg}`, { provider: PROVIDER_ID });
  const r = rules.get(FX_PAIR);
  const px = prices.get(FX_PAIR);
  if (!r || !r.trading || !px || !(px > 0)) throw new BrokerError("unsupported", "Binance no tiene ahora el cambio entre euros y USDC (EURUSDC)", { provider: PROVIDER_ID });
  if (!(amount > 0)) throw fail("indica cuánto quieres cambiar");
  const eur = to === USDC ? amount : (amount * FX_MARGIN) / px;
  const quantity = Number(floorToStep(eur, r.stepSize));
  if (!(quantity > 0) || quantity < r.minQty || quantity * px < r.minNotional) throw fail(`la cantidad mínima para cambiar es ${Math.max(r.minQty, r.minNotional / px).toFixed(2)} €`);
  return {
    symbol: "EUR-USDC",
    providerSymbol: FX_PAIR,
    side: to === USDC ? "sell" : "buy",
    quantity,
    expected: to === USDC ? { currency: USDC, amount: quantity * px } : { currency: QUOTE, amount: quantity },
  };
}
