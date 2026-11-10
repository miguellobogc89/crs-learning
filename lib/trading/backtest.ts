// lib/trading/backtest.ts
// Backtest sin mirar el futuro: la figura se detecta con los pivotes conocidos en cada momento,
// la señal es el cierre de ruptura y la entrada es la apertura de la sesión siguiente.
// Si la apertura ya salta el stop, la operación no se hace. Si en una misma vela se tocan stop
// y objetivo, se asume lo peor (stop).
import { indicatorBundle, type IndicatorBundle } from "./indicators";
import { evaluateSetup, findSetups } from "./patterns";
import { zigzag } from "./pivots";
import { DEFAULT_COSTS, slipped, type CostModel } from "./risk";
import type { Candle, Detection, Pivot, PatternKey, PatternStats, TradeOutcome } from "./types";

export type Analysis = { ind: IndicatorBundle; pivots: Pivot[]; detections: Detection[] };

/** Detecta y evalúa todas las figuras de la serie completa. */
export function analyze(c: Candle[], fromIndex = 0): Analysis {
  const ind = indicatorBundle(c);
  const pivots = zigzag(c);
  const detections: Detection[] = [];
  for (const st of findSetups(c, ind, pivots, fromIndex)) {
    const d = evaluateSetup(st, c, ind, c.length - 1);
    if (d) detections.push(d);
  }
  return { ind, pivots, detections };
}

export function maxHoldBars(d: Pick<Detection, "formedAt" | "startIndex">) {
  return Math.max(20, Math.min(120, 2 * (d.formedAt - d.startIndex)));
}

/** Simula la operación de una detección confirmada. */
export function simulateTrade(d: Detection, c: Candle[], cost: CostModel = DEFAULT_COSTS): TradeOutcome | null {
  if (d.status !== "confirmed" || d.confirmIndex === null) return null;
  const ei = d.confirmIndex + 1;
  if (ei >= c.length) return null;
  const long = d.direction === "long";
  const open = c[ei].o;
  // Hueco que ya salta el stop o el objetivo: no hay operación.
  if (long ? open <= d.stop || open >= d.target : open >= d.stop || open <= d.target) return null;
  const entry = slipped(open, long ? "buy" : "sell", cost);
  const riskPerShare = Math.abs(entry - d.stop);
  if (riskPerShare <= 0) return null;
  const limit = Math.min(c.length - 1, ei + maxHoldBars(d));

  let exit = c[limit].c;
  let exitIndex = limit;
  let reason: TradeOutcome["reason"] = limit === c.length - 1 && limit < ei + maxHoldBars(d) ? "open" : "time";
  for (let i = ei; i <= limit; i++) {
    const bar = c[i];
    if (i > ei && (long ? bar.o <= d.stop : bar.o >= d.stop)) {
      exit = bar.o;
      exitIndex = i;
      reason = "stop";
      break;
    }
    if (long ? bar.l <= d.stop : bar.h >= d.stop) {
      exit = d.stop;
      exitIndex = i;
      reason = "stop";
      break;
    }
    if (i > ei && (long ? bar.o >= d.target : bar.o <= d.target)) {
      exit = bar.o;
      exitIndex = i;
      reason = "target";
      break;
    }
    if (long ? bar.h >= d.target : bar.l <= d.target) {
      exit = d.target;
      exitIndex = i;
      reason = "target";
      break;
    }
  }
  const exitFill = slipped(exit, long ? "sell" : "buy", cost);
  const gross = long ? exitFill - entry : entry - exitFill;
  const fees = ((entry + exitFill) * cost.commissionPct) / 100;
  const net = gross - fees;
  return {
    pattern: d.pattern,
    direction: d.direction,
    entryIndex: ei,
    exitIndex,
    entry,
    exit: exitFill,
    stop: d.stop,
    target: d.target,
    reason,
    r: net / riskPerShare,
    pct: (net / entry) * 100,
    bars: exitIndex - ei + 1,
    quality: d.quality,
  };
}

/** Operaciones de una serie: como mucho una abierta a la vez por valor. */
export function backtestSeries(c: Candle[], cost: CostModel = DEFAULT_COSTS, analysis?: Analysis) {
  const a = analysis ?? analyze(c);
  const confirmed = a.detections
    .filter((d) => d.status === "confirmed")
    .sort((x, y) => x.confirmIndex! - y.confirmIndex! || y.quality - x.quality);
  const trades: TradeOutcome[] = [];
  let busyUntil = -1;
  for (const d of confirmed) {
    if (d.confirmIndex! < busyUntil) continue;
    const t = simulateTrade(d, c, cost);
    if (!t) continue;
    trades.push(t);
    busyUntil = t.exitIndex;
  }
  return trades;
}

/** Estadísticas por figura. Las operaciones aún abiertas no cuentan. */
export function summarize(trades: TradeOutcome[], pattern: PatternKey): PatternStats {
  const closed = trades.filter((t) => t.reason !== "open");
  const n = closed.length;
  const wins = closed.filter((t) => t.r > 0).length;
  const sumR = closed.reduce((s, t) => s + t.r, 0);
  const grossWin = closed.filter((t) => t.r > 0).reduce((s, t) => s + t.r, 0);
  const grossLoss = -closed.filter((t) => t.r < 0).reduce((s, t) => s + t.r, 0);
  let peak = 0;
  let eq = 0;
  let dd = 0;
  for (const t of [...closed].sort((x, y) => x.exitIndex - y.exitIndex)) {
    eq += t.r;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
  }
  const avgR = n ? sumR / n : 0;
  return {
    pattern,
    trades: n,
    wins,
    winRate: n ? wins / n : 0,
    avgR,
    adjustedExpectancy: avgR * (n / (n + 15)),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : n ? null : null,
    avgBars: n ? closed.reduce((s, t) => s + t.bars, 0) / n : 0,
    avgPct: n ? closed.reduce((s, t) => s + t.pct, 0) / n : 0,
    maxDrawdownR: dd,
    bestR: n ? Math.max(...closed.map((t) => t.r)) : 0,
    worstR: n ? Math.min(...closed.map((t) => t.r)) : 0,
  };
}

export function statsByPattern(trades: TradeOutcome[]): Partial<Record<PatternKey, PatternStats>> {
  const by: Partial<Record<PatternKey, TradeOutcome[]>> = {};
  for (const t of trades) (by[t.pattern] ??= []).push(t);
  const out: Partial<Record<PatternKey, PatternStats>> = {};
  for (const [k, list] of Object.entries(by) as [PatternKey, TradeOutcome[]][]) out[k] = summarize(list, k);
  return out;
}
