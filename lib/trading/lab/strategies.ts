// lib/trading/lab/strategies.ts
// Laboratorio de estrategias para nuevos agentes. Puro: sin base de datos ni red.
// Cada estrategia decide, al cierre de un día, qué pesos quiere (o nada si no cambia). La cartera
// ejecuta a la apertura del día siguiente, con comisión y deslizamiento sobre lo que se mueve.
// Las reglas de cada estrategia se fijan ANTES de ver resultados (nada de afinar hasta que salga bonito).
import { sma } from "../indicators";
import type { Candle } from "../types";

const DAY = 86_400_000;
const dayOf = (t: number) => Math.floor(t / DAY) * DAY;

export type Coin = { symbol: string; candles: Candle[] };
type Weights = Record<string, number>;

/** Datos que ve una estrategia al cierre de un día (sin mirar el futuro). */
export type Ctx = {
  day: number;
  /** Días desde el inicio de la simulación. */
  step: number;
  coins: string[];
  /** Precio de cierre `back` días atrás (0 = hoy), o null si no hay. */
  close: (symbol: string, back?: number) => number | null;
  /** Máximo / mínimo de los últimos `n` días, sin contar hoy. */
  highest: (symbol: string, n: number) => number | null;
  lowest: (symbol: string, n: number) => number | null;
  /** Media simple de `n` días hasta hoy. */
  ma: (symbol: string, n: number) => number | null;
  /** Lo que tiene ahora la cartera (pesos al cierre). */
  holding: (symbol: string) => boolean;
};

export type Strategy = {
  key: string;
  name: string;
  idea: string;
  decide: (c: Ctx) => Weights | null;
};

export type LabStats = {
  totalPct: number;
  yearlyPct: number;
  weeklyPct: number;
  positiveWeeksPct: number;
  maxDrawdownPct: number;
  rebalances: number;
  turnover: number;
  exposurePct: number;
};

export type LabResult = { key: string; name: string; from: number; to: number; curve: { day: number; equity: number }[]; stats: LabStats; delisted: string[] };

type Prepared = { symbol: string; candles: Candle[]; byDay: Map<number, number>; closes: number[]; sma: Map<number, (number | null)[]> };

function prepare(coins: Coin[]): Prepared[] {
  return coins
    .filter((c) => c.candles.length > 30)
    .map((c) => ({ symbol: c.symbol, candles: c.candles, byDay: new Map(c.candles.map((k, i) => [dayOf(k.t), i])), closes: c.candles.map((k) => k.c), sma: new Map() }));
}

export function simulate(coins: Coin[], strategy: Strategy, opts: { from: number; to?: number; feePct?: number; slippagePct?: number }): LabResult {
  const data = prepare(coins);
  const bySym = new Map(data.map((d) => [d.symbol, d]));
  const days = [...new Set(data.flatMap((d) => d.candles.map((k) => dayOf(k.t))))].sort((a, b) => a - b).filter((d) => d >= dayOf(opts.from) && (opts.to === undefined || d <= opts.to));
  const cost = ((opts.feePct ?? 0.25) + (opts.slippagePct ?? 0.05)) / 100;

  const idx = (s: string, day: number) => bySym.get(s)?.byDay.get(day);
  let cash = 1;
  const units = new Map<string, number>();
  let pending: Weights | null = null;
  const curve: { day: number; equity: number }[] = [];
  let rebalances = 0;
  let turnover = 0;
  let invested = 0;
  const delisted = new Set<string>();

  days.forEach((day, step) => {
    // 1) Ejecutar a la apertura lo decidido ayer.
    if (pending) {
      const price = (s: string) => {
        const i = idx(s, day);
        return i === undefined ? null : bySym.get(s)!.candles[i].o;
      };
      let equity = cash;
      for (const [s, u] of units) equity += u * (price(s) ?? 0);
      const target = pending;
      const symbols = new Set([...units.keys(), ...Object.keys(target)]);
      let moved = 0;
      // Primero ventas (liberan efectivo), luego compras.
      for (const pass of ["sell", "buy"] as const)
        for (const s of symbols) {
          const p = price(s);
          if (p === null) continue;
          const want = ((target[s] ?? 0) * equity) / p;
          const have = units.get(s) ?? 0;
          const delta = want - have;
          if (Math.abs(delta * p) < equity * 0.005) continue; // diferencias mínimas: no se tocan
          if (pass === "sell" && delta < 0) {
            cash += -delta * p * (1 - cost);
            moved += -delta * p;
            units.set(s, want);
          } else if (pass === "buy" && delta > 0) {
            const spend = Math.min(cash, delta * p * (1 + cost));
            cash -= spend;
            moved += spend;
            units.set(s, have + spend / (p * (1 + cost)));
          }
        }
      for (const [s, u] of units) if (u <= 1e-12) units.delete(s);
      if (moved > 0) {
        rebalances++;
        turnover += moved / Math.max(equity, 1e-9);
      }
      pending = null;
    }

    // 2) Valor al cierre. Sin vela hoy: último cierre conocido. Si el par deja de cotizar (p. ej. Binance
    //    retira el par en euros), se vende a su último cierre tras 3 días sin datos.
    let equity = cash;
    let inMarket = 0;
    for (const [s, u] of [...units]) {
      const d = bySym.get(s)!;
      const i = lastIndexAtOrBefore(d.candles, day);
      if (i < 0) continue;
      const v = u * d.candles[i].c;
      if (!d.byDay.has(day) && day - dayOf(d.candles[i].t) > 3 * DAY) {
        cash += v * (1 - cost);
        units.delete(s);
        delisted.add(s);
        rebalances++;
        equity += v * (1 - cost);
        continue;
      }
      equity += v;
      inMarket += v;
    }
    if (inMarket > equity * 0.05) invested++;
    curve.push({ day, equity });

    // 3) Decisión al cierre.
    const ctx: Ctx = {
      day,
      step,
      coins: data.map((d) => d.symbol),
      close: (s, back = 0) => {
        const d = bySym.get(s);
        const i = d?.byDay.get(day);
        if (!d || i === undefined || i - back < 0) return null;
        return d.closes[i - back];
      },
      highest: (s, n) => {
        const d = bySym.get(s);
        const i = d?.byDay.get(day);
        if (!d || i === undefined || i - n < 0) return null;
        let m = -Infinity;
        for (let k = i - n; k < i; k++) m = Math.max(m, d.candles[k].h);
        return m;
      },
      lowest: (s, n) => {
        const d = bySym.get(s);
        const i = d?.byDay.get(day);
        if (!d || i === undefined || i - n < 0) return null;
        let m = Infinity;
        for (let k = i - n; k < i; k++) m = Math.min(m, d.candles[k].l);
        return m;
      },
      ma: (s, n) => {
        const d = bySym.get(s);
        const i = d?.byDay.get(day);
        if (!d || i === undefined) return null;
        if (!d.sma.has(n)) d.sma.set(n, sma(d.closes, n));
        return d.sma.get(n)![i] ?? null;
      },
      holding: (s) => (units.get(s) ?? 0) > 0,
    };
    const w = strategy.decide(ctx);
    if (w) {
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      pending = sum > 1 ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum])) : w;
    }
  });

  return {
    key: strategy.key,
    name: strategy.name,
    from: days[0] ?? opts.from,
    to: days[days.length - 1] ?? opts.from,
    curve,
    stats: statsOf(curve, rebalances, turnover, invested),
    delisted: [...delisted],
  };
}

/** Índice de la última vela del día `day` o anterior (-1 si no hay). */
function lastIndexAtOrBefore(c: Candle[], day: number) {
  let lo = 0;
  let hi = c.length - 1;
  let out = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dayOf(c[mid].t) <= day) {
      out = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return out;
}

export function statsOf(curve: { day: number; equity: number }[], rebalances = 0, turnover = 0, invested = 0): LabStats {
  let peak = 0;
  let mdd = 0;
  for (const p of curve) {
    peak = Math.max(peak, p.equity);
    mdd = Math.min(mdd, (p.equity / peak - 1) * 100);
  }
  const weekly: number[] = [];
  for (let k = 7; k < curve.length; k += 7) weekly.push(curve[k].equity / curve[k - 7].equity - 1);
  const first = curve[0]?.equity ?? 1;
  const last = curve[curve.length - 1]?.equity ?? 1;
  const n = Math.max(1, curve.length - 1);
  const g = last / first;
  return {
    totalPct: (g - 1) * 100,
    yearlyPct: (Math.pow(g, 365 / n) - 1) * 100,
    weeklyPct: (Math.pow(g, 7 / n) - 1) * 100,
    positiveWeeksPct: weekly.length ? (weekly.filter((w) => w > 0).length / weekly.length) * 100 : 0,
    maxDrawdownPct: mdd,
    rebalances,
    turnover,
    exposurePct: curve.length ? (invested / curve.length) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Estrategias candidatas (reglas fijadas de antemano)
// ---------------------------------------------------------------------------
const BTC = "BTC-EUR";
const btcUp = (c: Ctx) => {
  const p = c.close(BTC);
  const m = c.ma(BTC, 200);
  return p !== null && m !== null && p > m;
};
const sameSet = (c: Ctx, picks: string[]) => c.coins.every((s) => c.holding(s) === picks.includes(s));
const equal = (picks: string[]): Weights => Object.fromEntries(picks.map((s) => [s, 1 / picks.length]));

/** Las `n` monedas que más han subido en `lookback` días (solo si suben). */
function strongest(c: Ctx, n: number, lookback: number) {
  return c.coins
    .map((s) => {
      const now = c.close(s);
      const then = c.close(s, lookback);
      return { s, mom: now !== null && then ? now / then - 1 : null };
    })
    .filter((x): x is { s: string; mom: number } => x.mom !== null && x.mom > 0)
    .sort((a, b) => b.mom - a.mom)
    .slice(0, n)
    .map((x) => x.s);
}

/** Referencia: Bitcoin cuando está sobre su media de 200 días; efectivo si no. */
export const BTC_FILTER: Strategy = {
  key: "btc-200",
  name: "Bitcoin con filtro 200d",
  idea: "Solo Bitcoin, y solo mientras esté por encima de su media de 200 días.",
  decide: (c) => {
    const want = btcUp(c);
    if (want === c.holding(BTC) && c.step > 0) return null;
    return want ? { [BTC]: 1 } : {};
  },
};

/** MULA-T: rotación semanal hacia las más fuertes, solo con Bitcoin en tendencia. */
export function rotation(n: number, lookback: number): Strategy {
  return {
    key: `rot-${n}-${lookback}`,
    name: `MULA-T top ${n} · ${lookback}d`,
    idea: `Cada semana, las ${n} crypto que más han subido en ${lookback} días, a partes iguales; todo a efectivo si Bitcoin cae bajo su media de 200 días.`,
    decide: (c) => {
      if (!btcUp(c)) return c.coins.some((s) => c.holding(s)) ? {} : null;
      if (c.step % 7 !== 0 && c.coins.some((s) => c.holding(s))) return null;
      const picks = strongest(c, n, lookback);
      if (sameSet(c, picks)) return null;
      return equal(picks);
    },
  };
}

/** Rupturas (estilo «tortugas»): entra al superar el máximo de 20 días, sale al perder el mínimo de 10. */
export const BREAKOUT: Strategy = {
  key: "breakout-20-10",
  name: "Rupturas 20/10",
  idea: "Compra la moneda que supera su máximo de 20 días y la vende cuando pierde su mínimo de 10. Hasta 3 a la vez, solo con Bitcoin en tendencia.",
  decide: (c) => {
    const up = btcUp(c);
    const keep = c.coins.filter((s) => {
      if (!c.holding(s)) return false;
      const p = c.close(s);
      const low = c.lowest(s, 10);
      return p !== null && low !== null && p >= low && up;
    });
    const fresh = up
      ? c.coins.filter((s) => {
          if (c.holding(s)) return false;
          const p = c.close(s);
          const high = c.highest(s, 20);
          return p !== null && high !== null && p > high;
        })
      : [];
    const picks = [...keep, ...strongest(c, 12, 30).filter((s) => fresh.includes(s))].slice(0, 3);
    if (sameSet(c, picks)) return null;
    return equal(picks);
  },
};

/** Las candidatas que se comparan en el laboratorio. */
export const CANDIDATES: Strategy[] = [BTC_FILTER, rotation(1, 60), rotation(2, 60), rotation(3, 60), rotation(3, 30), rotation(3, 90), BREAKOUT];

/** Mantener Bitcoin sin más (la vara de medir). */
export const HOLD_BTC: Strategy = {
  key: "hold-btc",
  name: "Mantener Bitcoin",
  idea: "Comprar Bitcoin el primer día y no tocarlo.",
  decide: (c) => (c.step === 0 ? { [BTC]: 1 } : null),
};
