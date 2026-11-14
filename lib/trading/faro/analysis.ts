// lib/trading/faro/analysis.ts
// Rendimiento de FARO a partir de sus ideas ya resueltas (acierto, fallo o caducada): si gana dinero,
// cómo evoluciona, qué tipos y convicciones funcionan, si el objetivo está bien puesto, a qué horas y en
// qué fase del mercado acierta. Cada idea cuenta como si se hubieran puesto 100 € al pie de la letra
// (resultado neto de costes, como en el tablón). Puro: lo prueban los tests.
import { IDEA_COST_PCT, SIM_STOPS, SIM_TARGETS, simKey, type IdeaFeatures } from "./logic";

export type ResolvedIdea = {
  id: string;
  createdAt: number;
  resolvedAt: number | null;
  kind: string;
  conviction: number;
  status: "acierto" | "fallo" | "caducada";
  resultPct: number;
  /** Lo máximo que llegó a subir y a bajar desde que se publicó hasta que se resolvió, en %. */
  bestPct: number;
  worstPct: number;
  /** Cuánto había hasta el objetivo y hasta la invalidación al publicarla, en %. */
  rewardPct: number;
  riskPct: number;
  features: IdeaFeatures | null;
};

export type Bucket = { key: string; label: string; n: number; hits: number; hitRate: number; avgPct: number; totalEur: number };

const STAKE = 100;
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

function bucket(key: string, label: string, list: ResolvedIdea[]): Bucket {
  const n = list.length;
  const hits = list.filter((i) => i.status === "acierto").length;
  const sum = list.reduce((s, i) => s + i.resultPct, 0);
  return { key, label, n, hits, hitRate: n ? round((hits / n) * 100, 1) : 0, avgPct: n ? round(sum / n) : 0, totalEur: round((sum / 100) * STAKE) };
}

function groupBy(list: ResolvedIdea[], keyOf: (i: ResolvedIdea) => string | null, order: { key: string; label: string }[]): Bucket[] {
  return order.map((o) => bucket(o.key, o.label, list.filter((i) => keyOf(i) === o.key))).filter((b) => b.n > 0);
}

/** Lunes de la semana (UTC) de un instante, como AAAA-MM-DD. */
export function weekOf(t: number) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/**
 * Qué habría pasado con un objetivo fijo de +k %: las que llegaron a subir k antes de resolverse habrían
 * acertado ahí (lo máximo que subió se mide hasta que tocó la invalidación o caducó, así que el orden
 * es el correcto); las demás, igual que fueron.
 */
export function targetScan(list: ResolvedIdea[], levels = [1, 2, 3, 4, 5, 7, 10, 15]) {
  const current = list.reduce((s, i) => s + i.resultPct, 0);
  return {
    currentAvgPct: list.length ? round(current / list.length) : 0,
    levels: levels.map((k) => {
      const sum = list.reduce((s, i) => s + (i.bestPct >= k && k < i.rewardPct ? k - IDEA_COST_PCT : i.resultPct), 0);
      const hits = list.filter((i) => i.bestPct >= k && k < i.rewardPct).length + list.filter((i) => !(k < i.rewardPct) && i.status === "acierto").length;
      return { targetPct: k, avgPct: list.length ? round(sum / list.length) : 0, hitRate: list.length ? round((hits / list.length) * 100, 1) : 0 };
    }),
  };
}

const KIND_LABEL: Record<string, string> = { impulso: "Impulso", ruptura: "Ruptura", rebote: "Rebote", noticia: "Noticia" };
const HOUR_BANDS = [
  { key: "noche", label: "Noche (0-6 h)", from: 0, to: 6 },
  { key: "manana", label: "Mañana (6-12 h)", from: 6, to: 12 },
  { key: "tarde", label: "Tarde (12-18 h)", from: 12, to: 18 },
  { key: "noche2", label: "Noche (18-24 h)", from: 18, to: 24 },
];
const madridDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(t));
const madridHour = (t: number) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Madrid" }).format(new Date(t))) % 24;

/**
 * Rejilla de stop × objetivo (en ATR) con las ideas que tienen simulación: resultado medio y acierto de
 * cada combinación, lo que hicieron con sus propios niveles, y si la mejor combinación aguanta en las dos
 * mitades del periodo (si solo funciona en una, es suerte).
 */
export function levelGrid(list: ResolvedIdea[]) {
  const sims = list.filter((i) => i.features?.sim && Object.keys(i.features.sim).length).sort((a, b) => a.createdAt - b.createdAt);
  const cell = (ideas: ResolvedIdea[], key: string) => {
    const rows = ideas.map((i) => i.features!.sim![key]).filter(Boolean);
    const n = rows.length;
    return { n, avgPct: n ? round(rows.reduce((s, r) => s + r[0], 0) / n) : 0, hitRate: n ? round((rows.filter((r) => r[1] === "a").length / n) * 100, 1) : 0 };
  };
  const grid = SIM_STOPS.map((s) => ({ stop: s, cells: SIM_TARGETS.map((t) => ({ target: t, ...cell(sims, simKey(s, t)) })) }));
  const flat = grid.flatMap((r) => r.cells.map((c) => ({ stop: r.stop, ...c })));
  const best = flat.filter((c) => c.n > 0).sort((a, b) => b.avgPct - a.avgPct)[0] ?? null;
  const half = Math.floor(sims.length / 2);
  const own = (ideas: ResolvedIdea[]) => (ideas.length ? round(ideas.reduce((s, i) => s + i.resultPct, 0) / ideas.length) : 0);
  const atrs = sims.map((i) => i.features!.atrPct ?? 0).filter((x) => x > 0).sort((a, b) => a - b);
  return {
    n: sims.length,
    stops: [...SIM_STOPS],
    targets: [...SIM_TARGETS],
    grid,
    currentAvgPct: own(sims),
    medianAtrPct: atrs.length ? round(atrs[Math.floor(atrs.length / 2)]) : null,
    best: best && {
      ...best,
      firstHalf: half >= 5 ? cell(sims.slice(0, half), simKey(best.stop, best.target)) : null,
      secondHalf: half >= 5 ? cell(sims.slice(half), simKey(best.stop, best.target)) : null,
      ownFirstHalf: half >= 5 ? own(sims.slice(0, half)) : null,
      ownSecondHalf: half >= 5 ? own(sims.slice(half)) : null,
    },
  };
}

export function analyze(ideas: ResolvedIdea[], opts: { rollingWindow?: number } = {}) {
  const list = [...ideas].sort((a, b) => (a.resolvedAt ?? a.createdAt) - (b.resolvedAt ?? b.createdAt));
  const n = list.length;
  const wins = list.filter((i) => i.resultPct > 0);
  const losses = list.filter((i) => i.resultPct < 0);
  const gross = (l: ResolvedIdea[]) => l.reduce((s, i) => s + i.resultPct, 0);
  const total = bucket("total", "Todas", list);

  // Curva: lo ganado o perdido poniendo 100 € en cada idea, en el orden en que se resolvieron.
  let acc = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equity = list.map((i) => {
    acc += (i.resultPct / 100) * STAKE;
    peak = Math.max(peak, acc);
    maxDrawdown = Math.min(maxDrawdown, acc - peak);
    return { t: i.resolvedAt ?? i.createdAt, eur: round(acc), status: i.status };
  });

  // Semana a semana y media móvil de las últimas N.
  const weeks = [...new Set(list.map((i) => weekOf(i.createdAt)))].sort();
  const weekly = weeks.map((w) => ({ week: w, ...bucket(w, w, list.filter((i) => weekOf(i.createdAt) === w)) }));
  // Con pocas semanas, día a día (fecha de Madrid).
  const days = [...new Set(list.map((i) => madridDay(i.createdAt)))].sort();
  const daily = days.map((d) => ({ week: d, ...bucket(d, d, list.filter((i) => madridDay(i.createdAt) === d)) }));
  const win = Math.max(5, opts.rollingWindow ?? 50);
  const rolling = list.length >= win ? list.slice(win - 1).map((_, k) => {
    const slice = list.slice(k, k + win);
    const last = slice[slice.length - 1];
    return { t: last.resolvedAt ?? last.createdAt, hitRate: round((slice.filter((i) => i.status === "acierto").length / win) * 100, 1), avgPct: round(gross(slice) / win) };
  }) : [];

  // Fallos que llegaron a ir ganando: ¿falla al elegir o al gestionar?
  const fails = list.filter((i) => i.status === "fallo");
  const nearMiss = fails.filter((i) => i.rewardPct > 0 && i.bestPct >= i.rewardPct / 2).length;
  const wentUp2 = fails.filter((i) => i.bestPct >= 2).length;
  const straightDown = fails.filter((i) => i.bestPct < 0.5).length;

  const withFeatures = list.filter((i) => i.features);
  const phaseOf = (i: ResolvedIdea) => i.features?.phase ?? null;

  return {
    n,
    since: list.length ? Math.min(...list.map((i) => i.createdAt)) : null,
    total,
    statusCounts: { acierto: list.filter((i) => i.status === "acierto").length, fallo: fails.length, caducada: list.filter((i) => i.status === "caducada").length },
    avgWinPct: wins.length ? round(gross(wins) / wins.length) : 0,
    avgLossPct: losses.length ? round(gross(losses) / losses.length) : 0,
    /** Ganancias brutas entre pérdidas brutas (más de 1 = gana dinero). */
    profitFactor: losses.length ? round(gross(wins) / Math.abs(gross(losses))) : null,
    maxDrawdownEur: round(maxDrawdown),
    equity,
    weekly,
    daily,
    rolling,
    rollingWindow: win,
    byKind: groupBy(list, (i) => i.kind, Object.entries(KIND_LABEL).map(([key, label]) => ({ key, label }))),
    byConviction: groupBy(list, (i) => String(i.conviction), [1, 2, 3, 4, 5].map((c) => ({ key: String(c), label: `Convicción ${c}` }))),
    byHour: groupBy(list, (i) => HOUR_BANDS.find((b) => madridHour(i.createdAt) >= b.from && madridHour(i.createdAt) < b.to)?.key ?? null, HOUR_BANDS),
    byPhase: groupBy(withFeatures, phaseOf, [
      { key: "ataque", label: "Mercado en ataque" },
      { key: "defensa", label: "Mercado en defensa" },
    ]),
    withFeatures: withFeatures.length,
    management: { fails: fails.length, nearMiss, wentUp2, straightDown },
    targetScan: targetScan(list),
    levels: levelGrid(list),
    /** Puntos para el gráfico de lo máximo que subió frente a lo máximo que bajó (las últimas 400). */
    excursions: list.slice(-400).map((i) => ({ id: i.id, best: round(i.bestPct), worst: round(i.worstPct), status: i.status, kind: i.kind, resultPct: round(i.resultPct) })),
  };
}

export type FaroAnalysis = ReturnType<typeof analyze>;
