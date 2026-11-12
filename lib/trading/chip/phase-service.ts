// lib/trading/chip/phase-service.ts
// Fase del mercado para la pantalla: velas diarias públicas de Bitcoin en euros de Bitvavo (desde 2019,
// para saber cuánto suelen durar las fases) y su precio de ahora. Se guarda en memoria un rato.
import "server-only";
import { marketPhase, type DailyClose, type MarketPhase } from "./phase";

const API = "https://api.bitvavo.com/v2";
const DAY = 86_400_000;
const FIRST = Date.parse("2019-01-01T00:00:00Z");
let candleCache: { list: DailyClose[]; until: number } | null = null;
let priceCache: { price: number; until: number } | null = null;

async function get(path: string) {
  const res = await fetch(`${API}${path}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Bitvavo: error ${res.status}`);
  return res.json() as Promise<unknown>;
}

async function dailyBtc(): Promise<DailyClose[]> {
  if (candleCache && candleCache.until > Date.now()) return candleCache.list;
  const out = new Map<number, number>();
  let end = Date.now();
  for (let k = 0; k < 6 && end > FIRST; k++) {
    const q = new URLSearchParams({ interval: "1d", limit: "1440", start: String(FIRST), end: String(end) });
    const rows = (await get(`/BTC-EUR/candles?${q}`)) as [number, string, string, string, string][];
    if (!Array.isArray(rows) || !rows.length) break;
    for (const r of rows) out.set(Number(r[0]), Number(r[4]));
    const oldest = Math.min(...rows.map((r) => Number(r[0])));
    if (rows.length < 1440) break;
    end = oldest - 1;
  }
  const today = Math.floor(Date.now() / DAY) * DAY;
  const list = [...out.entries()].filter(([t, c]) => t < today && c > 0).sort((a, b) => a[0] - b[0]).map(([t, c]) => ({ t, c }));
  if (!list.length) throw new Error("Bitvavo: sin velas de Bitcoin");
  // Hasta que cierre el día no cambia nada: 1 h basta.
  candleCache = { list, until: Date.now() + 60 * 60_000 };
  return list;
}

async function btcPrice(): Promise<number | null> {
  if (priceCache && priceCache.until > Date.now()) return priceCache.price;
  try {
    const d = (await get("/ticker/price?market=BTC-EUR")) as { price?: string };
    const p = Number(d?.price);
    if (!(p > 0)) return null;
    priceCache = { price: p, until: Date.now() + 60_000 };
    return p;
  } catch {
    return priceCache?.price ?? null;
  }
}

export async function getMarketPhase(): Promise<MarketPhase | null> {
  const [candles, price] = await Promise.all([dailyBtc(), btcPrice()]);
  return marketPhase(candles, price);
}
