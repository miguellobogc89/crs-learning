// lib/trading/mula/backtest.ts
// Simulación de «MULA: rebotes en tendencia» sobre velas diarias. Puro: sin base de datos.
// Reglas (decididas antes de mirar resultados):
// - Solo monedas en tendencia: cierre por encima de su media de 50 días.
// - Entrada: tras una caída (RSI14 por debajo de `rsiMax` o `downDays` cierres seguidos a la baja),
//   a la apertura del día siguiente. Si hay varias, la más sobrevendida (RSI más bajo).
// - Salida: objetivo +tp %, stop −sl % (si el mismo día toca los dos, se cuenta el stop: conservador),
//   o al cierre tras `maxDays` días.
// - Una sola posición y todo el capital dentro (perfil arriesgado). Comisión y deslizamiento por lado.
import { rsi, sma } from "../indicators";
import type { Candle } from "../types";

export type MulaParams = {
  tpPct: number;
  slPct: number;
  maxDays: number;
  rsiMax: number;
  downDays: number;
  /** Comisión por orden, en % (Bitvavo ronda el 0,25 %). */
  feePct: number;
  slippagePct: number;
};

export const MULA_DEFAULT: MulaParams = { tpPct: 4, slPct: 4, maxDays: 5, rsiMax: 40, downDays: 3, feePct: 0.25, slippagePct: 0.05 };

export type MulaTrade = {
  symbol: string;
  entryDay: number;
  exitDay: number;
  entry: number;
  exit: number;
  reason: "objetivo" | "stop" | "tiempo";
  /** Rentabilidad neta de la operación, en %. */
  netPct: number;
};

export type MulaResult = {
  params: MulaParams;
  from: number;
  to: number;
  trades: MulaTrade[];
  stats: {
    trades: number;
    winRate: number;
    totalPct: number;
    /** Rentabilidad media por semana (compuesta). */
    weeklyPct: number;
    /** % de semanas en positivo (semanas con o sin operaciones). */
    positiveWeeksPct: number;
    maxDrawdownPct: number;
    worstTradePct: number;
    bestTradePct: number;
    /** Días con dinero invertido sobre el total. */
    exposurePct: number;
    /** Mantener Bitcoin el mismo periodo. */
    btcPct: number | null;
  };
};

type Series = { symbol: string; candles: Candle[]; byDay: Map<number, number>; rsi: (number | null)[]; sma50: (number | null)[] };

const DAY = 86_400_000;
const dayOf = (t: number) => Math.floor(t / DAY) * DAY;

export function runMula(input: { symbol: string; candles: Candle[] }[], params: MulaParams = MULA_DEFAULT, fromTs?: number): MulaResult {
  const series: Series[] = input
    .filter((s) => s.candles.length > 60)
    .map((s) => {
      const closes = s.candles.map((c) => c.c);
      return {
        symbol: s.symbol,
        candles: s.candles,
        byDay: new Map(s.candles.map((c, i) => [dayOf(c.t), i])),
        rsi: rsi(closes, 14),
        sma50: sma(closes, 50),
      };
    });
  const days = [...new Set(series.flatMap((s) => s.candles.map((c) => dayOf(c.t))))].sort((a, b) => a - b);
  const start = fromTs !== undefined ? days.find((d) => d >= dayOf(fromTs)) ?? days[0] : days[Math.min(60, days.length - 1)];
  const cost = (params.feePct + params.slippagePct) / 100;

  let equity = 1;
  const curve: { day: number; equity: number }[] = [];
  const trades: MulaTrade[] = [];
  let pos: { s: Series; entryIdx: number; entry: number; day: number } | null = null;
  let pending: Series | null = null;
  let invested = 0;
  let counted = 0;

  for (const day of days) {
    if (day < start) continue;
    counted++;
    // 1) Entrada a la apertura (señal de ayer).
    if (!pos && pending) {
      const i = pending.byDay.get(day);
      if (i !== undefined) pos = { s: pending, entryIdx: i, entry: pending.candles[i].o, day };
      pending = null;
    }
    // 2) Gestión de la posición en la vela de hoy.
    if (pos) {
      const i = pos.s.byDay.get(day);
      if (i !== undefined) {
        invested++;
        const c = pos.s.candles[i];
        const stop = pos.entry * (1 - params.slPct / 100);
        const target = pos.entry * (1 + params.tpPct / 100);
        let exit: number | null = null;
        let reason: MulaTrade["reason"] = "tiempo";
        if (c.o <= stop) [exit, reason] = [c.o, "stop"]; // abre por debajo del stop
        else if (c.l <= stop) [exit, reason] = [stop, "stop"];
        else if (c.o >= target) [exit, reason] = [c.o, "objetivo"];
        else if (c.h >= target) [exit, reason] = [target, "objetivo"];
        else if (i - pos.entryIdx + 1 >= params.maxDays) [exit, reason] = [c.c, "tiempo"];
        if (exit !== null) {
          const gross = exit / pos.entry;
          const net = (gross * (1 - cost)) / (1 + cost);
          equity *= net;
          trades.push({ symbol: pos.s.symbol, entryDay: pos.day, exitDay: day, entry: pos.entry, exit, reason, netPct: (net - 1) * 100 });
          pos = null;
        }
      }
    }
    // 3) Señal al cierre de hoy (para mañana), solo sin posición.
    if (!pos) {
      let best: { s: Series; r: number } | null = null;
      for (const s of series) {
        const i = s.byDay.get(day);
        if (i === undefined || i < params.downDays) continue;
        const r = s.rsi[i];
        const m = s.sma50[i];
        if (r === null || m === null) continue;
        const c = s.candles;
        if (c[i].c <= m) continue;
        let down = true;
        for (let k = 0; k < params.downDays; k++) if (!(c[i - k].c < c[i - k - 1].c)) down = false;
        if (!(r < params.rsiMax || down)) continue;
        if (!best || r < best.r) best = { s, r };
      }
      pending = best?.s ?? null;
    }
    // Patrimonio del día (la posición abierta, a precio de cierre).
    let mark = equity;
    if (pos) {
      const i = pos.s.byDay.get(day);
      if (i !== undefined) mark = equity * (pos.s.candles[i].c / pos.entry);
    }
    curve.push({ day, equity: mark });
  }

  // Estadísticas
  let peak = 0;
  let mdd = 0;
  for (const p of curve) {
    peak = Math.max(peak, p.equity);
    mdd = Math.min(mdd, (p.equity / peak - 1) * 100);
  }
  const weekly: number[] = [];
  for (let k = 7; k < curve.length; k += 7) weekly.push(curve[k].equity / curve[k - 7].equity - 1);
  const last = curve[curve.length - 1]?.equity ?? 1;
  const weeks = Math.max(1, (curve.length - 1) / 7);
  const btc = series.find((s) => s.symbol === "BTC-EUR");
  let btcPct: number | null = null;
  if (btc && curve.length) {
    const a = btc.candles.find((c) => dayOf(c.t) >= curve[0].day);
    const b = btc.candles[btc.candles.length - 1];
    if (a) btcPct = (b.c / a.o - 1) * 100;
  }
  const wins = trades.filter((t) => t.netPct > 0).length;
  return {
    params,
    from: curve[0]?.day ?? start,
    to: curve[curve.length - 1]?.day ?? start,
    trades,
    stats: {
      trades: trades.length,
      winRate: trades.length ? (wins / trades.length) * 100 : 0,
      totalPct: (last - 1) * 100,
      weeklyPct: (Math.pow(last, 1 / weeks) - 1) * 100,
      positiveWeeksPct: weekly.length ? (weekly.filter((w) => w > 0).length / weekly.length) * 100 : 0,
      maxDrawdownPct: mdd,
      worstTradePct: trades.length ? Math.min(...trades.map((t) => t.netPct)) : 0,
      bestTradePct: trades.length ? Math.max(...trades.map((t) => t.netPct)) : 0,
      exposurePct: counted ? (invested / counted) * 100 : 0,
      btcPct,
    },
  };
}

/** Variantes para ver si el resultado depende de afinar (si solo funciona una, desconfiar). */
export const MULA_GRID: Partial<MulaParams>[] = [
  { tpPct: 3, slPct: 3 },
  { tpPct: 4, slPct: 4 },
  { tpPct: 5, slPct: 4 },
  { tpPct: 4, slPct: 6 },
  { tpPct: 6, slPct: 5, maxDays: 8 },
];
