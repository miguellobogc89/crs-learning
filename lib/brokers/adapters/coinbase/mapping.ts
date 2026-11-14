// lib/brokers/adapters/coinbase/mapping.ts
// Traducción entre Coinbase Advanced Trade (al contado) y el contrato común: productos (pares), reglas de
// cantidad y precio, saldos, órdenes y operaciones. Puro: sin red. Lo prueban los tests.
//
// Euros y USDC: en Europa muchas monedas de Coinbase solo cotizan contra USDC (un dólar digital). El
// efectivo es la suma de euros y USDC (en euros) y cada moneda se compra con el efectivo que tengas:
// si tu dinero está en USDC, contra USDC (BTC-USDC); si está en euros, contra euros (BTC-EUR). Lo que
// cotiza en USDC se enseña en euros, al cambio del momento (producto USDC-EUR).
import {
  BrokerError,
  type BrokerAccount,
  type BrokerEnvironment,
  type BrokerExecution,
  type BrokerInstrument,
  type BrokerOrder,
  type BrokerPosition,
  type CashBalance,
  type CashCurrency,
  type OrderStatus,
  type OrderType,
  type SymbolResolution,
} from "../../types";
import type { AdapterOrder, CashConversionPlan } from "../../adapter";
import { PROVIDER_ID } from "./api";

export const EUR = "EUR";
export const USDC = "USDC";
/** Producto con el que se cambian euros y USDC (base USDC, cotiza en euros). */
export const FX_PRODUCT = "USDC-EUR";

const n = (v: unknown) => (typeof v === "string" || typeof v === "number" ? Number(v) : NaN);
const bad = (what: string) => new BrokerError("provider_unavailable", `Coinbase devolvió ${what}`, { provider: PROVIDER_ID });

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------
export type Product = {
  product: string;
  base: string;
  quote: string;
  trading: boolean;
  /** Solo admite órdenes limitadas (no a mercado). */
  limitOnly: boolean;
  baseIncrement: string | null;
  quoteIncrement: string | null;
  baseMin: number;
  quoteMin: number;
  price: number | null;
};

export function parseProducts(data: unknown): Map<string, Product> {
  const list = (data as { products?: unknown })?.products;
  if (!Array.isArray(list)) throw bad("un catálogo no válido");
  const out = new Map<string, Product>();
  for (const raw of list) {
    const p = raw as Record<string, unknown>;
    if (typeof p.product_id !== "string") continue;
    const base = typeof p.base_currency_id === "string" ? p.base_currency_id : p.product_id.split("-")[0];
    const quote = typeof p.quote_currency_id === "string" ? p.quote_currency_id : p.product_id.split("-")[1] ?? "";
    if (p.product_type !== undefined && p.product_type !== "SPOT") continue;
    const price = n(p.price);
    out.set(p.product_id, {
      product: p.product_id,
      base,
      quote,
      trading: (p.status === undefined || p.status === "online") && p.trading_disabled !== true && p.is_disabled !== true && p.cancel_only !== true && p.view_only !== true,
      limitOnly: p.limit_only === true || p.post_only === true,
      baseIncrement: typeof p.base_increment === "string" ? p.base_increment : null,
      quoteIncrement: typeof p.quote_increment === "string" ? p.quote_increment : null,
      baseMin: n(p.base_min_size) || 0,
      quoteMin: n(p.quote_min_size) || 0,
      price: price > 0 ? price : null,
    });
  }
  return out;
}

/** Euros por 1 USDC (del producto USDC-EUR). null si no se puede saber. */
export const usdcInEur = (products: Map<string, Product>) => products.get(FX_PRODUCT)?.price ?? null;

/** Precio en euros de una moneda: su par en euros o, si no, su par en USDC al cambio. */
export function eurPrice(asset: string, products: Map<string, Product>): number | null {
  if (asset === EUR) return 1;
  const fx = usdcInEur(products);
  if (asset === USDC) return fx;
  const e = products.get(`${asset}-${EUR}`)?.price ?? null;
  if (e) return e;
  const u = products.get(`${asset}-${USDC}`)?.price ?? null;
  return u && fx ? u * fx : null;
}

/** Decimales que permite un incremento («0.00010000» → 4). */
export const decimalsOf = (step: string | null) => {
  if (!step) return 8;
  const [, frac = ""] = step.split(".");
  return frac.replace(/0+$/, "").length;
};

/** Redondea hacia abajo al incremento permitido y lo devuelve como texto. */
export function floorToStep(value: number, step: string | null): string {
  const s = Number(step);
  const dec = decimalsOf(step);
  if (!step || !(s > 0)) return value.toFixed(dec);
  const units = Math.floor(value / s + 1e-9);
  return (units * s).toFixed(dec);
}

// ---------------------------------------------------------------------------
// Saldos → efectivo, cuenta y posiciones
// ---------------------------------------------------------------------------
export type Balance = { asset: string; available: number; hold: number };

export function parseAccounts(data: unknown): { balances: Balance[]; hasNext: boolean; cursor: string | null } {
  const d = data as { accounts?: unknown; has_next?: unknown; cursor?: unknown } | null;
  if (!d || !Array.isArray(d.accounts)) throw bad("datos de cuenta no válidos");
  const byAsset = new Map<string, Balance>();
  for (const raw of d.accounts as Record<string, unknown>[]) {
    const currency = typeof raw.currency === "string" ? raw.currency.toUpperCase() : null;
    if (!currency) continue;
    const available = n((raw.available_balance as { value?: unknown } | undefined)?.value) || 0;
    const hold = n((raw.hold as { value?: unknown } | undefined)?.value) || 0;
    const prev = byAsset.get(currency) ?? { asset: currency, available: 0, hold: 0 };
    byAsset.set(currency, { asset: currency, available: prev.available + available, hold: prev.hold + hold });
  }
  return {
    balances: [...byAsset.values()].filter((b) => b.available + b.hold > 0),
    hasNext: d.has_next === true,
    cursor: typeof d.cursor === "string" && d.cursor ? d.cursor : null,
  };
}

/** Efectivo libre por moneda (euros y USDC) y su valor en euros. */
export function cashOf(balances: Balance[], products: Map<string, Product>): CashBalance[] {
  const fx = usdcInEur(products);
  const out: CashBalance[] = [];
  const eur = balances.find((b) => b.asset === EUR);
  const usdc = balances.find((b) => b.asset === USDC);
  out.push({ currency: EUR, amount: eur?.available ?? 0, valueEur: eur?.available ?? 0 });
  if (usdc || fx) out.push({ currency: USDC, amount: usdc?.available ?? 0, valueEur: (usdc?.available ?? 0) * (fx ?? 0) });
  return out;
}

/** Con qué efectivo se compra: el que más valor tenga ahora mismo (a igualdad, euros). */
export function cashCurrencyOf(cash: CashBalance[]): CashCurrency {
  const eur = cash.find((c) => c.currency === EUR)?.valueEur ?? 0;
  const usdc = cash.find((c) => c.currency === USDC)?.valueEur ?? 0;
  return usdc > eur ? USDC : EUR;
}

/** Producto con el que se opera una moneda: en la moneda de tu efectivo si existe; si no, en la otra. */
export function productFor(asset: string, products: Map<string, Product>, prefer: CashCurrency): Product | null {
  const order = prefer === USDC ? [USDC, EUR] : [EUR, USDC];
  for (const q of order) {
    const p = products.get(`${asset}-${q}`);
    if (p && p.trading) return p;
  }
  return null;
}

export function toPositions(balances: Balance[], products: Map<string, Product>, prefer: CashCurrency): BrokerPosition[] {
  return balances
    .filter((b) => b.asset !== EUR && b.asset !== USDC)
    .map((b) => {
      const p = productFor(b.asset, products, prefer);
      return {
        symbol: p ? `${b.asset}-EUR` : null,
        providerSymbol: p ? p.product : b.asset,
        name: b.asset,
        quantity: b.available + b.hold,
        quantityAvailable: b.available,
        // Coinbase no da el precio medio de compra de un saldo al contado.
        averagePrice: null,
        currentPrice: eurPrice(b.asset, products),
        currency: EUR,
      };
    });
}

export function toAccount(environment: BrokerEnvironment, balances: Balance[], products: Map<string, Product>, positions: BrokerPosition[]): BrokerAccount {
  const cash = cashOf(balances, products);
  const fx = usdcInEur(products) ?? 0;
  const eur = balances.find((b) => b.asset === EUR);
  const usdc = balances.find((b) => b.asset === USDC);
  const invested = positions.reduce((s, p) => s + (p.currentPrice !== null ? p.currentPrice * p.quantity : 0), 0);
  const inCash = (eur ? eur.available + eur.hold : 0) + (usdc ? (usdc.available + usdc.hold) * fx : 0);
  return {
    accountId: "spot",
    label: environment === "real" ? "Coinbase · Advanced" : "Coinbase",
    environment,
    currency: EUR,
    cashAvailable: cash.reduce((s, c) => s + c.valueEur, 0),
    totalValue: inCash + invested,
    investedValue: invested,
    cash,
  };
}

// ---------------------------------------------------------------------------
// Símbolos
// ---------------------------------------------------------------------------
export const toInstrument = (p: Product): BrokerInstrument => ({
  symbol: `${p.base}-EUR`,
  providerSymbol: p.product,
  name: `${p.base}/${p.quote}`,
  market: "crypto",
  currency: p.quote,
  isin: null,
  quantityStep: p.baseIncrement ? Number(p.baseIncrement) : null,
});

/** CRS habla de «BTC-EUR»; en Coinbase se opera BTC-EUR o BTC-USDC según tu efectivo. */
export function resolve(symbol: string, products: Map<string, Product>, prefer: CashCurrency): SymbolResolution {
  const m = /^([A-Z0-9]{2,12})-EUR$/.exec(symbol.trim().toUpperCase());
  if (!m) return { status: "not_found" };
  const asset = m[1];
  if (asset === USDC) return { status: "unsupported", reason: "USDC es efectivo: se cambia desde la conexión, no se compra" };
  const p = productFor(asset, products, prefer);
  if (p) return { status: "ok", instrument: toInstrument(p), how: p.quote === EUR ? "par en euros" : "par en USDC (tu efectivo está en USDC)" };
  if (products.has(`${asset}-${EUR}`) || products.has(`${asset}-${USDC}`)) return { status: "unsupported", reason: `${asset} no se puede operar ahora en Coinbase` };
  return { status: "not_found" };
}

// ---------------------------------------------------------------------------
// Órdenes
// ---------------------------------------------------------------------------
/** Cuerpo de la orden para Coinbase, ya ajustado a las reglas del producto. Valida mínimos. */
export function orderBody(o: AdapterOrder, p: Product): Record<string, unknown> {
  const fail = (msg: string) => new BrokerError("invalid_request", `Coinbase: ${msg}`, { provider: PROVIDER_ID });
  if (!p.trading) throw fail(`${p.product} no se puede operar ahora`);
  if (o.type === "market" && p.limitOnly) throw new BrokerError("unsupported", `Coinbase solo admite órdenes limitadas en ${p.product}`, { provider: PROVIDER_ID });
  const size = floorToStep(o.quantity, p.baseIncrement);
  if (!(Number(size) > 0) || Number(size) < p.baseMin) throw fail(`la cantidad mínima en ${p.product} es ${p.baseMin}`);
  const limit = o.limitPrice !== null ? floorToStep(o.limitPrice, p.quoteIncrement) : null;
  const stop = o.stopPrice !== null ? floorToStep(o.stopPrice, p.quoteIncrement) : null;
  const ref = limit !== null ? Number(limit) : p.price;
  if (p.quoteMin > 0 && ref !== null && Number(size) * ref < p.quoteMin) throw fail(`el importe mínimo en ${p.product} es ${p.quoteMin} ${p.quote}`);
  let config: Record<string, unknown>;
  if (o.type === "market") config = { market_market_ioc: { base_size: size } };
  else if (o.type === "limit") config = { limit_limit_gtc: { base_size: size, limit_price: limit, post_only: false } };
  else if (o.type === "stop_limit") {
    // Stop de venta por debajo (protección) o de compra por encima (ruptura).
    config = { stop_limit_stop_limit_gtc: { base_size: size, limit_price: limit, stop_price: stop, stop_direction: o.side === "sell" ? "STOP_DIRECTION_STOP_DOWN" : "STOP_DIRECTION_STOP_UP" } };
  } else throw new BrokerError("unsupported", `Coinbase no admite órdenes ${o.type}`, { provider: PROVIDER_ID });
  return { client_order_id: o.clientOrderId, product_id: p.product, side: o.side === "sell" ? "SELL" : "BUY", order_configuration: config };
}

const STATUS: Record<string, OrderStatus> = {
  PENDING: "open",
  QUEUED: "open",
  OPEN: "open",
  CANCEL_QUEUED: "open",
  EDIT_QUEUED: "open",
  FILLED: "filled",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  FAILED: "rejected",
};
export const orderStatus = (s: unknown, filled = 0): OrderStatus => {
  const st = typeof s === "string" ? STATUS[s] ?? "unknown" : "unknown";
  return st === "open" && filled > 0 ? "partially_filled" : st;
};
const TYPE: Record<string, OrderType> = { MARKET: "market", LIMIT: "limit", STOP: "stop", STOP_LIMIT: "stop_limit" };

function configOf(o: Record<string, unknown>) {
  const c = (o.order_configuration ?? {}) as Record<string, Record<string, unknown>>;
  const first = Object.values(c)[0] ?? {};
  return { size: n(first.base_size), limit: n(first.limit_price), stop: n(first.stop_price), quoteSize: n(first.quote_size) };
}

export function parseOrder(value: unknown, products?: Map<string, Product>): BrokerOrder {
  const o = (value as { order?: unknown })?.order ?? value;
  const r = o as Record<string, unknown> | null;
  if (!r || typeof r.order_id !== "string" || typeof r.product_id !== "string") throw bad("una orden incompleta");
  const cfg = configOf(r);
  const filled = n(r.filled_size);
  const avg = n(r.average_filled_price);
  const p = products?.get(r.product_id);
  const quote = p?.quote ?? r.product_id.split("-")[1] ?? EUR;
  const base = p?.base ?? r.product_id.split("-")[0];
  const fx = products ? usdcInEur(products) : null;
  const avgPrice = avg > 0 ? avg : null;
  return {
    orderId: r.order_id,
    symbol: `${base}-EUR`,
    providerSymbol: r.product_id,
    side: r.side === "SELL" ? "sell" : "buy",
    type: TYPE[String(r.order_type)] ?? (cfg.limit > 0 ? "limit" : "market"),
    status: orderStatus(r.status, filled > 0 ? filled : 0),
    providerStatus: typeof r.status === "string" ? r.status : null,
    quantity: cfg.size > 0 ? cfg.size : filled > 0 ? filled : 0,
    filledQuantity: Number.isFinite(filled) ? filled : null,
    limitPrice: cfg.limit > 0 ? cfg.limit : null,
    stopPrice: cfg.stop > 0 ? cfg.stop : null,
    averageFillPrice: avgPrice,
    averageFillPriceEur: avgPrice === null ? null : quote === EUR ? avgPrice : quote === USDC && fx ? avgPrice * fx : null,
    // Las de CRS llevan nuestro identificador; las demás se crearon fuera (app de Coinbase u otra integración).
    createdByApi: typeof r.client_order_id === "string" ? r.client_order_id.startsWith("crs") : null,
    createdAt: typeof r.created_time === "string" ? r.created_time : null,
  };
}

export function parseOrders(data: unknown, products?: Map<string, Product>): BrokerOrder[] {
  const list = (data as { orders?: unknown })?.orders;
  if (!Array.isArray(list)) throw bad("órdenes no válidas");
  return list.map((o) => parseOrder(o, products));
}

export function parseFills(data: unknown): BrokerExecution[] {
  const list = (data as { fills?: unknown })?.fills;
  if (!Array.isArray(list)) throw bad("operaciones no válidas");
  return list.map((raw) => {
    const f = raw as Record<string, unknown>;
    const product = String(f.product_id ?? "");
    return {
      executionId: String(f.entry_id ?? f.trade_id ?? ""),
      orderId: typeof f.order_id === "string" ? f.order_id : null,
      symbol: product ? `${product.split("-")[0]}-EUR` : null,
      providerSymbol: product,
      side: f.side === "SELL" ? "sell" : "buy",
      quantity: n(f.size),
      price: n(f.price),
      currency: product.split("-")[1] ?? null,
      executedAt: typeof f.trade_time === "string" ? f.trade_time : null,
    } satisfies BrokerExecution;
  });
}

// ---------------------------------------------------------------------------
// Cambio de efectivo (euros ↔ USDC) con el producto USDC-EUR
// ---------------------------------------------------------------------------
/** Margen para que el cambio no pida más euros de los que hay si el precio se mueve al ejecutar. */
const FX_MARGIN = 0.995;

export function conversionPlan(to: CashCurrency, amount: number, products: Map<string, Product>): CashConversionPlan {
  const fail = (msg: string) => new BrokerError("invalid_request", `Coinbase: ${msg}`, { provider: PROVIDER_ID });
  const p = products.get(FX_PRODUCT);
  if (!p || !p.trading || !p.price) throw new BrokerError("unsupported", "Coinbase no tiene ahora el cambio entre euros y USDC (USDC-EUR)", { provider: PROVIDER_ID });
  if (!(amount > 0)) throw fail("indica cuánto quieres cambiar");
  // Base USDC, cotiza en euros: a USDC se compra USDC; a euros se vende USDC.
  const usdc = to === USDC ? (amount * FX_MARGIN) / p.price : amount;
  const quantity = Number(floorToStep(usdc, p.baseIncrement));
  if (!(quantity > 0) || quantity < p.baseMin || quantity * p.price < p.quoteMin) throw fail(`la cantidad mínima para cambiar es ${Math.max(p.quoteMin, p.baseMin * p.price).toFixed(2)} €`);
  return {
    symbol: FX_PRODUCT,
    providerSymbol: FX_PRODUCT,
    side: to === USDC ? "buy" : "sell",
    quantity,
    expected: to === USDC ? { currency: USDC, amount: quantity } : { currency: EUR, amount: quantity * p.price },
  };
}
