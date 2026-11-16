// Panorama del mercado: lee los indicadores básicos de fuentes públicas (cada una por su lado: si una
// falla, las demás siguen), guarda en memoria 10 minutos y deja una foto diaria en la base de datos.
import "server-only";
import { prisma } from "@/lib/prisma";
import { getMarketPhase } from "../chip/phase-service";
import type { MarketPhase } from "../chip/phase";
import { FARO2_RULES } from "../faro/logic";
import { fetchDailyCandles } from "../market-data";
import { btcPulse, fearGreedZone, pulseReads, pulseSnapshot, type BtcPulse, type Dollar, type FearGreed, type Funding, type GlobalMarket, type Read } from "./logic";

export type Pulse = {
  asOf: string;
  btc: BtcPulse | null;
  fearGreed: FearGreed | null;
  global: GlobalMarket | null;
  funding: Funding | null;
  dollar: Dollar | null;
  phase: MarketPhase | null;
  faro2: { btc24hLimit: number; paused: boolean };
  reads: Read[];
};

const TTL = 10 * 60_000;
let cache: { value: Pulse; until: number } | null = null;

async function json(url: string, timeoutMs = 8_000): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; Crussader/1.0)" } });
  if (!res.ok) throw new Error(`${new URL(url).host}: error ${res.status}`);
  return res.json();
}
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[trading] panorama: ${label}`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Bitcoin en euros desde Bitvavo: velas diarias (400 días) y el ticker de 24 h. */
async function btc(): Promise<BtcPulse> {
  const [rows, t] = await Promise.all([
    json("https://api.bitvavo.com/v2/BTC-EUR/candles?interval=1d&limit=400") as Promise<[number, string, string, string, string, string][]>,
    json("https://api.bitvavo.com/v2/ticker/24h?market=BTC-EUR") as Promise<{ last?: string; open?: string; volumeQuote?: string }>,
  ]);
  const today = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  const closed = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ t: Number(r[0]), c: Number(r[4]), v: Number(r[5]) }))
    .filter((x) => x.t < today && x.c > 0);
  const price = num(t?.last);
  if (!price || closed.length < 30) throw new Error("Bitvavo: sin datos de Bitcoin");
  return btcPulse(closed, { price, open24h: num(t?.open), volume24hEur: num(t?.volumeQuote) });
}

/** Índice de miedo y codicia de las cripto (alternative.me), con el último mes. */
async function fearGreed(): Promise<FearGreed> {
  const d = (await json("https://api.alternative.me/fng/?limit=31")) as { data?: { value?: string; timestamp?: string }[] };
  const list = (d?.data ?? []).map((x) => ({ t: Number(x.timestamp) * 1000, v: Number(x.value) })).filter((x) => Number.isFinite(x.v) && x.t > 0);
  if (!list.length) throw new Error("alternative.me: sin datos");
  // Vienen del más reciente al más antiguo.
  return {
    value: list[0].v,
    label: fearGreedZone(list[0].v).label,
    yesterday: list[1]?.v ?? null,
    weekAgo: list[7]?.v ?? null,
    monthAgo: list[30]?.v ?? null,
    history: [...list].reverse(),
  };
}

/** Tamaño y actividad de todo el mercado cripto (CoinGecko). */
async function global(): Promise<GlobalMarket> {
  const d = (await json("https://api.coingecko.com/api/v3/global")) as {
    data?: { total_market_cap?: Record<string, number>; total_volume?: Record<string, number>; market_cap_percentage?: Record<string, number>; market_cap_change_percentage_24h_usd?: number };
  };
  const g = d?.data;
  const cap = num(g?.total_market_cap?.eur);
  const vol = num(g?.total_volume?.eur);
  const dom = num(g?.market_cap_percentage?.btc);
  if (cap === null || vol === null || dom === null) throw new Error("CoinGecko: sin datos");
  return { marketCapEur: cap, volumeEur: vol, btcDominance: Math.round(dom * 10) / 10, marketCapCh24h: num(g?.market_cap_change_percentage_24h_usd) };
}

/** Funding de los futuros perpetuos de Bitcoin (cada 8 h), con el último mes. Binance y, si no responde, OKX. */
async function funding(): Promise<Funding> {
  try {
    const [now, hist] = await Promise.all([
      json("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT") as Promise<{ lastFundingRate?: string }>,
      json("https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=90") as Promise<{ fundingRate?: string; fundingTime?: number }[]>,
    ]);
    const rate = num(now?.lastFundingRate);
    if (rate === null) throw new Error("Binance: sin funding");
    const history = (Array.isArray(hist) ? hist : []).map((h) => ({ t: Number(h.fundingTime), v: Number(h.fundingRate) * 100 })).filter((h) => Number.isFinite(h.v));
    return { ratePct: rate * 100, source: "Binance", history };
  } catch {
    const [now, hist] = await Promise.all([
      json("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP") as Promise<{ data?: { fundingRate?: string }[] }>,
      json("https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=90") as Promise<{ data?: { realizedRate?: string; fundingRate?: string; fundingTime?: string }[] }>,
    ]);
    const rate = num(now?.data?.[0]?.fundingRate);
    if (rate === null) throw new Error("OKX: sin funding");
    const history = (hist?.data ?? [])
      .map((h) => ({ t: Number(h.fundingTime), v: Number(h.realizedRate ?? h.fundingRate) * 100 }))
      .filter((h) => Number.isFinite(h.v))
      .sort((a, b) => a.t - b.t);
    return { ratePct: rate * 100, source: "OKX", history };
  }
}

/** Índice del dólar (DXY: el dólar frente a las grandes monedas), últimos 6 meses. */
async function dollar(): Promise<Dollar> {
  const { candles } = await fetchDailyCandles("DX-Y.NYB", { years: 0.5, timeoutMs: 8_000 });
  const list = candles.filter((c) => c.c > 0);
  if (!list.length) throw new Error("Yahoo: sin DXY");
  const last = list[list.length - 1];
  const monthAgo = list.filter((c) => c.t <= last.t - 30 * 86_400_000).pop();
  return {
    value: Math.round(last.c * 100) / 100,
    ch30d: monthAgo ? Math.round(((last.c - monthAgo.c) / monthAgo.c) * 10_000) / 100 : null,
    history: list.slice(-120).map((c) => ({ t: c.t, v: Math.round(c.c * 100) / 100 })),
  };
}

/** Foto del día (una fila por día, se va actualizando). Tabla fuera del esquema: sin migración, no pasa nada. */
async function saveSnapshot(p: Pulse) {
  const data = JSON.stringify(pulseSnapshot(p));
  await prisma
    .$executeRawUnsafe(
      `INSERT INTO "trading_market_pulse" ("day", "data", "updated_at") VALUES (CURRENT_DATE, $1::jsonb, now())
       ON CONFLICT ("day") DO UPDATE SET "data" = EXCLUDED."data", "updated_at" = now()`,
      data,
    )
    .catch(() => undefined);
}

export async function getPulse(): Promise<Pulse> {
  if (cache && cache.until > Date.now()) return cache.value;
  const [b, fg, g, f, d, phase] = await Promise.all([
    safe("bitcoin", btc),
    safe("miedo y codicia", fearGreed),
    safe("mercado global", global),
    safe("funding", funding),
    safe("dólar", dollar),
    safe("fase", getMarketPhase),
  ]);
  // Si una fuente falla, se mantiene lo último que dio (mejor algo de hace un rato que un hueco).
  const prev = cache?.value;
  const btcLimit = FARO2_RULES.minBtc24h;
  const parts = {
    btc: b ?? prev?.btc ?? null,
    fearGreed: fg ?? prev?.fearGreed ?? null,
    global: g ?? prev?.global ?? null,
    funding: f ?? prev?.funding ?? null,
    dollar: d ?? prev?.dollar ?? null,
  };
  const value: Pulse = {
    asOf: new Date().toISOString(),
    ...parts,
    phase: phase ?? prev?.phase ?? null,
    faro2: { btc24hLimit: btcLimit, paused: parts.btc?.ch24h != null && parts.btc.ch24h <= btcLimit },
    reads: pulseReads({ ...parts, btc24hLimit: btcLimit }),
  };
  cache = { value, until: Date.now() + TTL };
  await saveSnapshot(value);
  return value;
}
