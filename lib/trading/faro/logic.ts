// lib/trading/faro/logic.ts
// Reglas puras de FARO (el analista común): validar las ideas de la IA, puntuarlas con lo que hizo
// el precio después y elegir cuál toma cada kamikaze. Sin red ni base de datos: lo prueban los tests.
import type { Bar } from "../kamikaze/logic";
import type { KamikazeStyle } from "../kamikaze/roster";
import { CARTA, ideaValidHours, isCartaKind, isLimitKind } from "../carta";

export type IdeaKind = "impulso" | "ruptura" | "rebote" | "noticia" | "retroceso" | "ruido" | "tendencia";
export const KINDS: IdeaKind[] = ["impulso", "ruptura", "rebote", "noticia", "retroceso", "ruido", "tendencia"];
/**
 * Tipos que FARO ya no publica. Rebotes: 0 aciertos en 58 ideas (−2,1 % de media) del 11 al 14/11/2026.
 * Se puede cambiar con TRADING_FARO_OFF (lista separada por comas; vacío = ninguno apagado).
 */
export const DISABLED_KINDS: IdeaKind[] = (() => {
  const raw = typeof process !== "undefined" ? process.env.TRADING_FARO_OFF : undefined;
  const list = raw === undefined ? ["rebote"] : raw.split(",").map((x) => x.trim()).filter(Boolean);
  return KINDS.filter((k) => list.includes(k));
})();
export const ENABLED_KINDS: IdeaKind[] = KINDS.filter((k) => !DISABLED_KINDS.includes(k));
/** Los que propone la IA de FARO (ruido y tendencia salen de escáneres de reglas, sin IA). */
export const AI_KINDS: IdeaKind[] = ENABLED_KINDS.filter((k) => !isCartaKind(k) || CARTA[k].source === "FARO");
/** «sin_entrar»: orden limitada que caducó sin que el precio bajara a su nivel (no cuenta como resultado). */
export type IdeaStatus = "viva" | "acierto" | "fallo" | "caducada" | "sin_entrar";

/** Qué tipos de idea toma cada estilo de kamikaze. */
export const STYLE_KINDS: Record<KamikazeStyle, IdeaKind[]> = {
  impulso: ["impulso"],
  rupturas: ["ruptura", "noticia"],
  rebotes: ["rebote"],
  selectivo: ["impulso", "ruptura", "noticia"],
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
  /** Solo «retroceso»: precio de la orden limitada (por debajo del de ahora). */
  entry?: number | null;
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
    if (DISABLED_KINDS.includes(i.kind as IdeaKind)) {
      reject(`tipo apagado: ${i.kind}`);
      continue;
    }
    if (seen.has(pair)) {
      reject("ya hay una idea viva de este par");
      continue;
    }
    // Retroceso: la referencia es el precio de la orden limitada, que tiene que estar por debajo del de ahora.
    let ref = c.price;
    if (isLimitKind(i.kind)) {
      const e = Number(i.entry);
      const below = Number.isFinite(e) ? ((c.price - e) / c.price) * 100 : NaN;
      if (!(below >= 0.5 && below <= 15)) {
        reject("la entrada de un retroceso tiene que estar entre un 0,5 % y un 15 % por debajo del precio");
        continue;
      }
      ref = e;
    }
    const down = ((ref - i.invalidation) / ref) * 100;
    const up = ((i.target - ref) / ref) * 100;
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
      price: ref,
      invalidation: i.invalidation,
      target: i.target,
      // Con el plazo máximo de su tipo en la carta (y el tiempo de entrar, si es limitada).
      validHours: isCartaKind(i.kind) ? ideaValidHours(i.kind, Math.max(1, Math.min(24, Math.round(i.valid_hours || 6)))) : Math.max(1, Math.min(24, Math.round(i.valid_hours || 6))),
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

/**
 * Idea con orden limitada (retroceso, ruido): no empieza hasta que una vela toca su precio antes de
 * `entryUntil`. Si no lo toca a tiempo: «sin_entrar» (sin resultado). Si lo toca y en esa misma vela
 * también rompe la invalidación, cuenta como fallo.
 */
export function scoreLimitIdea(i: IdeaTrack, entryUntil: number, bars: Bar[], now: number, livePrice: number | null): IdeaScore {
  const fill = bars.find((b) => b.t >= i.createdAt && b.t < entryUntil && b.l <= i.price);
  const touchedLive = !fill && livePrice !== null && now < entryUntil && livePrice <= i.price;
  if (!fill && !touchedLive) {
    if (now >= entryUntil) return { status: "sin_entrar", best: 0, worst: 0, lastPrice: livePrice, exitPrice: null, resultPct: null, resolvedAt: entryUntil };
    return { status: "viva", best: 0, worst: 0, lastPrice: livePrice, exitPrice: null, resultPct: null, resolvedAt: null };
  }
  if (fill && fill.l <= i.invalidation) {
    return { status: "fallo", best: 0, worst: pctOf(i.price, i.invalidation), lastPrice: i.invalidation, exitPrice: i.invalidation, resultPct: net(pctOf(i.price, i.invalidation)), resolvedAt: fill.t };
  }
  // Desde la vela siguiente a la entrada, como cualquier idea.
  const from = fill ? fill.t + 1 : now;
  return scoreIdea({ ...i, createdAt: from }, bars, now, livePrice);
}

// ---------------------------------------------------------------------------
// Qué idea toma un kamikaze
// ---------------------------------------------------------------------------
export type BoardIdea = { id: string; pair: string; kind: string; conviction: number; price: number; invalidation: number; target: number; validUntil: number; createdAt: number };

/** Margen máximo que puede haber subido el precio desde la idea para que aún valga entrar. */
export const MAX_CHASE_PCT = 3;

export type PickOptions = {
  maxChasePct?: number;
  stopMode?: "clamp" | "idea";
  minConviction?: number;
  /** Tipos de la carta que coge (si no, los de su estilo). */
  kinds?: string[];
  /** Usa el stop y el objetivo de la idea tal cual (sin el mínimo de +10 % de los antiguos kamikazes). */
  ideaLevels?: boolean;
};
const TYPE_TEXT: Record<KamikazeStyle, string> = { impulso: "impulso", rupturas: "ruptura o noticia", rebotes: "rebote", selectivo: "convicción alta" };
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
  const kinds = opts.kinds ?? (STYLE_KINDS[style] as string[]);
  const what = opts.kinds ? opts.kinds.map((k) => (isCartaKind(k) ? CARTA[k].label.toLowerCase() : k)).join(", ") : TYPE_TEXT[style];
  const mine = ideas.filter((i) => kinds.includes(i.kind) && i.validUntil > now && i.conviction >= (opts.minConviction ?? 0));
  if (!mine.length) return { reason: `No hay ideas de ${what} en el tablón` };
  const free = mine.filter((i) => !taken.has(i.id));
  if (!free.length) return { reason: `Ya entró en las ideas de ${what} que hay` };
  const priced = free.map((i) => ({ i, p: price(i.pair) }));
  // A mercado: si el precio no se ha escapado. Limitadas: solo cuando el precio baja a su nivel (y dentro de su tiempo de entrar).
  const inWindow = (i: T) => !isCartaKind(i.kind) || CARTA[i.kind].entryHours === null || now <= i.createdAt + (CARTA[i.kind].entryHours ?? 0) * HOUR;
  const options = priced
    .filter((x): x is { i: T; p: number } =>
      x.p !== null &&
      x.p > x.i.invalidation &&
      inWindow(x.i) &&
      (isLimitKind(x.i.kind) ? x.p <= x.i.price * 1.002 : x.p <= x.i.price * (1 + chase / 100)),
    )
    .sort((a, b) => b.i.conviction - a.i.conviction || b.i.createdAt - a.i.createdAt);
  const best = options[0];
  if (!best) {
    const why = priced.map(({ i, p }) =>
      p === null
        ? `${i.pair}: sin precio`
        : p <= i.invalidation
          ? `${i.pair}: por debajo de la invalidación`
          : isLimitKind(i.kind)
            ? `${i.pair}: esperando a que baje a ${i.price.toPrecision(5)} (${pct1(((p - i.price) / i.price) * 100)} por encima)`
            : `${i.pair}: ya escapada (${pct1(((p - i.price) / i.price) * 100)})`,
    );
    return { reason: `${free.length === 1 ? "1 idea" : `${free.length} ideas`} de ${what}, ninguna a tiro: ${why.join(" · ")}` };
  }
  const { i, p } = best;
  if (opts.ideaLevels) return { pick: { idea: i, price: p, stop: i.invalidation, target: i.target } };
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

// ---------------------------------------------------------------------------
// Lo que veía FARO al publicar una idea (para analizar y aprender)
// ---------------------------------------------------------------------------
export type IdeaFeatures = {
  /** Estilos de kamikaze en los que encajaba el par (impulso, rupturas, rebotes). */
  styles: string[];
  ch1h: number;
  ch4h: number;
  ch24h: number;
  /** Distancia al máximo y al mínimo de 3 días, en %. */
  fromHigh3d: number;
  fromLow3d: number;
  /** Volumen de las últimas 4 h frente a la media (1 = normal). */
  volSurge: number;
  volume24hEur: number;
  /** Cuánto se arriesga hasta la invalidación y cuánto hay hasta el objetivo, en %. */
  riskPct: number;
  rewardPct: number;
  validHours: number;
  /** Hora de Madrid (0-23) y día de la semana (0 = domingo) al publicarla. */
  hour: number;
  weekday: number;
  /** Fase del mercado (detector de CAMALEÓN sobre Bitcoin): ataque o defensa, y días que lleva. */
  phase: string | null;
  phaseDays: number | null;
  /** Cambio de Bitcoin en 24 h, en %. */
  btc24h: number | null;
  /** Noticias relevantes de esa moneda en las últimas 24 h. */
  news: number;
  /** Reconstruido después con velas públicas (no lo guardó FARO en el momento): sin «styles». */
  backfilled?: boolean;
  /** Volatilidad: rango medio de una vela de 1 h (ATR de 24 h) en % del precio. */
  atrPct?: number;
  /** Simulación con stop y objetivo según la volatilidad: «s|t» → [resultado %, a/f/c]. Solo en resueltas. */
  sim?: Record<string, [number, "a" | "f" | "c"]>;
};

const round2 = (x: number) => Math.round(x * 100) / 100;

export function ideaFeatures(
  m: { ch1h: number; ch4h: number; ch24h: number; fromHigh3d: number; fromLow3d: number; volSurge: number; volume24h: number },
  styles: string[],
  idea: { price: number; invalidation: number; target: number; validHours: number },
  ctx: { now: number; phase: { mode: string; days: number } | null; btc24h: number | null; news: number; atrPct?: number | null },
): IdeaFeatures {
  const madrid = new Date(new Date(ctx.now).toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  return {
    styles,
    ch1h: round2(m.ch1h),
    ch4h: round2(m.ch4h),
    ch24h: round2(m.ch24h),
    fromHigh3d: round2(m.fromHigh3d),
    fromLow3d: round2(m.fromLow3d),
    volSurge: round2(m.volSurge),
    volume24hEur: Math.round(m.volume24h),
    riskPct: round2(((idea.price - idea.invalidation) / idea.price) * 100),
    rewardPct: round2(((idea.target - idea.price) / idea.price) * 100),
    validHours: idea.validHours,
    hour: madrid.getHours(),
    weekday: madrid.getDay(),
    phase: ctx.phase?.mode ?? null,
    phaseDays: ctx.phase?.days ?? null,
    btc24h: ctx.btc24h === null ? null : round2(ctx.btc24h),
    news: ctx.news,
    ...(ctx.atrPct ? { atrPct: round2(ctx.atrPct) } : {}),
  };
}

// ---------------------------------------------------------------------------
// FARO-2 (en pruebas, en paralelo): las mismas ideas, pero solo las que pasan unos filtros fijados de
// antemano (no ajustados a los datos para que «salgan bien»). Se compara en la pestaña Análisis.
// ---------------------------------------------------------------------------
export const FARO2_RULES = {
  /** Ya había subido demasiado: llega tarde. */
  maxCh24h: 12,
  maxCh1h: 4,
  /** Un impulso pegado al máximo de 3 días (a menos de un 1 %) suele estar agotado. */
  impulseMinFromHigh3d: -1,
  /** Bitcoin cayendo con fuerza en 24 h arrastra a casi todo. */
  minBtc24h: -2,
  /** El objetivo tiene que estar al menos a 1,5 veces lo que se arriesga. */
  minRewardRisk: 1.5,
} as const;

export function faro2Verdict(kind: string, f: IdeaFeatures | null): { pass: boolean; reasons: string[] } | null {
  if (!f) return null;
  // Los escáneres de la carta (ruido, tendencia) ya son reglas: el filtro es para lo que propone la IA.
  if (isCartaKind(kind) && CARTA[kind].source === "Escáner") return null;
  const r = FARO2_RULES;
  const reasons: string[] = [];
  const p = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;
  if (kind === "rebote") reasons.push("los rebotes están apagados");
  if (f.ch24h > r.maxCh24h) reasons.push(`ya había subido ${p(f.ch24h)} en 24 h`);
  if (f.ch1h > r.maxCh1h) reasons.push(`subió ${p(f.ch1h)} en la última hora: llega tarde`);
  if (kind === "impulso" && f.fromHigh3d > r.impulseMinFromHigh3d) reasons.push("impulso pegado al máximo de 3 días");
  if (f.btc24h !== null && f.btc24h < r.minBtc24h) reasons.push(`Bitcoin cae ${p(f.btc24h)} en 24 h`);
  // En defensa solo se descartan los tipos que piden mercado en ataque (las noticias valen siempre).
  if (f.phase === "defensa" && (!isCartaKind(kind) || CARTA[kind].regime === "ataque")) reasons.push("mercado en defensa");
  if (f.riskPct > 0 && f.rewardPct < r.minRewardRisk * f.riskPct) reasons.push(`objetivo corto para lo que arriesga (${p(f.rewardPct)} frente a −${f.riskPct.toFixed(1).replace(".", ",")} %)`);
  return { pass: reasons.length === 0, reasons };
}

/** Las métricas de un par en un momento pasado a partir de sus velas horarias anteriores (para reconstruir). */
export function pastTicker(pair: string, base: string, price: number, bars: { h: number; l: number; c: number; qv: number }[]) {
  const last24 = bars.slice(-24);
  const open24 = bars.length >= 25 ? bars[bars.length - 25].c : bars[0]?.c;
  return {
    pair,
    base,
    price,
    ch24h: open24 && open24 > 0 ? ((price - open24) / open24) * 100 : 0,
    high24h: last24.length ? Math.max(...last24.map((b) => b.h)) : price,
    low24h: last24.length ? Math.min(...last24.map((b) => b.l)) : price,
    volume24h: last24.reduce((s, b) => s + b.qv, 0),
  };
}

// ---------------------------------------------------------------------------
// Ideas de control (al azar): ¿elige la IA mejor que el azar?
// ---------------------------------------------------------------------------
export type ControlIdea = { pair: string; price: number; invalidation: number; target: number; validHours: number };

/**
 * Por cada idea que publica la IA, una de control: una moneda al azar entre las mismas candidatas (sin
 * repetir en la misma revisión), con el mismo riesgo, recorrido y validez que esa idea. Así lo único que
 * cambia es QUÉ moneda se elige.
 */
export function controlIdeas(candidates: { pair: string; price: number }[], ideas: { price: number; invalidation: number; target: number; validHours: number }[], rnd: () => number = Math.random): ControlIdea[] {
  const pool = candidates.filter((c) => c.price > 0);
  const out: ControlIdea[] = [];
  for (const i of ideas) {
    if (!pool.length) break;
    const k = Math.floor(rnd() * pool.length) % pool.length;
    const c = pool.splice(k, 1)[0];
    const risk = (i.price - i.invalidation) / i.price;
    const reward = (i.target - i.price) / i.price;
    out.push({ pair: c.pair, price: c.price, invalidation: c.price * (1 - risk), target: c.price * (1 + reward), validHours: i.validHours });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stop y objetivo según la volatilidad (ATR): probarlo con las ideas pasadas antes de usarlo
// ---------------------------------------------------------------------------
/** Rango verdadero medio de las últimas `n` velas (1 h), en % de `price`. null si no hay velas. */
export function atrPct(bars: { h: number; l: number; c: number }[], price: number, n = 24): number | null {
  const list = bars.slice(-(n + 1));
  if (list.length < 2 || !(price > 0)) return null;
  let sum = 0;
  for (let k = 1; k < list.length; k++) {
    const b = list[k];
    const prev = list[k - 1].c;
    sum += Math.max(b.h - b.l, Math.abs(b.h - prev), Math.abs(b.l - prev));
  }
  return (sum / (list.length - 1) / price) * 100;
}

/** Múltiplos de ATR que se prueban para el stop (por debajo) y el objetivo (por encima). */
export const SIM_STOPS = [1, 1.5, 2, 3] as const;
export const SIM_TARGETS = [1, 1.5, 2, 3, 4] as const;
export const simKey = (s: number, t: number) => `${s}|${t}`;

/**
 * Lo que habría pasado con cada combinación de stop y objetivo (en ATR) siguiendo las velas de 5 min
 * desde la idea y con su misma validez. Misma regla que el tablón (si una vela toca los dos, fallo).
 */
export function simulateLevels(
  idea: { price: number; createdAt: number; validUntil: number },
  atr: number,
  bars: Bar[],
  now: number,
): Record<string, [number, "a" | "f" | "c"]> {
  const out: Record<string, [number, "a" | "f" | "c"]> = {};
  for (const sm of SIM_STOPS)
    for (const tm of SIM_TARGETS) {
      const sc = scoreIdea(
        { price: idea.price, invalidation: idea.price * (1 - (sm * atr) / 100), target: idea.price * (1 + (tm * atr) / 100), createdAt: idea.createdAt, validUntil: idea.validUntil, best: null, worst: null },
        bars,
        Math.max(now, idea.validUntil),
        null,
      );
      if (sc.resultPct === null) continue;
      out[simKey(sm, tm)] = [sc.resultPct, sc.status === "acierto" ? "a" : sc.status === "fallo" ? "f" : "c"];
    }
  return out;
}

// ---------------------------------------------------------------------------
// Base para aprender (17/11/2026)
// ---------------------------------------------------------------------------
/**
 * Versión de FARO: sube cada vez que cambian sus reglas, su prompt o su filtro, para poder comparar
 * versiones en las mismas condiciones. Formato AAAA-MM-DD.n. Historial:
 *  - 2026-11-17.1: carta de oportunidades (retroceso, ruido, tendencia), plazos por tipo, filtro por
 *    momento del mercado, foto completa del mercado y candidatos guardados.
 */
export const FARO_VERSION = "2026-11-17.1";

/** RSI de 14 periodos (Wilder) sobre cierres; null si no hay velas suficientes. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(0, d)) / period;
    loss = (loss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return Math.round((100 - 100 / (1 + gain / loss)) * 10) / 10;
}

/** Lo que pasó con un candidato tras el análisis: a 6 y 24 h, lo máximo que subió, lo máximo que bajó y dónde acabó (en %). */
export type CandidateOutcome = Record<"h6" | "h24", { up: number; down: number; close: number } | null>;

export function candidateOutcome(bars: Bar[], t0: number, price: number): CandidateOutcome {
  const win = (hours: number) => {
    const end = t0 + hours * HOUR;
    // Desde la primera vela completa tras el análisis (la que estaba en curso tiene precios de antes).
    const w = bars.filter((b) => b.t >= t0 && b.t < end);
    if (!w.length || !(price > 0)) return null;
    const p = (v: number) => Math.round(((v - price) / price) * 10000) / 100;
    return { up: p(Math.max(...w.map((b) => b.h))), down: p(Math.min(...w.map((b) => b.l))), close: p(w[w.length - 1].c) };
  };
  return { h6: win(6), h24: win(24) };
}
