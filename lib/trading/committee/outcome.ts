// lib/trading/committee/outcome.ts
// Qué habría pasado siguiendo una propuesta del comité. Puro (se prueba sin base de datos).
import type { Candle } from "../types";

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const madridDayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

export type ProposalOutcome = {
  state: "pendiente" | "en curso" | "objetivo" | "stop" | "tiempo";
  entryDay: string | null;
  entryPrice: number | null;
  lastPrice: number | null;
  returnPct: number | null;
  r: number | null;
  benchmarkPct: number | null;
};

/** Qué habría pasado siguiendo la propuesta: entrada a la apertura siguiente, stop, objetivo y plazo. */
export function evaluateProposal(
  p: { action: string; price: number; stop: number | null; target: number | null; horizon_days: number; created_at: Date },
  candles: Candle[],
  bench: Candle[],
): ProposalOutcome {
  const empty: ProposalOutcome = { state: "pendiente", entryDay: null, entryPrice: null, lastPrice: null, returnPct: null, r: null, benchmarkPct: null };
  const startDay = Date.parse(madridDayOf(p.created_at));
  const k0 = candles.findIndex((c) => c.t > startDay);
  if (k0 < 0) return empty;
  const lastPrice = candles[candles.length - 1].c;
  const benchFrom = bench.find((c) => c.t >= candles[k0].t);
  const benchPct = (toT: number) => {
    const to = [...bench].reverse().find((c) => c.t <= toT);
    return benchFrom && to ? ((to.c - benchFrom.o) / benchFrom.o) * 100 : null;
  };
  if (p.action !== "comprar" || p.stop === null || p.target === null) {
    // Para vender o vigilar: cuánto se ha movido el precio desde entonces.
    const ret = ((lastPrice - candles[k0].o) / candles[k0].o) * 100;
    return { ...empty, state: "en curso", entryDay: isoDay(candles[k0].t), entryPrice: candles[k0].o, lastPrice, returnPct: ret, benchmarkPct: benchPct(candles[candles.length - 1].t) };
  }
  const entry = candles[k0].o;
  const risk = entry - p.stop;
  const limit = k0 + Math.round(p.horizon_days * 1.5);
  let exit: number | null = null;
  let state: ProposalOutcome["state"] = "en curso";
  let exitT = candles[candles.length - 1].t;
  if (entry <= p.stop || entry >= p.target) {
    // Hueco en la apertura: la orden no se habría ejecutado.
    return { ...empty, state: "pendiente" };
  }
  for (let i = k0; i < candles.length; i++) {
    const c = candles[i];
    if (c.l <= p.stop) {
      exit = Math.min(p.stop, c.o);
      state = "stop";
    } else if (c.h >= p.target) {
      exit = Math.max(p.target, i > k0 ? c.o : p.target);
      state = "objetivo";
    } else if (i >= limit) {
      exit = c.c;
      state = "tiempo";
    }
    if (exit !== null) {
      exitT = c.t;
      break;
    }
  }
  const px = exit ?? lastPrice;
  return {
    state,
    entryDay: isoDay(candles[k0].t),
    entryPrice: entry,
    lastPrice: px,
    returnPct: ((px - entry) / entry) * 100,
    r: risk > 0 ? (px - entry) / risk : null,
    benchmarkPct: benchPct(exitT),
  };
}

