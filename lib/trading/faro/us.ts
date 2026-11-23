// lib/trading/faro/us.ts
// Datos de la bolsa de EE. UU. para FARO: velas de 1 hora de Yahoo, en euros (al cambio de ahora), con
// la misma forma que las de Binance para reutilizar la criba, las métricas y la puntuación de las ideas.
// En sesión regular hay 7 velas por día (9:30–16:00 de Nueva York).
import "server-only";
import { eurUsd, US_STOCKS } from "../market-data";
import type { Bar, Ticker } from "../kamikaze/logic";

const US = new Set(US_STOCKS.map((u) => u.symbol));
/** Los fondos de referencia no se proponen como idea. */
const SKIP = new Set(["QQQ", "SPY"]);
/** ¿Es una acción americana (y no un par de Binance)? Los pares de FARO en EE. UU. son su ticker. */
export const isUsPair = (pair: string) => US.has(pair);

type YahooHourly = {
  chart?: {
    error?: { description?: string } | null;
    result?: { timestamp?: number[]; indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] } }[] | null;
  };
};

/** Velas horarias de Yahoo (en la moneda del valor), sin las incompletas de datos. Puro: lo prueban los tests. */
export function parseYahooBars(json: unknown): Bar[] {
  const r = (json as YahooHourly)?.chart?.result?.[0];
  if (!r) throw new Error((json as YahooHourly)?.chart?.error?.description || "Respuesta sin datos");
  const q = r.indicators?.quote?.[0] ?? {};
  const out: Bar[] = [];
  (r.timestamp ?? []).forEach((ts, k) => {
    const o = q.open?.[k];
    const h = q.high?.[k];
    const l = q.low?.[k];
    const c = q.close?.[k];
    if (o == null || h == null || l == null || c == null || !(c > 0)) return;
    out.push({ t: ts * 1000, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, qv: Math.max(0, q.volume?.[k] ?? 0) * c });
  });
  return out;
}

async function rate() {
  const fx = await eurUsd();
  const last = fx[fx.length - 1]?.c;
  if (!last || !(last > 0)) throw new Error("Sin cambio euro/dólar");
  return last;
}

/** Velas de 1 h de un valor entre dos instantes, en euros. */
export async function usBars(symbol: string, from: number, to = Date.now()): Promise<Bar[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${Math.floor(from / 1000)}&period2=${Math.ceil(to / 1000)}&interval=1h&includePrePost=false`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Crussader/1.0)", Accept: "application/json" }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!res.ok) throw new Error(`El proveedor de datos respondió ${res.status} para ${symbol}`);
  const r = await rate();
  return parseYahooBars(await res.json()).map((b) => ({ ...b, o: b.o / r, h: b.h / r, l: b.l / r, c: b.c / r, qv: b.qv / r }));
}

const DAY = 86_400_000;
export const usBarsSince = (symbol: string, since: number) => usBars(symbol, since - 3_600_000);
export const usHourlyUntil = (symbol: string, t: number) => usBars(symbol, t - 7 * DAY, t);

/** Resumen de un valor como el ticker de 24 h de Binance (aquí, la última sesión: 7 velas). */
export function usTickerOf(symbol: string, bars: Bar[]): Ticker | null {
  if (bars.length < 8) return null;
  const last = bars[bars.length - 1];
  const session = bars.slice(-7);
  const prev = bars[bars.length - 8].c;
  return {
    pair: symbol,
    base: symbol,
    price: last.c,
    ch24h: prev > 0 ? ((last.c - prev) / prev) * 100 : 0,
    high24h: Math.max(...session.map((b) => b.h)),
    low24h: Math.min(...session.map((b) => b.l)),
    volume24h: session.reduce((s, b) => s + b.qv, 0),
  };
}

/** Todos los valores americanos (sin los fondos de referencia) con sus velas de los últimos ~5 días. */
export async function usMarket(): Promise<{ tickers: Ticker[]; bars: Map<string, Bar[]>; qqq24h: number | null }> {
  const symbols = US_STOCKS.map((u) => u.symbol);
  const bars = new Map<string, Bar[]>();
  const queue = [...symbols];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        bars.set(s, await usBars(s, Date.now() - 7 * DAY));
      } catch {
        // Sin datos de este valor: se queda fuera esta vez.
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const tickers = symbols.filter((s) => !SKIP.has(s)).map((s) => usTickerOf(s, bars.get(s) ?? [])).filter((t): t is Ticker => !!t);
  const qqq = usTickerOf("QQQ", bars.get("QQQ") ?? []);
  return { tickers, bars, qqq24h: qqq ? qqq.ch24h : null };
}
