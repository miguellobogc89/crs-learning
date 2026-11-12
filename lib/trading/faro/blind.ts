// lib/trading/faro/blind.ts
// Prueba a ciegas de FARO: ¿sus ideas eligen mejor moneda que el azar o que una regla sin IA?
// Cada idea se compara con «gemelas»: misma hora, misma distancia a la invalidación y al objetivo y
// misma validez, pero en otra moneda. Reglas puras (sin red ni base de datos): las usan el script y los tests.
import type { Bar, Metrics, Ticker } from "../kamikaze/logic";
import { MIN_VOLUME_EUR, metricsOf, rank } from "../kamikaze/logic";
import type { KamikazeStyle } from "../kamikaze/roster";
import { scoreIdea } from "./logic";

const HOUR = 3_600_000;

export type PastIdea = { pair: string; kind: string; price: number; invalidation: number; target: number; createdAt: number; validUntil: number };

/** Estilo de kamikaze que toma cada tipo de idea (el mismo reparto que el tablón). */
export function styleOfKind(kind: string): KamikazeStyle {
  return kind === "rebote" ? "rebotes" : kind === "impulso" ? "impulso" : "rupturas";
}

/** Primera hora completa después de publicar la idea: desde ahí se puntúan FARO y sus gemelas (mismas velas). */
export const startHour = (t: number) => Math.ceil(t / HOUR) * HOUR;

/** Índice de la última vela horaria ya cerrada en el momento `t` (o -1). */
export function lastClosed(bars: Bar[], t: number) {
  let k = -1;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].t + HOUR <= t) k = i;
    else break;
  }
  return k;
}

/** Lo que veía FARO de un par en el momento `t`: resumen de 24 h y métricas de 3 días, con velas horarias. */
export function snapshotAt(pair: string, base: string, bars: Bar[], t: number): Metrics | null {
  const k = lastClosed(bars, t);
  if (k < 24) return null;
  const last24 = bars.slice(k - 23, k + 1);
  const price = bars[k].c;
  const open24 = last24[0].o;
  const ticker: Ticker = {
    pair,
    base,
    price,
    ch24h: open24 > 0 ? ((price - open24) / open24) * 100 : 0,
    high24h: Math.max(...last24.map((b) => b.h)),
    low24h: Math.min(...last24.map((b) => b.l)),
    volume24h: last24.reduce((s, b) => s + b.qv, 0),
  };
  return metricsOf(ticker, bars.slice(Math.max(0, k - 71), k + 1));
}

/** Resultado (neto de costes) de una idea con los mismos % de stop y objetivo, entrando a `entry`. */
export function twinResult(idea: PastIdea, entry: number, bars: Bar[]): number | null {
  if (!(entry > 0)) return null;
  const down = idea.invalidation / idea.price;
  const up = idea.target / idea.price;
  const s = scoreIdea(
    { price: entry, invalidation: entry * down, target: entry * up, createdAt: startHour(idea.createdAt), validUntil: idea.validUntil, best: null, worst: null },
    bars,
    idea.validUntil,
    null,
  );
  return s.resultPct;
}

export type IdeaComparison = { faro: number; mechanical: number | null; mechanicalPair: string | null; randomAvg: number; random: number[] };

/**
 * Compara una idea con sus gemelas: FARO (su moneda), la mejor de la lista sin IA para su estilo
 * (la misma criba que ve FARO) y todas las monedas líquidas de ese momento (el azar).
 */
export function compareIdea(idea: PastIdea, universe: { pair: string; base: string; bars: Bar[] }[]): IdeaComparison | null {
  const own = universe.find((u) => u.pair === idea.pair);
  if (!own) return null;
  // FARO entra igual que sus gemelas (cierre de la última hora antes de la idea): solo cambia la moneda.
  const ownSnap = snapshotAt(own.pair, own.base, own.bars, idea.createdAt);
  if (!ownSnap) return null;
  const faro = twinResult(idea, ownSnap.price, own.bars);
  if (faro === null) return null;
  const snaps: { m: Metrics; bars: Bar[] }[] = [];
  for (const u of universe) {
    const m = snapshotAt(u.pair, u.base, u.bars, idea.createdAt);
    if (m && m.volume24h >= MIN_VOLUME_EUR) snaps.push({ m, bars: u.bars });
  }
  const random: number[] = [];
  for (const s of snaps) {
    const r = twinResult(idea, s.m.price, s.bars);
    if (r !== null) random.push(r);
  }
  if (!random.length) return null;
  const top = rank(styleOfKind(idea.kind), snaps.map((s) => s.m), 1)[0];
  const topBars = top ? snaps.find((s) => s.m.pair === top.pair)?.bars : undefined;
  const mechanical = top && topBars ? twinResult(idea, top.price, topBars) : null;
  return { faro, mechanical, mechanicalPair: top?.pair ?? null, randomAvg: random.reduce((a, b) => a + b, 0) / random.length, random };
}

/**
 * ¿Cuántas veces el azar lo hace igual o mejor que FARO? Se elige una moneda al azar por idea y se
 * saca la media; se repite `n` veces. Cerca del 50 % = FARO no se distingue del azar; < 5 % = algo hay.
 */
export function luckShare(rows: IdeaComparison[], n = 2000, rand: () => number = Math.random) {
  if (!rows.length) return 1;
  const faro = rows.reduce((s, r) => s + r.faro, 0) / rows.length;
  let asGood = 0;
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (const r of rows) sum += r.random[Math.floor(rand() * r.random.length)];
    if (sum / rows.length >= faro) asGood++;
  }
  return asGood / n;
}
