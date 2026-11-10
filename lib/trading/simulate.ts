// lib/trading/simulate.ts
// Simulador histórico: «¿cómo me habría ido siguiendo la app desde hace X meses?».
// Recorre el pasado sesión a sesión con las mismas reglas que la cartera virtual:
// señal al cierre, orden a la apertura siguiente, stops/objetivos/break-even/tiempo, costes.
// Sin mirar el futuro: las figuras solo se conocen al confirmarse y el historial de cada
// figura (que pesa en la puntuación) solo incluye operaciones ya cerradas antes de cada día.
import type { Analysis } from "./backtest";
import { trendAt, type IndicatorBundle } from "./indicators";
import { cashDelta, fillAtOpen, marketValue, realizedPnl, stepPosition, type ExitReason } from "./paper";
import { rankRecommendations, recommendForInstrument, type AccountView, type Recommendation, type Regime } from "./recommend";
import { commission, type CostModel } from "./risk";
import type { Candle, Detection, Direction, PatternKey, PatternStats, TradeOutcome } from "./types";

export type SimSeries = {
  symbol: string;
  name: string;
  candles: Candle[];
  analysis: Analysis;
  /** Operaciones del backtest de este valor (para el historial de cada figura). */
  trades: TradeOutcome[];
  lotStep?: number;
  unit?: string;
};

export type SimSettings = {
  capital: number;
  riskPct: number;
  maxPositionPct: number;
  maxOpen: number;
  minScore: number;
  allowShort: boolean;
  breakeven: boolean;
  patterns: PatternKey[] | null;
  cost: CostModel;
};

export type SimTrade = {
  symbol: string;
  name: string;
  pattern: PatternKey;
  direction: Direction;
  score: number;
  quantity: number;
  entryDay: string;
  entryPrice: number;
  exitDay: string | null;
  exitPrice: number | null;
  reason: ExitReason | "abierta";
  stop: number;
  target: number;
  pnl: number;
  r: number;
  days: number;
  plan: string;
};

export type SimPoint = { day: string; equity: number; cash: number; invested: number; benchmark: number | null };

export type SimResult = {
  start: string;
  end: string;
  sessions: number;
  capital: number;
  finalEquity: number;
  returnPct: number;
  benchmarkPct: number | null;
  maxDrawdownPct: number;
  maxDrawdownDay: string | null;
  exposurePct: number;
  trades: number;
  openTrades: number;
  wins: number;
  winRate: number;
  avgR: number;
  profitFactor: number | null;
  bestTrade: SimTrade | null;
  worstTrade: SimTrade | null;
  avgDays: number;
  fees: number;
  curve: SimPoint[];
  list: SimTrade[];
  byPattern: { pattern: PatternKey; trades: number; wins: number; pnl: number; avgR: number }[];
  monthly: { month: string; returnPct: number; benchmarkPct: number | null }[];
};

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

type Pos = {
  s: number;
  direction: Direction;
  quantity: number;
  entryPrice: number;
  entryT: number;
  stop: number;
  initialStop: number;
  target: number;
  maxHoldUntil: number | null;
  fees: number;
  pattern: PatternKey;
  score: number;
  plan: string;
};
type Pending = Omit<Pos, "entryPrice" | "entryT" | "fees" | "maxHoldUntil" | "initialStop"> & {
  createdT: number;
  planned: number;
  maxHoldBars: number;
};

/** Acumulador del historial de cada figura con solo las operaciones ya cerradas. */
class RollingStats {
  private acc = new Map<PatternKey, { n: number; wins: number; sumR: number; gw: number; gl: number }>();
  add(t: TradeOutcome) {
    const a = this.acc.get(t.pattern) ?? { n: 0, wins: 0, sumR: 0, gw: 0, gl: 0 };
    a.n++;
    if (t.r > 0) {
      a.wins++;
      a.gw += t.r;
    } else a.gl -= t.r;
    a.sumR += t.r;
    this.acc.set(t.pattern, a);
  }
  snapshot(): Partial<Record<PatternKey, PatternStats>> {
    const out: Partial<Record<PatternKey, PatternStats>> = {};
    for (const [k, a] of this.acc) {
      const avgR = a.sumR / a.n;
      out[k] = {
        pattern: k,
        trades: a.n,
        wins: a.wins,
        winRate: a.wins / a.n,
        avgR,
        adjustedExpectancy: avgR * (a.n / (a.n + 15)),
        profitFactor: a.gl > 0 ? a.gw / a.gl : null,
        avgBars: 0,
        avgPct: 0,
        maxDrawdownR: 0,
        bestR: 0,
        worstR: 0,
      };
    }
    return out;
  }
}

export function simulatePortfolio(input: {
  series: SimSeries[];
  index: { candles: Candle[]; ind: IndicatorBundle } | null;
  startT: number;
  settings: SimSettings;
}): SimResult {
  const { series, index, settings: cfg } = input;
  const cost = cfg.cost;
  const filter = cfg.patterns && cfg.patterns.length ? new Set(cfg.patterns) : null;

  // Calendario: todas las sesiones con datos desde el inicio.
  const days = new Set<number>();
  for (const s of series) for (const c of s.candles) if (c.t >= input.startT) days.add(c.t);
  const calendar = [...days].sort((a, b) => a - b);
  const pos = series.map((s) => new Map(s.candles.map((c, i) => [c.t, i])));
  const idxPos = index ? new Map(index.candles.map((c, i) => [c.t, i])) : null;

  // Señales confirmadas por vela.
  const byConfirm = series.map((s) => {
    const m = new Map<number, Detection[]>();
    for (const d of s.analysis.detections) {
      if (d.status !== "confirmed" || d.confirmIndex === null) continue;
      if (filter && !filter.has(d.pattern)) continue;
      const list = m.get(d.confirmIndex) ?? [];
      list.push(d);
      m.set(d.confirmIndex, list);
    }
    return m;
  });

  // Historial de figuras: operaciones del backtest ordenadas por la fecha en que se cerraron.
  const history = series
    .flatMap((s) => s.trades.filter((t) => t.reason !== "open").map((t) => ({ t, exitT: s.candles[t.exitIndex].t })))
    .sort((a, b) => a.exitT - b.exitT);
  const stats = new RollingStats();
  let hp = 0;

  let cash = cfg.capital;
  let open: Pos[] = [];
  let pending: Pending[] = [];
  const lastClose = series.map(() => NaN);
  const list: SimTrade[] = [];
  const curve: SimPoint[] = [];
  const used = new Set<string>();
  let fees = 0;
  const benchBase = idxPos && calendar.length ? baseClose(index!.candles, idxPos, calendar[0]) : null;

  const closeTrade = (p: Pos, price: number, t: number, reason: ExitReason) => {
    const fee = commission(price * p.quantity, cost);
    cash += cashDelta(p.direction, "close", p.quantity, price, fee);
    fees += fee;
    const total = p.fees + fee;
    const pnl = realizedPnl(p.direction, p.quantity, p.entryPrice, price) - total;
    const risk = Math.abs(p.entryPrice - p.initialStop) * p.quantity;
    list.push({
      symbol: series[p.s].symbol,
      name: series[p.s].name,
      pattern: p.pattern,
      direction: p.direction,
      score: p.score,
      quantity: p.quantity,
      entryDay: isoDay(p.entryT),
      entryPrice: p.entryPrice,
      exitDay: isoDay(t),
      exitPrice: price,
      reason,
      stop: p.initialStop,
      target: p.target,
      pnl,
      r: risk > 0 ? pnl / risk : 0,
      days: Math.round((t - p.entryT) / 86_400_000),
      plan: p.plan,
    });
  };

  for (const t of calendar) {
    while (hp < history.length && history[hp].exitT < t) stats.add(history[hp++].t);
    series.forEach((s, k) => {
      const i = pos[k].get(t);
      if (i !== undefined) lastClose[k] = s.candles[i].c;
    });

    // 1) Órdenes pendientes: se ejecutan en la apertura (caducan si el valor no cotiza en 3 sesiones).
    const stillPending: Pending[] = [];
    for (const o of pending) {
      const i = pos[o.s].get(t);
      if (i === undefined) {
        if (t - o.createdT < 5 * 86_400_000) stillPending.push(o);
        continue;
      }
      const bar = series[o.s].candles[i];
      const f = fillAtOpen(o, bar, cost);
      if (f.kind === "cancelled") continue;
      if (o.direction === "long" && f.price * o.quantity + f.commission > cash) continue;
      cash += cashDelta(o.direction, "open", o.quantity, f.price, f.commission);
      fees += f.commission;
      const holdIdx = i + o.maxHoldBars;
      open.push({
        s: o.s,
        direction: o.direction,
        quantity: o.quantity,
        entryPrice: f.price,
        entryT: t,
        stop: o.stop,
        initialStop: o.stop,
        target: o.target,
        maxHoldUntil: holdIdx < series[o.s].candles.length ? series[o.s].candles[holdIdx].t : null,
        fees: f.commission,
        pattern: o.pattern,
        score: o.score,
        plan: o.plan,
      });
    }
    pending = stillPending;

    // 2) Posiciones abiertas con la vela del día.
    const keep: Pos[] = [];
    for (const p of open) {
      const i = pos[p.s].get(t);
      if (i === undefined) {
        keep.push(p);
        continue;
      }
      const r = stepPosition(
        { direction: p.direction, quantity: p.quantity, entryPrice: p.entryPrice, stop: p.stop, initialStop: p.initialStop, target: p.target, maxHoldUntil: p.maxHoldUntil, breakeven: cfg.breakeven },
        series[p.s].candles[i],
        cost,
      );
      if (r.kind === "exit") closeTrade(p, r.price, t, r.reason);
      else {
        p.stop = r.stop;
        keep.push(p);
      }
    }
    open = keep;

    // 3) Patrimonio al cierre.
    let mv = 0;
    let invested = 0;
    for (const p of open) {
      const px = Number.isFinite(lastClose[p.s]) ? lastClose[p.s] : p.entryPrice;
      mv += marketValue(p.direction, p.quantity, px);
      invested += p.quantity * px;
    }
    const equity = cash + mv;
    const ic = idxPos ? idxPos.get(t) : undefined;
    curve.push({
      day: isoDay(t),
      equity,
      cash,
      invested,
      benchmark: benchBase && ic !== undefined ? (cfg.capital * index!.candles[ic].c) / benchBase : curve.length ? curve[curve.length - 1].benchmark : null,
    });

    // 4) Señales al cierre → órdenes para mañana.
    if (open.length + pending.length >= cfg.maxOpen) continue;
    let regime: Regime = "lateral";
    if (index && ic !== undefined && ic >= 60) {
      const tr = trendAt(index.ind, index.candles, ic);
      regime = tr === "up" ? "alcista" : tr === "down" ? "bajista" : "lateral";
    }
    const holdings: Record<string, Direction> = {};
    for (const p of open) holdings[series[p.s].symbol] = p.direction;
    for (const o of pending) holdings[series[o.s].symbol] = o.direction;
    const reserved = pending.reduce((acc, o) => acc + o.planned * o.quantity, 0);
    const view: AccountView = {
      equity,
      cash: Math.max(0, cash - reserved),
      riskPct: cfg.riskPct,
      maxPositionPct: cfg.maxPositionPct,
      allowShort: cfg.allowShort,
      minScore: cfg.minScore,
      cost,
      holdings,
    };
    const snap = stats.snapshot();
    const recs: { r: Recommendation; k: number }[] = [];
    for (let k = 0; k < series.length; k++) {
      const i = pos[k].get(t);
      if (i === undefined) continue;
      const dets = byConfirm[k].get(i);
      if (!dets) continue;
      const s = series[k];
      for (const r of recommendForInstrument(
        { symbol: s.symbol, name: s.name, candles: s.candles, ind: s.analysis.ind, detections: dets, lotStep: s.lotStep, unit: s.unit },
        snap,
        regime,
        view,
        i,
      ))
        recs.push({ r, k });
    }
    const order = rankRecommendations(recs.map((x) => x.r));
    for (const r of order) {
      if (open.length + pending.length >= cfg.maxOpen) break;
      if (!r.strong || !(r.action === "comprar" || r.action === "vender_corto")) continue;
      if (holdings[r.symbol] || used.has(r.key) || !r.sizing || r.sizing.quantity <= 0) continue;
      if (r.sizing.notional + commission(r.sizing.notional, cost) > view.cash) continue;
      const k = recs.find((x) => x.r === r)!.k;
      used.add(r.key);
      holdings[r.symbol] = r.direction;
      view.cash -= r.sizing.notional;
      pending.push({
        s: k,
        direction: r.direction,
        quantity: r.sizing.quantity,
        stop: r.stop,
        target: r.target,
        pattern: r.pattern,
        score: r.score,
        plan: r.plan,
        createdT: t,
        planned: r.entry,
        maxHoldBars: r.maxHoldDays,
      });
    }
  }

  // Posiciones que siguen abiertas al final: se valoran al último cierre.
  const endT = calendar[calendar.length - 1] ?? input.startT;
  for (const p of open) {
    const px = Number.isFinite(lastClose[p.s]) ? lastClose[p.s] : p.entryPrice;
    const pnl = realizedPnl(p.direction, p.quantity, p.entryPrice, px) - p.fees;
    const risk = Math.abs(p.entryPrice - p.initialStop) * p.quantity;
    list.push({
      symbol: series[p.s].symbol,
      name: series[p.s].name,
      pattern: p.pattern,
      direction: p.direction,
      score: p.score,
      quantity: p.quantity,
      entryDay: isoDay(p.entryT),
      entryPrice: p.entryPrice,
      exitDay: null,
      exitPrice: px,
      reason: "abierta",
      stop: p.initialStop,
      target: p.target,
      pnl,
      r: risk > 0 ? pnl / risk : 0,
      days: Math.round((endT - p.entryT) / 86_400_000),
      plan: p.plan,
    });
  }

  return summarizeSim(cfg.capital, curve, list, fees, input.startT, endT);
}

function baseClose(c: Candle[], map: Map<number, number>, t: number) {
  const i = map.get(t);
  if (i !== undefined) return c[i].c;
  // Primer cierre del índice no posterior al inicio.
  let best: number | null = null;
  for (const x of c) if (x.t <= t) best = x.c;
  return best ?? c[0]?.c ?? null;
}

export function summarizeSim(capital: number, curve: SimPoint[], list: SimTrade[], fees: number, startT: number, endT: number): SimResult {
  const closed = list.filter((t) => t.reason !== "abierta");
  const wins = closed.filter((t) => t.pnl > 0);
  const gw = wins.reduce((s, t) => s + t.pnl, 0);
  const gl = -closed.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);
  const finalEquity = curve.length ? curve[curve.length - 1].equity : capital;

  let peak = capital;
  let dd = 0;
  let ddDay: string | null = null;
  for (const p of curve) {
    peak = Math.max(peak, p.equity);
    const d = (peak - p.equity) / peak;
    if (d > dd) {
      dd = d;
      ddDay = p.day;
    }
  }
  const lastBench = curve.length ? curve[curve.length - 1].benchmark : null;

  const byPatternMap = new Map<PatternKey, { pattern: PatternKey; trades: number; wins: number; pnl: number; sumR: number }>();
  for (const t of closed) {
    const a = byPatternMap.get(t.pattern) ?? { pattern: t.pattern, trades: 0, wins: 0, pnl: 0, sumR: 0 };
    a.trades++;
    if (t.pnl > 0) a.wins++;
    a.pnl += t.pnl;
    a.sumR += t.r;
    byPatternMap.set(t.pattern, a);
  }

  const monthly: SimResult["monthly"] = [];
  let prevEq = capital;
  let prevB: number | null = curve[0]?.benchmark ?? null;
  let k = 0;
  while (k < curve.length) {
    const month = curve[k].day.slice(0, 7);
    let j = k;
    while (j + 1 < curve.length && curve[j + 1].day.slice(0, 7) === month) j++;
    const eq = curve[j].equity;
    const b = curve[j].benchmark;
    monthly.push({
      month,
      returnPct: ((eq - prevEq) / prevEq) * 100,
      benchmarkPct: b !== null && prevB ? ((b - prevB) / prevB) * 100 : null,
    });
    prevEq = eq;
    prevB = b;
    k = j + 1;
  }

  const sorted = [...closed].sort((a, b) => b.pnl - a.pnl);
  return {
    start: isoDay(startT),
    end: isoDay(endT),
    sessions: curve.length,
    capital,
    finalEquity,
    returnPct: ((finalEquity - capital) / capital) * 100,
    benchmarkPct: lastBench !== null ? ((lastBench - capital) / capital) * 100 : null,
    maxDrawdownPct: dd * 100,
    maxDrawdownDay: ddDay,
    exposurePct: curve.length ? (curve.reduce((s, p) => s + (p.equity > 0 ? p.invested / p.equity : 0), 0) / curve.length) * 100 : 0,
    trades: closed.length,
    openTrades: list.length - closed.length,
    wins: wins.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    avgR: closed.length ? closed.reduce((s, t) => s + t.r, 0) / closed.length : 0,
    profitFactor: gl > 0 ? gw / gl : null,
    bestTrade: sorted[0] ?? null,
    worstTrade: sorted[sorted.length - 1] ?? null,
    avgDays: closed.length ? closed.reduce((s, t) => s + t.days, 0) / closed.length : 0,
    fees,
    curve,
    list: [...list].sort((a, b) => b.entryDay.localeCompare(a.entryDay)),
    byPattern: [...byPatternMap.values()]
      .map((a) => ({ pattern: a.pattern, trades: a.trades, wins: a.wins, pnl: a.pnl, avgR: a.sumR / a.trades }))
      .sort((a, b) => b.pnl - a.pnl),
    monthly,
  };
}
