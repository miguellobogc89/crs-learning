// lib/trading/faro/context.ts
// Foto del mercado que se guarda con cada idea y cada candidato de FARO (17/11/2026), para cruzar
// después qué situaciones le salen bien y cuáles mal. Todo es opcional: si una fuente falla, se guarda
// sin ese dato y FARO sigue.
import "server-only";
import { eurUsd } from "../market-data";

const MIN = 60_000;

export type MarketContext = {
  /** Índice de miedo y codicia de cripto (0 = miedo extremo, 100 = codicia extrema). */
  fearGreed: number | null;
  /** Peso de Bitcoin en el total del mercado cripto, en %. */
  btcDominance: number | null;
  /** Cambio del total del mercado cripto en 24 h, en %. */
  marketCap24h: number | null;
  /** Euro frente al dólar (cierre más reciente). */
  eurUsd: number | null;
};

let ctxCache: { at: number; value: MarketContext } | null = null;

async function json(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<unknown>;
}

/** Contexto general del mercado, como mucho una lectura cada 15 minutos. */
export async function marketContext(): Promise<MarketContext> {
  if (ctxCache && Date.now() - ctxCache.at < 15 * MIN) return ctxCache.value;
  const [fng, global, fx] = await Promise.allSettled([
    json("https://api.alternative.me/fng/?limit=1"),
    json("https://api.coingecko.com/api/v3/global"),
    eurUsd(1),
  ]);
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const fngValue = fng.status === "fulfilled" ? num((fng.value as { data?: { value?: string }[] })?.data?.[0]?.value) : NaN;
  const g = global.status === "fulfilled" ? (global.value as { data?: { market_cap_percentage?: { btc?: number }; market_cap_change_percentage_24h_usd?: number } }).data : undefined;
  const lastFx = fx.status === "fulfilled" ? fx.value[fx.value.length - 1]?.c : undefined;
  const value: MarketContext = {
    fearGreed: Number.isFinite(fngValue) ? fngValue : null,
    btcDominance: r2(num(g?.market_cap_percentage?.btc)),
    marketCap24h: r2(num(g?.market_cap_change_percentage_24h_usd)),
    eurUsd: typeof lastFx === "number" ? Math.round(lastFx * 10000) / 10000 : null,
  };
  ctxCache = { at: Date.now(), value };
  return value;
}

/** Diferencia entre la mejor oferta de venta y de compra de cada par de Binance, en % (liquidez). */
export async function spreads(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const rows = (await json("https://data-api.binance.vision/api/v3/ticker/bookTicker")) as { symbol: string; bidPrice: string; askPrice: string }[];
    for (const r of rows) {
      const bid = Number(r.bidPrice);
      const ask = Number(r.askPrice);
      if (bid > 0 && ask >= bid) out.set(r.symbol, Math.round(((ask - bid) / ((ask + bid) / 2)) * 1_000_000) / 10_000);
    }
  } catch {
    // Sin libro de órdenes: se guarda sin spread.
  }
  return out;
}
