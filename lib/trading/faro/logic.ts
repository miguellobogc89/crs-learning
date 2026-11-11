// lib/trading/faro/logic.ts
// Reglas puras de FARO (el analista común): validar las ideas de la IA, puntuarlas con lo que hizo
// el precio después y elegir cuál toma cada kamikaze. Sin red ni base de datos: lo prueban los tests.
import type { Bar } from "../kamikaze/logic";
import type { KamikazeStyle } from "../kamikaze/roster";

export type IdeaKind = "impulso" | "ruptura" | "rebote" | "noticia";
export const KINDS: IdeaKind[] = ["impulso", "ruptura", "rebote", "noticia"];
export type IdeaStatus = "viva" | "acierto" | "fallo" | "caducada";

/** Qué tipos de idea toma cada estilo de kamikaze. */
export const STYLE_KINDS: Record<KamikazeStyle, IdeaKind[]> = {
  impulso: ["impulso"],
  rupturas: ["ruptura", "noticia"],
  rebotes: ["rebote"],
};

/** Coste de ida y vuelta que se descuenta al puntuar una idea (comisiones + deslizamiento). */
export const IDEA_COST_PCT = 0.35;
export const MAX_IDEAS = 8;
const HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// Validación de lo que propone la IA
// ---------------------------------------------------------------------------
export type AiIdea = {
  pair: string;
  kind: string;
  conviction: number;
  invalidation: number;
  target: number;
  valid_hours: number;
  rationale: string;
  risks: string;
};

export type CheckedIdea = {
  pair: string;
  kind: IdeaKind;
  conviction: number;
  price: number;
  invalidation: number;
  target: number;
  validHours: number;
  rationale: string;
  risks: string | null;
};

export function checkIdeas(
  ideas: AiIdea[],
  ctx: { candidates: { pair: string; price: number }[]; livePairs: string[] },
  max = MAX_IDEAS,
): { ok: CheckedIdea[]; rejected: { pair: string; reason: string }[] } {
  const ok: CheckedIdea[] = [];
  const rejected: { pair: string; reason: string }[] = [];
  const seen = new Set(ctx.livePairs.map((p) => p.toUpperCase()));
  for (const i of [...ideas].sort((a, b) => b.conviction - a.conviction)) {
    const pair = String(i.pair ?? "").toUpperCase();
    const reject = (reason: string) => rejected.push({ pair, reason });
    const c = ctx.candidates.find((x) => x.pair === pair);
    if (!c) {
      reject("no estaba entre los candidatos");
      continue;
    }
    if (!KINDS.includes(i.kind as IdeaKind)) {
      reject(`tipo desconocido: ${i.kind}`);
      continue;
    }
    if (seen.has(pair)) {
      reject("ya hay una idea viva de este par");
      continue;
    }
    const down = ((c.price - i.invalidation) / c.price) * 100;
    const up = ((i.target - c.price) / c.price) * 100;
    if (!(down >= 1 && down <= 40)) {
      reject("la invalidación tiene que estar entre un 1 % y un 40 % por debajo del precio");
      continue;
    }
    if (!(up >= 3 && up <= 300)) {
      reject("el objetivo tiene que estar entre un 3 % y un 300 % por encima del precio");
      continue;
    }
    if (ok.length >= max) {
      reject("demasiadas ideas en una revisión");
      continue;
    }
    seen.add(pair);
    ok.push({
      pair,
      kind: i.kind as IdeaKind,
      conviction: Math.max(1, Math.min(5, Math.round(i.conviction || 1))),
      price: c.price,
      invalidation: i.invalidation,
      target: i.target,
      validHours: Math.max(1, Math.min(24, Math.round(i.valid_hours || 6))),
      rationale: String(i.rationale ?? "").slice(0, 1200),
      risks: i.risks ? String(i.risks).slice(0, 600) : null,
    });
  }
  return { ok, rejected };
}

// ---------------------------------------------------------------------------
// Puntuación: qué habría pasado siguiendo la idea al pie de la letra
// ---------------------------------------------------------------------------
export type IdeaTrack = {
  price: number;
  invalidation: number;
  target: number;
  createdAt: number;
  validUntil: number;
  best: number | null;
  worst: number | null;
};

export type IdeaScore = {
  status: IdeaStatus;
  best: number;
  worst: number;
  lastPrice: number | null;
  exitPrice: number | null;
  resultPct: number | null;
  resolvedAt: number | null;
};

const pctOf = (from: number, to: number) => ((to - from) / from) * 100;
const net = (pct: number) => Math.round((pct - IDEA_COST_PCT) * 100) / 100;

/**
 * Recorre las velas desde que se publicó la idea: lo primero que toque, invalidación (fallo) u
 * objetivo (acierto). Si una misma vela toca los dos, cuenta como fallo (no se sabe el orden).
 * Al caducar sin tocar ninguno, se cierra al precio de ese momento. Resultado neto de costes.
 */
export function scoreIdea(i: IdeaTrack, bars: Bar[], now: number, livePrice: number | null): IdeaScore {
  let best = i.best ?? 0;
  let worst = i.worst ?? 0;
  let lastPrice: number | null = null;
  const done = (status: IdeaStatus, exit: number, at: number): IdeaScore => ({
    status,
    best,
    worst,
    lastPrice: exit,
    exitPrice: exit,
    resultPct: net(pctOf(i.price, exit)),
    resolvedAt: at,
  });
  for (const b of bars) {
    if (b.t < i.createdAt) continue;
    if (b.t >= i.validUntil) break;
    const low = b.l <= i.invalidation;
    const high = b.h >= i.target;
    if (low) {
      worst = Math.min(worst, pctOf(i.price, Math.min(b.l, i.invalidation)));
      return done("fallo", Math.min(i.invalidation, b.o), b.t);
    }
    best = Math.max(best, pctOf(i.price, b.h));
    worst = Math.min(worst, pctOf(i.price, b.l));
    if (high) return done("acierto", Math.max(i.target, b.o), b.t);
    lastPrice = b.c;
  }
  if (now >= i.validUntil) return done("caducada", lastPrice ?? livePrice ?? i.price, i.validUntil);
  if (livePrice !== null) {
    best = Math.max(best, pctOf(i.price, livePrice));
    worst = Math.min(worst, pctOf(i.price, livePrice));
    if (livePrice <= i.invalidation) return done("fallo", livePrice, now);
    if (livePrice >= i.target) return done("acierto", livePrice, now);
    lastPrice = livePrice;
  }
  return { status: "viva", best, worst, lastPrice, exitPrice: null, resultPct: lastPrice !== null ? net(pctOf(i.price, lastPrice)) : null, resolvedAt: null };
}

// ---------------------------------------------------------------------------
// Qué idea toma un kamikaze
// ---------------------------------------------------------------------------
export type BoardIdea = { id: string; pair: string; kind: string; conviction: number; price: number; invalidation: number; target: number; validUntil: number; createdAt: number };

/** Margen máximo que puede haber subido el precio desde la idea para que aún valga entrar. */
export const MAX_CHASE_PCT = 3;

export type PickOptions = { maxChasePct?: number; stopMode?: "clamp" | "idea" };
const TYPE_TEXT: Record<KamikazeStyle, string> = { impulso: "impulso", rupturas: "ruptura o noticia", rebotes: "rebote" };
const pct1 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;

/**
 * La mejor idea viva de su estilo que aún se puede tomar: no caducada, precio por encima de la
 * invalidación y sin haberse escapado. Stop en la invalidación («clamp»: entre un 5 % y un 40 % por
 * debajo; «idea»: tal cual) y objetivo de al menos +10 %. Si no hay ninguna, dice por qué.
 */
export function chooseIdea<T extends BoardIdea>(
  style: KamikazeStyle,
  ideas: T[],
  price: (pair: string) => number | null,
  now: number,
  taken: Set<string> = new Set(),
  opts: PickOptions = {},
): { pick: { idea: T; price: number; stop: number; target: number } } | { reason: string } {
  const chase = opts.maxChasePct ?? MAX_CHASE_PCT;
  const kinds = STYLE_KINDS[style] as string[];
  const mine = ideas.filter((i) => kinds.includes(i.kind) && i.validUntil > now);
  if (!mine.length) return { reason: `No hay ideas de ${TYPE_TEXT[style]} en el tablón` };
  const free = mine.filter((i) => !taken.has(i.id));
  if (!free.length) return { reason: `Ya entró en las ideas de ${TYPE_TEXT[style]} que hay` };
  const priced = free.map((i) => ({ i, p: price(i.pair) }));
  const options = priced
    .filter((x): x is { i: T; p: number } => x.p !== null && x.p > x.i.invalidation && x.p <= x.i.price * (1 + chase / 100))
    .sort((a, b) => b.i.conviction - a.i.conviction || b.i.createdAt - a.i.createdAt);
  const best = options[0];
  if (!best) {
    const why = priced.map(({ i, p }) =>
      p === null ? `${i.pair}: sin precio` : p <= i.invalidation ? `${i.pair}: por debajo de la invalidación` : `${i.pair}: ya escapada (${pct1(((p - i.price) / i.price) * 100)})`,
    );
    return { reason: `${free.length === 1 ? "1 idea" : `${free.length} ideas`} de ${TYPE_TEXT[style]}, ninguna a tiro: ${why.join(" · ")}` };
  }
  const { i, p } = best;
  const stop = opts.stopMode === "idea" ? i.invalidation : Math.min(p * 0.95, Math.max(p * 0.6, i.invalidation));
  const target = Math.max(i.target, p * 1.1);
  return { pick: { idea: i, price: p, stop, target } };
}

/** Igual que chooseIdea, sin el motivo: la idea elegida o null. */
export function pickIdea<T extends BoardIdea>(style: KamikazeStyle, ideas: T[], price: (pair: string) => number | null, now: number, taken: Set<string> = new Set(), opts: PickOptions = {}) {
  const r = chooseIdea(style, ideas, price, now, taken, opts);
  return "pick" in r ? r.pick : null;
}

/** Stop que sube con el precio: misma distancia que el riesgo inicial, y nunca baja. */
export function trailingStop(p: { entry: number; initialStop: number; stop: number }, price: number) {
  const dist = p.entry > p.initialStop ? (p.entry - p.initialStop) / p.entry : 0.1;
  const next = price * (1 - dist);
  return next > p.stop ? next : p.stop;
}

export const hoursLeft = (validUntil: number, now: number) => Math.max(0, (validUntil - now) / HOUR);
