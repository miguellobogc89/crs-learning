// lib/trading/strategy.ts
// Estrategia de tendencia («momentum»): cada cierto tiempo se queda con los activos que más
// han subido en los últimos meses y que están por encima de su media de 200 sesiones, y se
// sale de todo cuando el mercado (IBEX o Bitcoin) pierde la suya. Es de los pocos efectos que
// la investigación financiera ha documentado durante décadas.
//
// Validación honesta: los parámetros se eligen SOLO con los datos anteriores a la fecha de
// inicio de la simulación (`chooseTrendParams`), y luego se aplican al periodo simulado.
import { atr, atrAt, sma } from "./indicators";
import { commission, roundQty, slipped, type CostModel } from "./risk";
import { summarizeSim, type SimPoint, type SimResult, type SimTrade } from "./simulate";
import type { Candle } from "./types";

export type RiskProfile = "prudente" | "equilibrado" | "agresivo";

export const PROFILES: Record<RiskProfile, { label: string; exposure: number; patternRiskPct: number; patternMaxOpen: number; patternMaxPositionPct: number; description: string }> = {
  prudente: {
    label: "Prudente",
    exposure: 0.5,
    patternRiskPct: 0.5,
    patternMaxOpen: 5,
    patternMaxPositionPct: 15,
    description: "Como mucho la mitad del dinero invertido. Se gana menos, pero las caídas duelen mucho menos.",
  },
  equilibrado: {
    label: "Equilibrado",
    exposure: 0.8,
    patternRiskPct: 1,
    patternMaxOpen: 8,
    patternMaxPositionPct: 20,
    description: "Hasta el 80 % invertido. El punto medio entre ganar y dormir tranquilo.",
  },
  agresivo: {
    label: "Agresivo",
    exposure: 1,
    patternRiskPct: 2,
    patternMaxOpen: 12,
    patternMaxPositionPct: 30,
    description: "Todo el dinero trabajando. Más rentabilidad posible, pero también caídas más fuertes.",
  },
};

export type TrendParams = {
  /** Sesiones para medir la fuerza (subida acumulada). */
  lookback: number;
  /** Cuántos activos se tienen a la vez. */
  topN: number;
  /** Cada cuántas sesiones se revisa la cartera. */
  rebalance: number;
  /** Parte del patrimonio invertida (según el perfil). */
  exposure: number;
  /** Stop de protección: múltiplos de ATR por debajo de la entrada. */
  stopAtr: number;
};

export type TrendSeries = { symbol: string; name: string; candles: Candle[]; lotStep: number };

type Prepared = TrendSeries & { pos: Map<number, number>; sma200: (number | null)[]; atr14: (number | null)[] };

export function prepareTrend(series: TrendSeries[]): Prepared[] {
  return series.map((s) => {
    const closes = s.candles.map((c) => c.c);
    return { ...s, pos: new Map(s.candles.map((c, i) => [c.t, i])), sma200: sma(closes, 200), atr14: atr(s.candles, 14) };
  });
}

type Holding = { k: number; quantity: number; entryPrice: number; entryT: number; stop: number; fees: number; mom: number };
type Order = { k: number; side: "buy" | "sell"; quantity: number; reason?: "rotación" | "mercado bajista"; mom?: number; stopDist?: number };

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export function simulateTrend(input: {
  series: Prepared[];
  bench: { candles: Candle[] } | null;
  startT: number;
  endT?: number;
  capital: number;
  params: TrendParams;
  cost: CostModel;
}): SimResult {
  const { series, params: P, cost } = input;
  const endT = input.endT ?? Infinity;
  const days = new Set<number>();
  for (const s of series) for (const c of s.candles) if (c.t >= input.startT && c.t <= endT) days.add(c.t);
  const calendar = [...days].sort((a, b) => a - b);

  const bench = input.bench?.candles ?? null;
  const bPos = bench ? new Map(bench.map((c, i) => [c.t, i])) : null;
  const bSma = bench ? sma(bench.map((c) => c.c), 200) : null;
  let benchBase: number | null = null;

  let cash = input.capital;
  let fees = 0;
  const holds = new Map<number, Holding>();
  let orders: Order[] = [];
  const last = series.map(() => NaN);
  const curve: SimPoint[] = [];
  const list: SimTrade[] = [];
  let sinceRebalance = Infinity;

  const close = (h: Holding, price: number, t: number, reason: SimTrade["reason"]) => {
    const fill = slipped(price, "sell", cost);
    const fee = commission(fill * h.quantity, cost);
    cash += fill * h.quantity - fee;
    fees += fee;
    const pnl = (fill - h.entryPrice) * h.quantity - h.fees - fee;
    const risk = (h.entryPrice - h.stop) * h.quantity;
    const s = series[h.k];
    list.push({
      symbol: s.symbol,
      name: s.name,
      pattern: "tendencia",
      direction: "long",
      score: Math.round(h.mom * 100),
      quantity: h.quantity,
      entryDay: isoDay(h.entryT),
      entryPrice: h.entryPrice,
      exitDay: isoDay(t),
      exitPrice: fill,
      reason,
      stop: h.stop,
      target: 0,
      pnl,
      r: risk > 0 ? pnl / risk : 0,
      days: Math.round((t - h.entryT) / 86_400_000),
      plan: `Entró por estar entre los ${P.topN} con más fuerza (${h.mom >= 0 ? "+" : ""}${(h.mom * 100).toFixed(0)} % en ${P.lookback} sesiones) y por encima de su media de 200 sesiones.`,
    });
    holds.delete(h.k);
  };

  for (const t of calendar) {
    series.forEach((s, k) => {
      const i = s.pos.get(t);
      if (i !== undefined) last[k] = s.candles[i].c;
    });

    // 1) Órdenes decididas al cierre anterior, a la apertura: primero ventas, luego compras.
    const pendingNext: Order[] = [];
    for (const o of orders.sort((a, b) => (a.side === "sell" ? -1 : 1) - (b.side === "sell" ? -1 : 1))) {
      const s = series[o.k];
      const i = s.pos.get(t);
      if (i === undefined) {
        pendingNext.push(o);
        continue;
      }
      const bar = s.candles[i];
      if (o.side === "sell") {
        const h = holds.get(o.k);
        if (h) close(h, bar.o, t, o.reason ?? "rotación");
        continue;
      }
      if (holds.has(o.k)) continue;
      const fill = slipped(bar.o, "buy", cost);
      let q = o.quantity;
      const fee0 = commission(fill * q, cost);
      if (fill * q + fee0 > cash) q = roundQty(Math.floor(((cash - fee0) / fill) / s.lotStep) * s.lotStep, s.lotStep);
      if (!(q > 0)) continue;
      const fee = commission(fill * q, cost);
      cash -= fill * q + fee;
      fees += fee;
      holds.set(o.k, { k: o.k, quantity: q, entryPrice: fill, entryT: t, stop: fill - (o.stopDist ?? fill * 0.15), fees: fee, mom: o.mom ?? 0 });
    }
    orders = pendingNext;

    // 2) Stop de protección durante la sesión.
    for (const h of [...holds.values()]) {
      const i = series[h.k].pos.get(t);
      if (i === undefined) continue;
      const bar = series[h.k].candles[i];
      if (bar.l <= h.stop) close(h, Math.min(h.stop, bar.o), t, "stop");
    }

    // 3) Patrimonio al cierre.
    let mv = 0;
    for (const h of holds.values()) mv += h.quantity * (Number.isFinite(last[h.k]) ? last[h.k] : h.entryPrice);
    const equity = cash + mv;
    const bi = bPos?.get(t);
    if (bench && bi !== undefined && benchBase === null) benchBase = bench[bi].o;
    curve.push({
      day: isoDay(t),
      equity,
      cash,
      invested: mv,
      benchmark: bench && bi !== undefined && benchBase ? (input.capital * bench[bi].c) / benchBase : curve.length ? curve[curve.length - 1].benchmark : null,
    });

    // 4) Revisión de la cartera al cierre.
    sinceRebalance++;
    const marketOk = bench && bi !== undefined && bSma ? (bSma[bi] === null ? true : bench[bi].c > bSma[bi]!) : true;
    if (!marketOk && holds.size) {
      for (const h of holds.values()) orders.push({ k: h.k, side: "sell", quantity: h.quantity, reason: "mercado bajista" });
      sinceRebalance = 0;
      continue;
    }
    if (sinceRebalance < P.rebalance || !marketOk) continue;
    sinceRebalance = 0;
    const ranked: { k: number; mom: number; stopDist: number; price: number }[] = [];
    series.forEach((s, k) => {
      const i = s.pos.get(t);
      if (i === undefined || i < P.lookback) return;
      const c = s.candles[i].c;
      const m = s.sma200[i];
      if (m === null || c <= m) return;
      const mom = c / s.candles[i - P.lookback].c - 1;
      if (mom <= 0) return;
      ranked.push({ k, mom, stopDist: P.stopAtr * atrAt(s.atr14, s.candles, i), price: c });
    });
    ranked.sort((a, b) => b.mom - a.mom);
    const target = ranked.slice(0, P.topN);
    const keep = new Set(target.map((x) => x.k));
    for (const h of holds.values()) if (!keep.has(h.k)) orders.push({ k: h.k, side: "sell", quantity: h.quantity, reason: "rotación" });
    const slot = (equity * P.exposure) / P.topN;
    for (const x of target) {
      if (holds.has(x.k)) continue;
      const step = series[x.k].lotStep;
      const q = roundQty(Math.floor(slot / x.price / step) * step, step);
      if (q > 0) orders.push({ k: x.k, side: "buy", quantity: q, mom: x.mom, stopDist: x.stopDist });
    }
  }

  // Lo que sigue en cartera al final, valorado al último cierre.
  const endDay = calendar[calendar.length - 1] ?? input.startT;
  for (const h of holds.values()) {
    const px = Number.isFinite(last[h.k]) ? last[h.k] : h.entryPrice;
    const s = series[h.k];
    list.push({
      symbol: s.symbol,
      name: s.name,
      pattern: "tendencia",
      direction: "long",
      score: Math.round(h.mom * 100),
      quantity: h.quantity,
      entryDay: isoDay(h.entryT),
      entryPrice: h.entryPrice,
      exitDay: null,
      exitPrice: px,
      reason: "abierta",
      stop: h.stop,
      target: 0,
      pnl: (px - h.entryPrice) * h.quantity - h.fees,
      r: h.entryPrice > h.stop ? ((px - h.entryPrice) * h.quantity - h.fees) / ((h.entryPrice - h.stop) * h.quantity) : 0,
      days: Math.round((endDay - h.entryT) / 86_400_000),
      plan: `Entró por estar entre los ${P.topN} con más fuerza (+${(h.mom * 100).toFixed(0)} % en ${P.lookback} sesiones) y por encima de su media de 200 sesiones.`,
    });
  }
  return summarizeSim(input.capital, curve, list, fees, input.startT, endDay);
}

/** Combinaciones que se prueban. En crypto todo va más rápido: ventanas y revisiones más cortas. */
export function trendGrid(market: "bolsa" | "crypto", exposure: number): TrendParams[] {
  const lookbacks = market === "crypto" ? [30, 60, 90] : [63, 126, 189];
  const tops = market === "crypto" ? [2, 3, 4] : [3, 5, 7];
  const rebalance = market === "crypto" ? 7 : 21;
  const stopAtr = market === "crypto" ? 4 : 3;
  return lookbacks.flatMap((lookback) => tops.map((topN) => ({ lookback, topN, rebalance, exposure, stopAtr })));
}

/**
 * Elige los parámetros con los años ANTERIORES al inicio de la simulación: el que mejor
 * equilibra rentabilidad y caída máxima. Si no hay historia suficiente, unos por defecto.
 */
export function chooseTrendParams(input: {
  series: Prepared[];
  bench: { candles: Candle[] } | null;
  market: "bolsa" | "crypto";
  exposure: number;
  startT: number;
  trainYears?: number;
  cost: CostModel;
}) {
  const grid = trendGrid(input.market, input.exposure);
  const fallback = grid[Math.floor(grid.length / 2)];
  const trainStart = input.startT - (input.trainYears ?? 3) * 365 * 86_400_000;
  const earliest = Math.min(...input.series.map((s) => s.candles[0]?.t ?? Infinity));
  // Hacen falta al menos ~200 sesiones de calentamiento y un año de entrenamiento.
  if (!Number.isFinite(earliest) || input.startT - earliest < 1.8 * 365 * 86_400_000) return { params: fallback, trained: false, trainFrom: null as string | null };
  const from = Math.max(trainStart, earliest + 300 * 86_400_000);
  let best = fallback;
  let bestScore = -Infinity;
  for (const p of grid) {
    const r = simulateTrend({ series: input.series, bench: input.bench, startT: from, endT: input.startT - 1, capital: 10_000, params: p, cost: input.cost });
    const score = r.returnPct / Math.max(8, r.maxDrawdownPct);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return { params: best, trained: true, trainFrom: isoDay(from) };
}

/** Ranking de hoy: los activos que la estrategia tendría en cartera ahora mismo. */
export function trendPicks(series: Prepared[], bench: { candles: Candle[] } | null, params: Pick<TrendParams, "lookback" | "topN">) {
  let marketOk = true;
  if (bench && bench.candles.length) {
    const s = sma(bench.candles.map((c) => c.c), 200);
    const i = bench.candles.length - 1;
    marketOk = s[i] === null || bench.candles[i].c > s[i]!;
  }
  const ranked = series
    .map((s) => {
      const i = s.candles.length - 1;
      if (i < params.lookback) return null;
      const c = s.candles[i].c;
      const m = s.sma200[i];
      const mom = c / s.candles[i - params.lookback].c - 1;
      return { symbol: s.symbol, name: s.name, price: c, momPct: mom * 100, aboveSma200: m !== null && c > m, distSma200: m ? (c / m - 1) * 100 : null };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.momPct - a.momPct);
  const picks = ranked.filter((r) => r.aboveSma200 && r.momPct > 0).slice(0, params.topN);
  return { marketOk, picks, ranked };
}
