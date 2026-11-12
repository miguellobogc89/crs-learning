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
  /** Si está corto (apostando a la baja) en ese valor. */
  short?: (symbol: string) => boolean;
  /** Volumen medio diario en euros de los `n` días anteriores (sin contar hoy). */
  volumeEur?: (symbol: string, n: number) => number | null;
  /** Días de historia que tiene la moneda hasta hoy (incluido). */
  age?: (symbol: string) => number;
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

export type LabResult = { key: string; name: string; from: number; to: number; curve: { day: number; equity: number }[]; stats: LabStats; delisted: string[]; lastWeights: Record<string, number> };

type Prepared = { symbol: string; candles: Candle[]; byDay: Map<number, number>; closes: number[]; sma: Map<number, (number | null)[]> };

function prepare(coins: Coin[]): Prepared[] {
  return coins
    .filter((c) => c.candles.length > 30)
    .map((c) => ({ symbol: c.symbol, candles: c.candles, byDay: new Map(c.candles.map((k, i) => [dayOf(k.t), i])), closes: c.candles.map((k) => k.c), sma: new Map() }));
}

export function simulate(
  coins: Coin[],
  strategy: Strategy,
  opts: { from: number; to?: number; feePct?: number; slippagePct?: number; /** Coste diario de estar corto, en % (financiación de futuros). */ shortFundingPct?: number },
): LabResult {
  const data = prepare(coins);
  const bySym = new Map(data.map((d) => [d.symbol, d]));
  const days = [...new Set(data.flatMap((d) => d.candles.map((k) => dayOf(k.t))))].sort((a, b) => a - b).filter((d) => d >= dayOf(opts.from) && (opts.to === undefined || d <= opts.to));
  const cost = ((opts.feePct ?? 0.25) + (opts.slippagePct ?? 0.05)) / 100;
  const funding = (opts.shortFundingPct ?? 0.03) / 100;
  let busted = false;

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
      for (const [s, u] of units) if (Math.abs(u) <= 1e-12) units.delete(s);
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
      // Corto: cada día se paga la financiación sobre lo que se debe.
      if (u < 0) cash -= -v * funding;
      equity += v;
      inMarket += Math.abs(v);
    }
    // Sin apalancamiento: si el corto se come todo el patrimonio, se cierra todo (quiebra).
    if (equity <= 0.01 && !busted) {
      busted = true;
      units.clear();
      cash = Math.max(0, equity);
      equity = cash;
    }
    if (inMarket > Math.max(equity, 0) * 0.05) invested++;
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
      short: (s) => (units.get(s) ?? 0) < 0,
      volumeEur: (s, n) => volumeAt(bySym.get(s), day, n),
      age: (s) => {
        const d = bySym.get(s);
        const i = d?.byDay.get(day);
        return d && i !== undefined ? i + 1 : 0;
      },
    };
    const w = busted ? null : strategy.decide(ctx);
    if (w) {
      const sum = Object.values(w).reduce((a, b) => a + Math.abs(b), 0);
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
    lastWeights: Object.fromEntries([...units.keys()].map((k) => [k, 1])),
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

/**
 * Contexto de un día para usar una estrategia en directo (un agente real): mismas reglas que en la
 * simulación. `day` es el último día cerrado; `holding` dice qué tiene hoy la cartera.
 */
export function contextAt(coins: Coin[], day: number, step: number, holding: (s: string) => boolean, short: (s: string) => boolean = () => false): Ctx {
  const data = prepare(coins);
  const bySym = new Map(data.map((d) => [d.symbol, d]));
  const at = (s: string) => {
    const d = bySym.get(s);
    const i = d?.byDay.get(dayOf(day));
    return d && i !== undefined ? { d, i } : null;
  };
  return {
    day: dayOf(day),
    step,
    coins: data.map((d) => d.symbol),
    close: (s, back = 0) => {
      const x = at(s);
      return x && x.i - back >= 0 ? x.d.closes[x.i - back] : null;
    },
    highest: (s, n) => {
      const x = at(s);
      if (!x || x.i - n < 0) return null;
      let m = -Infinity;
      for (let k = x.i - n; k < x.i; k++) m = Math.max(m, x.d.candles[k].h);
      return m;
    },
    lowest: (s, n) => {
      const x = at(s);
      if (!x || x.i - n < 0) return null;
      let m = Infinity;
      for (let k = x.i - n; k < x.i; k++) m = Math.min(m, x.d.candles[k].l);
      return m;
    },
    ma: (s, n) => {
      const x = at(s);
      if (!x) return null;
      if (!x.d.sma.has(n)) x.d.sma.set(n, sma(x.d.closes, n));
      return x.d.sma.get(n)![x.i] ?? null;
    },
    holding,
    short,
    volumeEur: (s, n) => volumeAt(bySym.get(s), day, n),
    age: (s) => {
      const x = at(s);
      return x ? x.i + 1 : 0;
    },
  };
}

function volumeAt(d: Prepared | undefined, day: number, n: number) {
  const i = d?.byDay.get(dayOf(day));
  if (!d || i === undefined || i - n < 0) return null;
  let sum = 0;
  for (let k = i - n; k < i; k++) sum += d.candles[k].v * d.candles[k].c;
  return sum / n;
}

/**
 * Universo «de cada momento»: la estrategia solo ve las `top` monedas con más volumen en euros en los
 * 30 días anteriores (y con al menos `minAge` días cotizando), más las que ya tenga. Así no sabe qué
 * monedas serán famosas en el futuro (evita el sesgo de supervivencia de usar la lista de hoy).
 */
export function withUniverse(inner: Strategy, top: number, minAge = 60): Strategy {
  return {
    key: `${inner.key}-u${top}`,
    name: `${inner.name} · top ${top} de cada momento`,
    idea: `${inner.idea} Solo entre las ${top} monedas con más volumen en euros del último mes (y con ${minAge} días cotizando).`,
    decide: (c) => {
      const ranked = c.coins
        .filter((s) => (c.age?.(s) ?? 0) >= minAge)
        .map((s) => ({ s, v: c.volumeEur?.(s, 30) ?? 0 }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, top)
        .map((x) => x.s);
      const keep = c.coins.filter((s) => c.holding(s) || c.short?.(s));
      const coins = [...new Set([...ranked, ...keep])];
      return inner.decide({ ...c, coins });
    },
  };
}

/** Por qué el detector B está en ataque o en defensa, en frases sencillas. */
export function explainDetectorB(c: Ctx) {
  const p = c.close(BTC);
  const m200 = c.ma(BTC, 200);
  const m50 = c.ma(BTC, 50);
  const p10 = c.close(BTC, 10);
  const checks = [
    { ok: p !== null && m200 !== null && p > m200, text: "Bitcoin está por encima de su media de 200 días (tendencia de fondo)" },
    { ok: p !== null && m50 !== null && p > m50, text: "Bitcoin está por encima de su media de 50 días (tendencia de las últimas semanas)" },
    { ok: p !== null && p10 !== null && p > p10, text: "Bitcoin vale más que hace 10 días (impulso reciente)" },
  ];
  return { attack: checks.every((x) => x.ok), checks, btc: p, ma200: m200, ma50: m50 };
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
    const w: Weights = want ? { [BTC]: 1 } : {};
    return w;
  },
};

/** MULA-T: rotación semanal hacia las más fuertes, solo con Bitcoin en tendencia. */
export function rotation(n: number, lookback: number, filter = true): Strategy {
  return {
    key: `rot-${n}-${lookback}${filter ? "" : "-libre"}`,
    name: `MULA-T top ${n} · ${lookback}d${filter ? "" : " sin filtro"}`,
    idea: `Cada semana, las ${n} crypto que más han subido en ${lookback} días, a partes iguales; ${filter ? "todo a efectivo si Bitcoin cae bajo su media de 200 días" : "siempre dentro (solo modo ataque)"}.`,
    decide: (c) => {
      if (filter && !btcUp(c)) return c.coins.some((s) => c.holding(s)) ? {} : null;
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
    const picks = [...keep, ...strongest(c, c.coins.length, 30).filter((s) => fresh.includes(s))].slice(0, 3);
    if (sameSet(c, picks)) return null;
    return equal(picks);
  },
};

// ---------------------------------------------------------------------------
// Agentes de dos modos («cambiar el chip»): ataque cuando el mercado va bien, efectivo cuando no.
// El detector entra con calma y sale rápido. Sin memoria: cada día mira solo los datos hasta hoy.
// ---------------------------------------------------------------------------
type Gate = (c: Ctx) => boolean;

/** Caída de Bitcoin desde su máximo de los últimos 30 días (en %, negativa). */
const btcDrawdown30 = (c: Ctx) => {
  const p = c.close(BTC);
  const hi = c.highest(BTC, 30);
  return p !== null && hi !== null ? (p / Math.max(hi, p) - 1) * 100 : 0;
};

/** Detector A: ataque solo si Bitcoin está sobre su media de 200 Y de 50 días y no ha caído más de un 10 % desde su máximo de 30 días. */
export const DETECTOR_A: Gate = (c) => {
  const p = c.close(BTC);
  const m200 = c.ma(BTC, 200);
  const m50 = c.ma(BTC, 50);
  return p !== null && m200 !== null && m50 !== null && p > m200 && p > m50 && btcDrawdown30(c) > -10;
};

/** Detector B: ataque si Bitcoin está sobre su media de 200 y de 50 días y por encima de su precio de hace 10 días (impulso corto a favor). */
export const DETECTOR_B: Gate = (c) => {
  const p = c.close(BTC);
  const m200 = c.ma(BTC, 200);
  const m50 = c.ma(BTC, 50);
  const p10 = c.close(BTC, 10);
  return p !== null && m200 !== null && m50 !== null && p10 !== null && p > m200 && p > m50 && p > p10;
};

function gated(key: string, name: string, idea: string, gate: Gate, attack: (c: Ctx) => string[] | null): Strategy {
  return {
    key,
    name,
    idea,
    decide: (c) => {
      const holding = c.coins.some((s) => c.holding(s));
      if (!gate(c)) return holding ? {} : null; // defensa: todo a efectivo
      const picks = attack(c);
      if (picks === null || sameSet(c, picks)) return null;
      return equal(picks);
    },
  };
}

const attackTop3: (c: Ctx) => string[] | null = (c) => (c.step % 7 !== 0 && c.coins.some((s) => c.holding(s)) ? null : strongest(c, 3, 60));
const attackBreakout: (c: Ctx) => string[] | null = (c) => {
  const keep = c.coins.filter((s) => {
    if (!c.holding(s)) return false;
    const p = c.close(s);
    const low = c.lowest(s, 10);
    return p !== null && low !== null && p >= low;
  });
  const fresh = c.coins.filter((s) => {
    if (c.holding(s)) return false;
    const p = c.close(s);
    const high = c.highest(s, 20);
    return p !== null && high !== null && p > high;
  });
  return [...keep, ...strongest(c, c.coins.length, 30).filter((s) => fresh.includes(s))].slice(0, 3);
};

export const CHIP: Strategy[] = [
  gated("chip-a-btc", "Chip A · Bitcoin", "Detector A; en ataque, solo Bitcoin.", DETECTOR_A, () => [BTC]),
  gated("chip-a-top3", "Chip A · top 3", "Detector A; en ataque, las 3 crypto más fuertes de 60 días (cada semana).", DETECTOR_A, attackTop3),
  gated("chip-a-rupt", "Chip A · rupturas", "Detector A; en ataque, rupturas 20/10 (hasta 3).", DETECTOR_A, attackBreakout),
  gated("chip-b-top3", "Chip B · top 3", "Detector B; en ataque, las 3 crypto más fuertes de 60 días (cada semana).", DETECTOR_B, attackTop3),
  gated("chip-b-rupt", "Chip B · rupturas", "Detector B; en ataque, rupturas 20/10 (hasta 3).", DETECTOR_B, attackBreakout),
];

/**
 * Como `gated`, pero en defensa apuesta a la baja contra Bitcoin con `shortWeight` del patrimonio
 * (1 = todo; 0,5 = la mitad corta y la mitad en efectivo). Sin apalancamiento.
 */
function gatedShort(key: string, name: string, idea: string, gate: Gate, attack: ((c: Ctx) => string[] | null) | null, shortWeight: number): Strategy {
  return {
    key,
    name,
    idea,
    decide: (c) => {
      const longs = c.coins.some((s) => c.holding(s));
      const shortNow = !!c.short?.(BTC);
      if (!gate(c)) {
        if (shortNow && !longs) return null;
        return { [BTC]: -shortWeight };
      }
      if (!attack) return shortNow || longs ? {} : null;
      const picks = attack(c);
      if (picks === null) return shortNow ? {} : null;
      if (!shortNow && sameSet(c, picks)) return null;
      return equal(picks);
    },
  };
}

export const SHORTS: Strategy[] = [
  gatedShort("short-only", "Solo corto en defensa", "Detector B; en defensa, corto en Bitcoin con todo; en ataque, efectivo (para ver qué aporta el corto por sí solo).", DETECTOR_B, null, 1),
  gatedShort("chip-b-rupt-short", "Chip B · rupturas + corto", "Detector B; en ataque, rupturas 20/10; en defensa, corto en Bitcoin con todo.", DETECTOR_B, attackBreakout, 1),
  gatedShort("chip-b-rupt-short50", "Chip B · rupturas + ½ corto", "Detector B; en ataque, rupturas 20/10; en defensa, corto en Bitcoin con la mitad y la otra mitad en efectivo.", DETECTOR_B, attackBreakout, 0.5),
];

/** Las candidatas que se comparan en el laboratorio. */
export const CANDIDATES: Strategy[] = [BTC_FILTER, rotation(2, 60), rotation(3, 60), BREAKOUT, rotation(3, 30, false)];

/** Mantener Bitcoin sin más (la vara de medir). */
export const HOLD_BTC: Strategy = {
  key: "hold-btc",
  name: "Mantener Bitcoin",
  idea: "Comprar Bitcoin el primer día y no tocarlo.",
  decide: (c) => (c.step === 0 ? { [BTC]: 1 } : null),
};
