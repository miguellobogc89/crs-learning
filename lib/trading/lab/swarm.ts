// lib/trading/lab/swarm.ts
// Simulación histórica de los ENJAMBRES (ideas de «ruido» del escáner, sin IA) con velas de 1 h. Puro:
// recibe las velas y devuelve lo que habría pasado. Supuestos prudentes:
//  - Escaneo cada hora (en vivo es cada 5 min), con la misma regla `noiseIdea` del escáner.
//  - Compra limitada que espera 2 h; si ya está en la parte baja, entra al momento (con comisión taker).
//  - En una misma vela, si toca stop y objetivo, cuenta el stop. Salida a las 8 h al cierre.
//  - Comisiones de Revolut X: 0 % maker (entrada limitada y venta en el objetivo), 0,09 % taker (stop, tiempo).
//  - Freno: no abre nada si Bitcoin cae más de un 3 % en 24 h. 10 % del dinero por operación, 10 huecos.
import { noiseIdea } from "../carta";

export type HBar = { t: number; o: number; h: number; l: number; c: number };
export type SwarmVariant = { key: string; name: string; coins?: string[]; targetFraction?: number };
type Pos = { base: string; qty: number; entry: number; stop: number; target: number; openedAt: number; cost: number };
type Order = { base: string; entry: number; stop: number; target: number; until: number; budget: number };

const HOUR = 3_600_000;
const TAKER = 0.0009;
const SLOTS = 10;
const SIZE = 0.1;
const MAX_HOLD = 8;
const ENTRY_WAIT = 2;

export function simulateSwarm(series: Map<string, HBar[]>, btc: HBar[], variant: SwarmVariant, from: number, startCash = 1000) {
  // Índice por hora de cada moneda.
  const idx = new Map<string, Map<number, number>>();
  for (const [b, bars] of series) idx.set(b, new Map(bars.map((x, i) => [x.t, i])));
  const btcIdx = new Map(btc.map((x, i) => [x.t, i]));
  const hours = btc.filter((x) => x.t >= from).map((x) => x.t);
  const coins = [...series.keys()].filter((b) => !variant.coins || variant.coins.includes(b));
  let cash = startCash;
  let pos: Pos[] = [];
  let orders: Order[] = [];
  const trades: { base: string; pct: number; exit: "objetivo" | "stop" | "tiempo"; at: number }[] = [];
  let peak = startCash, maxDd = 0;
  const monthly = new Map<string, { start: number; end: number }>();
  const close = (p: Pos, price: number, fee: number, exit: "objetivo" | "stop" | "tiempo", at: number) => {
    const got = p.qty * price * (1 - fee);
    cash += got;
    trades.push({ base: p.base, pct: (got / p.cost - 1) * 100, exit, at });
  };
  const barAt = (b: string, t: number) => {
    const i = idx.get(b)?.get(t);
    return i === undefined ? null : series.get(b)![i];
  };

  for (const t of hours) {
    // 1) Posiciones abiertas con la vela de esta hora.
    const keep: Pos[] = [];
    for (const p of pos) {
      const bar = barAt(p.base, t);
      if (!bar) { keep.push(p); continue; }
      if (bar.l <= p.stop) close(p, Math.min(p.stop, bar.o), TAKER, "stop", t);
      else if (bar.h >= p.target) close(p, Math.max(p.target, bar.o), 0, "objetivo", t);
      else if ((t + HOUR - p.openedAt) / HOUR >= MAX_HOLD) close(p, bar.c, TAKER, "tiempo", t);
      else keep.push(p);
    }
    pos = keep;
    // 2) Órdenes que esperan: se llenan si la vela baja a su precio (si también rompe el stop, fallo).
    const waiting: Order[] = [];
    for (const o of orders) {
      const bar = barAt(o.base, t);
      if (bar && bar.l <= o.entry) {
        const qty = o.budget / o.entry;
        const p: Pos = { base: o.base, qty, entry: o.entry, stop: o.stop, target: o.target, openedAt: t, cost: o.budget };
        if (bar.l <= o.stop) close(p, o.stop, TAKER, "stop", t);
        else pos.push(p);
      } else if (t + HOUR < o.until) waiting.push(o);
      else cash += o.budget; // caduca: se libera el dinero reservado
    }
    orders = waiting;
    // Valor de la cartera al cierre de la hora.
    let equity = cash + orders.reduce((s, o) => s + o.budget, 0);
    for (const p of pos) equity += p.qty * (barAt(p.base, t)?.c ?? p.entry);
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
    const m = new Date(t).toISOString().slice(0, 7);
    const mm = monthly.get(m);
    if (!mm) monthly.set(m, { start: equity, end: equity });
    else mm.end = equity;
    // 3) Escáner al cierre de la hora.
    const bi = btcIdx.get(t);
    if (bi === undefined || bi < 24) continue;
    if ((btc[bi].c / btc[bi - 24].c - 1) * 100 < -3) continue;
    const busy = new Set([...pos.map((p) => p.base), ...orders.map((o) => o.base)]);
    for (const b of coins) {
      if (pos.length + orders.length >= SLOTS) break;
      if (busy.has(b)) continue;
      const i = idx.get(b)?.get(t);
      if (i === undefined || i < 24) continue;
      const bars = series.get(b)!.slice(i - 23, i + 1);
      const price = bars[bars.length - 1].c;
      const r = noiseIdea(bars, price);
      if (!r) continue;
      const target = variant.targetFraction ? r.entry + (r.target - r.entry) * variant.targetFraction : r.target;
      const budget = Math.min(cash, equity * SIZE);
      if (budget < 10) break;
      cash -= budget;
      if (r.entry >= price) {
        // Ya en la parte baja: compra al momento (taker).
        pos.push({ base: b, qty: (budget * (1 - TAKER)) / price, entry: price, stop: r.invalidation, target, openedAt: t + HOUR, cost: budget });
      } else orders.push({ base: b, entry: r.entry, stop: r.invalidation, target, until: t + HOUR + ENTRY_WAIT * HOUR, budget });
    }
  }
  // Cierre final al último precio.
  const last = hours[hours.length - 1];
  for (const p of pos) close(p, barAt(p.base, last)?.c ?? p.entry, TAKER, "tiempo", last);
  for (const o of orders) cash += o.budget;
  const wins = trades.filter((x) => x.pct > 0);
  const losses = trades.filter((x) => x.pct <= 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    variant: variant.name,
    final: r2(cash),
    returnPct: r2((cash / startCash - 1) * 100),
    maxDrawdownPct: r2(maxDd * 100),
    trades: trades.length,
    winRatePct: r2((wins.length / Math.max(1, trades.length)) * 100),
    avgWinPct: r2(avg(wins.map((x) => x.pct))),
    avgLossPct: r2(avg(losses.map((x) => x.pct))),
    exits: { objetivo: trades.filter((x) => x.exit === "objetivo").length, stop: trades.filter((x) => x.exit === "stop").length, tiempo: trades.filter((x) => x.exit === "tiempo").length },
    monthly: [...monthly.entries()].map(([m, v]) => ({ m, pct: r2((v.end / v.start - 1) * 100) })),
  };
}
