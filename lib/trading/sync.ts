// lib/trading/sync.ts
// Descarga de velas, backtest del universo y carga de series desde la base de datos.
import "server-only";
import { prisma } from "@/lib/prisma";
import { analyze, backtestSeries, statsByPattern, summarize } from "./backtest";
import { fetchDailyCandles, IBEX35, INDEX_SYMBOL } from "./market-data";
import { DEFAULT_COSTS } from "./risk";
import type { Candle, PatternKey, PatternStats, TradeOutcome } from "./types";

/** Sesiones que se vuelven a pedir en cada actualización (corrige velas del día ya guardadas). */
const OVERLAP_DAYS = 7;
const PARALLEL = 6;
export const HISTORY_YEARS = 6;

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export const dayDate = (t: number | string) => new Date(typeof t === "number" ? new Date(t).toISOString().slice(0, 10) : t.slice(0, 10));

/** ¿La vela del día `t` corresponde a una sesión que todavía no ha cerrado (Madrid, cierre 17:35 + margen)? */
export function sessionInProgress(t: number, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return new Date(t).toISOString().slice(0, 10) >= today && minutes < 18 * 60;
}

/** Siembra el IBEX 35 y su índice la primera vez. */
export async function ensureUniverse() {
  const count = await prisma.market_instruments.count();
  if (count > 0) return;
  await prisma.market_instruments.createMany({
    data: [
      { symbol: INDEX_SYMBOL, name: "IBEX 35", sector: "Índice", market: "IBEX35", is_index: true },
      ...IBEX35.map((x) => ({ symbol: x.symbol, name: x.name, sector: x.sector, market: "IBEX35" })),
    ],
    skipDuplicates: true,
  });
}

async function saveCandles(instrumentId: string, candles: Candle[]) {
  for (let k = 0; k < candles.length; k += 1000) {
    const part = candles.slice(k, k + 1000);
    await prisma.$executeRaw`
      INSERT INTO market_candles (instrument_id, day, open, high, low, close, volume)
      SELECT ${instrumentId}::uuid, x.d::date, x.o, x.h, x.l, x.c, round(x.v)::bigint
      FROM unnest(
        ${part.map((c) => new Date(c.t).toISOString().slice(0, 10))}::text[],
        ${part.map((c) => c.o)}::float8[],
        ${part.map((c) => c.h)}::float8[],
        ${part.map((c) => c.l)}::float8[],
        ${part.map((c) => c.c)}::float8[],
        ${part.map((c) => c.v)}::float8[]
      ) AS x(d, o, h, l, c, v)
      ON CONFLICT (instrument_id, day) DO UPDATE SET
        open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
        close = EXCLUDED.close, volume = EXCLUDED.volume`;
  }
}

export type MarketSyncSummary = {
  updated: number;
  failed: { symbol: string; error: string }[];
  pending: number;
  candles: number;
};

/** Actualiza las velas, empezando por los valores que hace más tiempo que no se leen. */
export async function syncMarket(budgetMs = 35_000, now = new Date()): Promise<MarketSyncSummary> {
  await ensureUniverse();
  const started = Date.now();
  const fresh = new Date(now.getTime() - 3 * 3600_000);
  const queue = await prisma.market_instruments.findMany({
    where: { active: true, OR: [{ last_sync_at: null }, { last_sync_at: { lt: fresh } }] },
    orderBy: [{ last_sync_at: { sort: "asc", nulls: "first" } }],
  });
  const summary: MarketSyncSummary = { updated: 0, failed: [], pending: 0, candles: 0 };
  let k = 0;
  while (k < queue.length && Date.now() - started < budgetMs) {
    const batch = queue.slice(k, k + PARALLEL);
    k += batch.length;
    await Promise.all(
      batch.map(async (inst) => {
        try {
          const since = inst.last_candle_at
            ? new Date(inst.last_candle_at.getTime() - OVERLAP_DAYS * 86_400_000)
            : undefined;
          const r = await fetchDailyCandles(inst.symbol, { since, years: HISTORY_YEARS });
          // La sesión en curso no se guarda: su vela aún no es definitiva y la cartera la daría por vista.
          r.candles = r.candles.filter((c) => !sessionInProgress(c.t, now));
          if (r.candles.length) await saveCandles(inst.id, r.candles);
          const last = r.candles[r.candles.length - 1];
          await prisma.market_instruments.update({
            where: { id: inst.id },
            data: {
              last_sync_at: new Date(),
              last_error: null,
              currency: r.currency ?? inst.currency,
              ...(last ? { last_candle_at: dayDate(last.t) } : {}),
            },
          });
          summary.updated++;
          summary.candles += r.candles.length;
        } catch (e) {
          const error = e instanceof Error ? e.message.slice(0, 300) : "error desconocido";
          summary.failed.push({ symbol: inst.symbol, error });
          await prisma.market_instruments.update({
            where: { id: inst.id },
            data: { last_sync_at: new Date(), last_error: error },
          });
        }
      }),
    );
  }
  summary.pending = queue.length - k;
  return summary;
}

function toCandle(r: { day: Date; open: number; high: number; low: number; close: number; volume: bigint }): Candle {
  return { t: r.day.getTime(), o: r.open, h: r.high, l: r.low, c: r.close, v: Number(r.volume) };
}

/** Series de varios valores desde una fecha, agrupadas por instrumento. */
export async function loadSeries(instrumentIds: string[], since?: Date) {
  const rows = await prisma.market_candles.findMany({
    where: { instrument_id: { in: instrumentIds }, ...(since ? { day: { gte: since } } : {}) },
    orderBy: [{ instrument_id: "asc" }, { day: "asc" }],
  });
  const out = new Map<string, Candle[]>();
  for (const r of rows) {
    const list = out.get(r.instrument_id) ?? [];
    list.push(toCandle(r));
    out.set(r.instrument_id, list);
  }
  return out;
}

/** Últimas `limit` velas de un valor. */
export async function loadRecent(instrumentId: string, limit: number) {
  const rows = await prisma.market_candles.findMany({
    where: { instrument_id: instrumentId },
    orderBy: { day: "desc" },
    take: limit,
  });
  return rows.reverse().map(toCandle);
}

export type BacktestSnapshot = {
  asOf: string;
  instruments: number;
  trades: number;
  byPattern: Partial<Record<PatternKey, PatternStats>>;
  overall: PatternStats | null;
  perSymbol: Record<string, Partial<Record<PatternKey, { trades: number; winRate: number; avgR: number }>>>;
  recent: (TradeOutcome & { symbol: string; entryDay: string; exitDay: string })[];
  createdAt: string;
};

/** Backtest de todas las figuras sobre todo el histórico guardado. */
export async function runBacktest(force = false): Promise<BacktestSnapshot | null> {
  const instruments = await prisma.market_instruments.findMany({ where: { active: true, is_index: false } });
  if (!instruments.length) return null;
  const lastDay = instruments.reduce<Date | null>(
    (m, i) => (i.last_candle_at && (!m || i.last_candle_at > m) ? i.last_candle_at : m),
    null,
  );
  if (!lastDay) return null;
  if (!force) {
    const prev = await prisma.market_backtests.findFirst({ orderBy: { created_at: "desc" } });
    if (prev && prev.as_of.getTime() >= lastDay.getTime()) return null;
  }
  const series = await loadSeries(instruments.map((i) => i.id));
  const all: TradeOutcome[] = [];
  const perSymbol: BacktestSnapshot["perSymbol"] = {};
  const recent: BacktestSnapshot["recent"] = [];
  for (const inst of instruments) {
    const c = series.get(inst.id);
    if (!c || c.length < 250) continue;
    const trades = backtestSeries(c, DEFAULT_COSTS, analyze(c));
    all.push(...trades);
    const s = statsByPattern(trades);
    perSymbol[inst.symbol] = Object.fromEntries(
      Object.entries(s).map(([k, v]) => [k, { trades: v!.trades, winRate: v!.winRate, avgR: v!.avgR }]),
    );
    for (const t of trades.slice(-6))
      recent.push({ ...t, symbol: inst.symbol, entryDay: dayKey(new Date(c[t.entryIndex].t)), exitDay: dayKey(new Date(c[t.exitIndex].t)) });
  }
  recent.sort((a, b) => b.exitDay.localeCompare(a.exitDay));
  const byPattern = statsByPattern(all);
  const overallRaw = summarize(all, "hch");
  const snapshot = {
    asOf: dayKey(lastDay),
    instruments: Object.keys(perSymbol).length,
    trades: all.filter((t) => t.reason !== "open").length,
    byPattern,
    overall: all.length ? overallRaw : null,
    perSymbol,
    recent: recent.slice(0, 60),
  };
  const row = await prisma.market_backtests.create({
    data: {
      as_of: lastDay,
      instruments: snapshot.instruments,
      trades: snapshot.trades,
      stats: JSON.parse(JSON.stringify(snapshot)),
      params: JSON.parse(JSON.stringify({ costs: DEFAULT_COSTS, entry: "apertura siguiente a la ruptura", oneTradePerSymbol: true })),
    },
  });
  // Se conservan solo las últimas ejecuciones.
  const old = await prisma.market_backtests.findMany({ orderBy: { created_at: "desc" }, skip: 10, select: { id: true } });
  if (old.length) await prisma.market_backtests.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return { ...snapshot, createdAt: row.created_at.toISOString() };
}

export async function latestBacktest(): Promise<BacktestSnapshot | null> {
  const row = await prisma.market_backtests.findFirst({ orderBy: { created_at: "desc" } });
  if (!row) return null;
  return { ...(row.stats as unknown as Omit<BacktestSnapshot, "createdAt">), createdAt: row.created_at.toISOString() };
}
