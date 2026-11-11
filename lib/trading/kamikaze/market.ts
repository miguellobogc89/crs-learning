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

/** Pares operables desde España: contra euros y contra USDC (USDT no está permitido en la UE). */
export async function eurPairs() {
  if (pairsCache && pairsCache.until > Date.now()) return pairsCache.rules;
  const all = parseExchangeInfo(await get("/api/v3/exchangeInfo", { permissions: "SPOT" }));
  const rules = new Map([...all].filter(([, r]) => (r.quote === "EUR" || r.quote === "USDC") && r.trading));
  pairsCache = { rules, until: Date.now() + 60 * 60_000 };
  return rules;
}

/** Euros por 1 USDC (del par EURUSDC). */
async function usdcInEur(): Promise<number> {
  const data = (await get("/api/v3/ticker/price", { symbol: "EURUSDC" })) as { price?: string };
  const p = Number(data?.price);
  if (!(p > 0)) throw new Error("Datos de Binance: sin cambio EUR/USDC");
  return 1 / p;
}

/** Resumen de 24 h de los pares EUR y USDC, en euros. De cada moneda, el par con más volumen. */
export async function tickers(): Promise<Ticker[]> {
  const rules = await eurPairs();
  const pairs = [...rules.keys()];
  if (!pairs.length) return [];
  const [data, fx] = await Promise.all([get("/api/v3/ticker/24hr", { symbols: JSON.stringify(pairs) }), usdcInEur()]);
  if (!Array.isArray(data)) throw new Error("Datos de Binance: resumen de 24 h no válido");
  const best = new Map<string, Ticker>();
  for (const t of data as Record<string, unknown>[]) {
    const r = typeof t.symbol === "string" ? rules.get(t.symbol) : undefined;
    if (!r) continue;
    const k = r.quote === "USDC" ? fx : 1;
    const row: Ticker = {
      pair: r.pair,
      base: r.base,
      price: Number(t.lastPrice) * k,
      ch24h: Number(t.priceChangePercent),
      high24h: Number(t.highPrice) * k,
      low24h: Number(t.lowPrice) * k,
      volume24h: Number(t.quoteVolume) * k,
    };
    if (!(row.price > 0)) continue;
    const prev = best.get(r.base);
    if (!prev || row.volume24h > prev.volume24h) best.set(r.base, row);
  }
  return [...best.values()];
}

/** Velas horarias de los últimos 3 días de un par, en euros. */
export async function hourly(pair: string): Promise<Bar[]> {
  const bars = parseKlines(await get("/api/v3/klines", { symbol: pair, interval: "1h", limit: "72" }));
  if (!pair.endsWith("USDC")) return bars;
  const k = await usdcInEur();
  return bars.map((b) => ({ ...b, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k, qv: b.qv * k }));
}

/** Velas de 5 minutos desde un momento (hasta ~83 h), en euros: para puntuar las ideas de FARO. */
export async function barsSince(pair: string, since: number): Promise<Bar[]> {
  const bars = parseKlines(await get("/api/v3/klines", { symbol: pair, interval: "5m", startTime: String(Math.floor(since)), limit: "1000" }));
  if (!pair.endsWith("USDC")) return bars;
  const k = await usdcInEur();
  return bars.map((b) => ({ ...b, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k, qv: b.qv * k }));
}

/** Precio en euros de un par (EUR directo; USDC convertido). */
export async function priceEur(pair: string): Promise<number | null> {
  const data = (await get("/api/v3/ticker/price", { symbol: pair })) as { price?: string };
  const p = Number(data?.price);
  if (!(p > 0)) return null;
  return pair.endsWith("USDC") ? p * (await usdcInEur()) : p;
}

/** Símbolo de CRS de un par (BTCEUR o BTCUSDC → BTC-EUR: en CRS todo se valora en euros). */
export const symbolOf = (pair: string, rules: Map<string, PairRules>) => {
  const r = rules.get(pair);
  return r ? `${r.base}-EUR` : null;
};
