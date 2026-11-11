// lib/trading/kamikaze/market.ts
// Datos públicos de mercado de Binance para los kamikazes (sin clave): pares en euros, resumen de
// 24 h, velas horarias y precios al momento. Es la fuente más fina y gratuita para crypto intradía.
import "server-only";
import { parseExchangeInfo, type PairRules } from "@/lib/brokers/adapters/binance/mapping";
import { parseKlines, type Bar, type Ticker } from "./logic";

/** Servidor oficial de datos públicos de mercado de Binance (solo lectura, sin clave). */
const BASE = "https://data-api.binance.vision";

async function get(path: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams(params);
  const res = await fetch(`${BASE}${path}${q.size ? `?${q}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Datos de Binance: error ${res.status} en ${path}`);
  return res.json() as Promise<unknown>;
}

let pairsCache: { rules: Map<string, PairRules>; until: number } | null = null;

/** Pares contra euros que se pueden operar ahora (caché de 1 h). */
export async function eurPairs() {
  if (pairsCache && pairsCache.until > Date.now()) return pairsCache.rules;
  const all = parseExchangeInfo(await get("/api/v3/exchangeInfo", { permissions: "SPOT" }));
  const rules = new Map([...all].filter(([, r]) => r.quote === "EUR" && r.trading));
  pairsCache = { rules, until: Date.now() + 60 * 60_000 };
  return rules;
}

/** Resumen de 24 h de todos los pares en euros. */
export async function tickers(): Promise<Ticker[]> {
  const rules = await eurPairs();
  const pairs = [...rules.keys()];
  if (!pairs.length) return [];
  const data = await get("/api/v3/ticker/24hr", { symbols: JSON.stringify(pairs) });
  if (!Array.isArray(data)) throw new Error("Datos de Binance: resumen de 24 h no válido");
  return (data as Record<string, unknown>[])
    .filter((t) => typeof t.symbol === "string" && rules.has(t.symbol))
    .map((t) => ({
      pair: t.symbol as string,
      base: rules.get(t.symbol as string)!.base,
      price: Number(t.lastPrice),
      ch24h: Number(t.priceChangePercent),
      high24h: Number(t.highPrice),
      low24h: Number(t.lowPrice),
      volume24h: Number(t.quoteVolume),
    }))
    .filter((t) => t.price > 0);
}

/** Velas horarias de los últimos 3 días de un par. */
export async function hourly(pair: string): Promise<Bar[]> {
  return parseKlines(await get("/api/v3/klines", { symbol: pair, interval: "1h", limit: "72" }));
}

/** Precio al momento de unos pares. */
export async function prices(pairs: string[]): Promise<Map<string, number>> {
  if (!pairs.length) return new Map();
  const data = await get("/api/v3/ticker/price", { symbols: JSON.stringify([...new Set(pairs)]) });
  if (!Array.isArray(data)) throw new Error("Datos de Binance: precios no válidos");
  return new Map((data as Record<string, unknown>[]).map((p) => [String(p.symbol), Number(p.price)] as const).filter(([, v]) => v > 0));
}

/** Símbolo de CRS de un par en euros (BTCEUR → BTC-EUR). */
export const symbolOf = (pair: string, rules: Map<string, PairRules>) => {
  const r = rules.get(pair);
  return r ? `${r.base}-EUR` : null;
};
