// lib/trading/kamikaze/logic.ts
// Reglas puras de los kamikazes: rondas, ritmo necesario, candidatos de cada estilo, salidas y
// validación de lo que decide la IA. Sin red ni base de datos: lo prueban los tests.
import type { KamikazeStyle } from "./roster";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Rondas
// ---------------------------------------------------------------------------
/** Ritmo diario necesario (en %) para llegar a la meta en el tiempo que queda. */
export function requiredDailyPct(equity: number, goal: number, msLeft: number) {
  if (equity <= 0) return Infinity;
  if (equity >= goal) return 0;
  const days = Math.max(msLeft / DAY, 1 / 24);
  return (Math.pow(goal / equity, 1 / days) - 1) * 100;
}

export type RoundEnd = "meta" | "arruinado";

/** ¿Termina la ronda? Solo al alcanzar la meta o quedarse sin dinero para operar. */
export function roundOutcome(r: { equity: number; goal: number; holding: boolean; cash: number; minOrder: number }): RoundEnd | null {
  if (r.equity >= r.goal) return "meta";
  if (!r.holding && r.cash < r.minOrder) return "arruinado";
  return null;
}

// ---------------------------------------------------------------------------
// Datos de mercado → candidatos
// ---------------------------------------------------------------------------
/** Resumen de 24 h de un par (ticker de Binance). */
export type Ticker = { pair: string; base: string; price: number; ch24h: number; high24h: number; low24h: number; volume24h: number };

/** Vela de una hora: [apertura, máx, mín, cierre, volumen en la moneda de cotización]. */
export type Bar = { t: number; o: number; h: number; l: number; c: number; qv: number };

export type Metrics = Ticker & { ch1h: number; ch4h: number; high3d: number; low3d: number; fromHigh3d: number; fromLow3d: number; volSurge: number };

/** Liquidez mínima para que comprar y vender 20 € no mueva el precio (en euros negociados en 24 h). */
export const MIN_VOLUME_EUR = 20_000;

export function parseKlines(data: unknown): Bar[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((k) => (Array.isArray(k) ? { t: Number(k[0]), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), qv: Number(k[7]) } : null))
    .filter((b): b is Bar => !!b && b.c > 0 && Number.isFinite(b.qv));
}

const chg = (from: number | undefined, to: number) => (from && from > 0 ? ((to - from) / from) * 100 : 0);

/** Métricas de un par a partir de sus velas horarias de los últimos ~3 días. */
export function metricsOf(t: Ticker, bars: Bar[]): Metrics {
  const last = bars.length ? bars[bars.length - 1].c : t.price;
  const price = t.price || last;
  const at = (hoursAgo: number) => bars[bars.length - 1 - hoursAgo]?.c;
  const high3d = bars.length ? Math.max(...bars.map((b) => b.h)) : t.high24h;
  const low3d = bars.length ? Math.min(...bars.map((b) => b.l)) : t.low24h;
  const recent = bars.slice(-4).reduce((s, b) => s + b.qv, 0);
  const before = bars.slice(0, -4);
  const avg4h = before.length ? (before.reduce((s, b) => s + b.qv, 0) / before.length) * 4 : 0;
  return {
    ...t,
    price,
    ch1h: chg(at(1), price),
    ch4h: chg(at(4), price),
    high3d,
    low3d,
    fromHigh3d: chg(high3d, price),
    fromLow3d: chg(low3d, price),
    volSurge: avg4h > 0 ? recent / avg4h : 1,
  };
}

/** Primera criba con el resumen de 24 h (barato): los pares que merece la pena mirar con detalle. */
export function prefilter(style: KamikazeStyle, tickers: Ticker[], n = 15): Ticker[] {
  const liquid = tickers.filter((t) => t.volume24h >= MIN_VOLUME_EUR && t.price > 0 && t.high24h > 0);
  const nearHigh = (t: Ticker) => t.price / t.high24h;
  const sorted =
    style === "impulso"
      ? liquid.filter((t) => t.ch24h > 0).sort((a, b) => b.ch24h - a.ch24h)
      : style === "rupturas"
        ? liquid.filter((t) => nearHigh(t) >= 0.95).sort((a, b) => nearHigh(b) - nearHigh(a) || b.volume24h - a.volume24h)
        : liquid.filter((t) => t.ch24h < -3).sort((a, b) => a.ch24h - b.ch24h);
  return sorted.slice(0, n);
}

/** Segunda criba con velas horarias: la lista final que ve la IA, ordenada según el estilo. */
export function rank(style: KamikazeStyle, metrics: Metrics[], n = 10): Metrics[] {
  const score = (m: Metrics) =>
    style === "impulso"
      ? m.ch24h + 2 * m.ch4h + (m.volSurge - 1) * 10
      : style === "rupturas"
        ? (m.fromHigh3d >= -2 ? 50 : 0) + (m.volSurge - 1) * 30 + m.ch4h
        : -m.fromHigh3d + (m.ch1h > 0 ? 20 : -20) + Math.min(m.volSurge, 3) * 5;
  const ok =
    style === "rebotes"
      ? metrics.filter((m) => m.fromHigh3d <= -10)
      : style === "rupturas"
        ? metrics.filter((m) => m.fromHigh3d >= -5)
        : metrics.filter((m) => m.ch24h > 0);
  return [...ok].sort((a, b) => score(b) - score(a)).slice(0, n);
}

// ---------------------------------------------------------------------------
// Vigilancia sin IA
// ---------------------------------------------------------------------------
/** ¿Hay que salir ya? Stop o objetivo tocados con el precio de ahora. */
export function exitNow(p: { stop: number; target: number }, price: number): "stop" | "objetivo" | null {
  if (price <= p.stop) return "stop";
  if (price >= p.target) return "objetivo";
  return null;
}

/** A partir de +30 %, el stop sube como mínimo a la entrada: una operación así ya no puede acabar en pérdida. */
export function protectedStop(p: { entry: number; stop: number }, price: number) {
  return price >= p.entry * 1.3 && p.stop < p.entry ? p.entry : p.stop;
}

/**
 * ¿Toca que decida la IA? Sin posición, cada `idleMin`; con posición, cada `holdMin` o antes si el
 * precio se ha movido mucho desde la última decisión. Nunca durante la pausa tras una pérdida.
 */
export function decisionDue(s: {
  now: number;
  holding: boolean;
  lastAt: number | null;
  lastPrice: number | null;
  price: number | null;
  cooldownUntil: number | null;
  idleMin: number;
  holdMin: number;
  movePct?: number;
}) {
  if (s.cooldownUntil && s.now < s.cooldownUntil) return false;
  if (s.lastAt === null) return true;
  const since = s.now - s.lastAt;
  if (!s.holding) return since >= s.idleMin * 60_000;
  if (since >= s.holdMin * 60_000) return true;
  return !!(s.lastPrice && s.price && Math.abs(chg(s.lastPrice, s.price)) >= (s.movePct ?? 8));
}

// ---------------------------------------------------------------------------
// Lo que decide la IA
// ---------------------------------------------------------------------------
export type AiDecision = {
  action: "comprar" | "vender" | "mantener" | "esperar";
  symbol: string;
  conviction: number;
  stop: number;
  target: number;
  rationale: string;
  risks: string;
};

export type CheckedDecision =
  | { action: "comprar"; pair: string; stop: number; target: number }
  | { action: "vender" }
  | { action: "mantener"; stop: number | null; target: number | null }
  | { action: "esperar" }
  | { action: "rechazada"; reason: string };

/** Límites de stop y objetivo de un kamikaze: arriesga mucho, pero siempre con stop. */
export const STOP_MIN_PCT = 5;
export const STOP_MAX_PCT = 40;
export const TARGET_MIN_PCT = 10;

export function checkDecision(
  d: AiDecision,
  ctx: { holding: { pair: string; entry: number; stop: number; target: number } | null; candidates: { pair: string; price: number }[]; price: (pair: string) => number | null },
): CheckedDecision {
  const reject = (reason: string): CheckedDecision => ({ action: "rechazada", reason });
  if (d.action === "esperar") return { action: "esperar" };
  if (d.action === "comprar") {
    if (ctx.holding) return reject("Ya tiene una posición: un kamikaze va todo a una carta");
    const c = ctx.candidates.find((x) => x.pair === d.symbol.toUpperCase());
    if (!c) return reject(`${d.symbol} no estaba entre los candidatos`);
    const px = ctx.price(c.pair) ?? c.price;
    const stopPct = ((px - d.stop) / px) * 100;
    const targetPct = ((d.target - px) / px) * 100;
    if (!(stopPct >= STOP_MIN_PCT && stopPct <= STOP_MAX_PCT)) return reject(`El stop tiene que estar entre un ${STOP_MIN_PCT} % y un ${STOP_MAX_PCT} % por debajo del precio`);
    if (!(targetPct >= TARGET_MIN_PCT)) return reject(`El objetivo tiene que estar al menos un ${TARGET_MIN_PCT} % por encima del precio`);
    return { action: "comprar", pair: c.pair, stop: d.stop, target: d.target };
  }
  if (!ctx.holding) return reject("No tiene posición que vender o mantener");
  if (d.action === "vender") return { action: "vender" };
  // Mantener: puede subir el stop (nunca bajarlo) y mover el objetivo.
  const px = ctx.price(ctx.holding.pair) ?? ctx.holding.entry;
  const stop = d.stop > ctx.holding.stop && d.stop < px ? d.stop : null;
  const target = d.target > px ? d.target : null;
  return { action: "mantener", stop, target };
}

/** Cantidad para entrar con todo el efectivo, dejando margen para comisión y deslizamiento. */
export function allInQuantity(cash: number, price: number, cost: { commissionPct: number; slippageBps: number }) {
  if (!(cash > 0 && price > 0)) return 0;
  const unit = price * (1 + cost.slippageBps / 10_000) * (1 + cost.commissionPct / 100);
  return Math.floor(((cash * 0.995) / unit) * 1e6) / 1e6;
}
