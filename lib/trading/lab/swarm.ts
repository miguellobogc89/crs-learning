// lib/trading/lab/swarm.ts
// Simulación histórica de los ENJAMBRES (ideas de «ruido» del escáner, sin IA) con velas de 1 h. Puro:
// recibe las velas y devuelve lo que habría pasado. Supuestos prudentes:
//  - Escaneo cada hora (en vivo es cada 5 min), con la misma regla `noiseIdea` del escáner.
//  - Compra limitada que espera 2 h; si ya está en la parte baja, entra al momento (con comisión taker).
//  - En una misma vela, si toca stop y objetivo, cuenta el stop. Salida a las 8 h al cierre.
//  - Comisiones de Revolut X: 0 % maker (entrada limitada y venta en el objetivo), 0,09 % taker (stop, tiempo).
//  - Freno: no abre nada si Bitcoin cae más de un 3 % en 24 h. 10 % del dinero por operación, 10 huecos.
import { noiseIdea } from "../carta";
import { AVALANCHA, crashIdea } from "../kamikaze/avalancha";

export type HBar = { t: number; o: number; h: number; l: number; c: number };
export type SwarmVariant = {
  key: string;
  name: string;
  coins?: string[];
  targetFraction?: number;
  /** «short»: enjambre inverso. Al tocar la parte baja del rango, venta en corto (orden limitada al precio de
   * cierre: 0 % si se llena en la hora siguiente), stop a mitad del rango que luego baja detrás del precio a
   * medio rango de distancia, sin objetivo ni límite de tiempo.
   * «caida»: AVALANCHA (lib/trading/kamikaze/avalancha.ts). Corto a mercado al cierre de la hora en una caída brusca
   * que sigue (comisión de Kraken a mercado), stop que baja detrás del precio, sin objetivo ni límite de tiempo. */
  side?: "long" | "short" | "breakout" | "caida";
  /** Solo abre en esa fase del mercado (Detector B sobre Bitcoin diario). */
  regime?: "ataque" | "defensa";
  /** Costes de Kraken en los cortos: 0,02 % al entrar y 0,05 % al salir, y su funding histórico. */
  kraken?: boolean;
  /** Apalancamiento de los cortos (margen aislado: si llega a liquidación se pierde solo el margen de esa posición). */
  leverage?: number;
};
type Pos = { base: string; qty: number; entry: number; stop: number; target: number; openedAt: number; cost: number; short?: boolean; trail?: number; low?: number; high?: number };
type Order = { base: string; entry: number; stop: number; target: number; until: number; budget: number; trail?: number };

const HOUR = 3_600_000;
const TAKER = 0.0009;
const SLOTS = 10;
const SIZE = 0.1;
const MAX_HOLD = 8;
const ENTRY_WAIT = 2;

/** Detector B: ataque si Bitcoin (cierres diarios) está sobre su media de 200 y de 50 días y sobre el precio de hace 10 días. */
export function attackDays(daily: { t: number; c: number }[]) {
  const out = new Map<string, boolean>();
  for (let i = 200; i < daily.length; i++) {
    const avg = (n: number) => daily.slice(i - n + 1, i + 1).reduce((s, d) => s + d.c, 0) / n;
    const p = daily[i].c;
    // Vale para el día siguiente (se decide con el cierre de ayer: sin mirar el futuro).
    out.set(new Date(daily[i].t + 86_400_000).toISOString().slice(0, 10), p > avg(200) && p > avg(50) && p > daily[i - 10].c);
  }
  return out;
}

/** Funding por moneda: hora (ms) → tasa relativa del periodo (positiva: los largos pagan a los cortos). */
export type Funding = Map<string, Map<number, number>>;

export function simulateSwarm(series: Map<string, HBar[]>, btc: HBar[], variant: SwarmVariant, from: number, startCash = 1000, attack?: Map<string, boolean>, funding?: Funding) {
  const crash = variant.side === "caida";
  const short = variant.side === "short" || crash;
  // AVALANCHA: última salida de cada moneda (para no volver a entrar enseguida).
  const lastExit = new Map<string, number>();
  const kraken = !!variant.kraken && short;
  const exitFee = kraken ? 0.0005 : TAKER;
  const entryFee = kraken ? 0.0002 : 0;
  let fundingTotal = 0;
  const lev = short ? Math.max(1, variant.leverage ?? 1) : 1;
  let liquidations = 0;
  const breakout = variant.side === "breakout";
  // Índice por hora de cada moneda.
  const idx = new Map<string, Map<number, number>>();
  for (const [b, bars] of series) idx.set(b, new Map(bars.map((x, i) => [x.t, i])));
  const btcIdx = new Map(btc.map((x, i) => [x.t, i]));
  const hours = btc.filter((x) => x.t >= from).map((x) => x.t);
  const coins = [...series.keys()].filter((b) => !variant.coins || variant.coins.includes(b));
  let cash = startCash;
  let pos: Pos[] = [];
  let orders: Order[] = [];
  const trades: { base: string; pct: number; exit: "objetivo" | "stop" | "tiempo"; at: number; phase: "ataque" | "defensa" }[] = [];
  let peak = startCash, maxDd = 0;
  const monthly = new Map<string, { start: number; end: number }>();
  const close = (p: Pos, price: number, fee: number, exit: "objetivo" | "stop" | "tiempo", at: number) => {
    // Corto: se recupera la garantía más (venta − recompra) menos la comisión de recompra.
    const got = p.short ? Math.max(0, p.cost + p.qty * (p.entry - price) - p.qty * price * fee) : p.qty * price * (1 - fee);
    cash += got;
    if (crash) lastExit.set(p.base, at);
    trades.push({ base: p.base, pct: (got / p.cost - 1) * 100, exit, at, phase: attack?.get(new Date(p.openedAt).toISOString().slice(0, 10)) ? "ataque" : "defensa" });
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
      if (p.short) {
        // Stop por encima; primero se mira si saltó con el máximo de la vela, luego se baja con el mínimo.
        // Funding de la hora: un corto cobra si la tasa es positiva y paga si es negativa.
        const fr = kraken ? funding?.get(p.base)?.get(t) : undefined;
        if (fr !== undefined) {
          const f = p.qty * bar.o * fr;
          cash += f;
          fundingTotal += f;
        }
        // Liquidación (margen aislado): subida de ~1/apalancamiento menos el margen de mantenimiento (0,5 %).
        const liq = lev > 1 ? p.entry * (1 + 1 / lev - 0.005) : Infinity;
        if (liq < p.stop && bar.h >= liq) {
          liquidations++;
          close(p, liq, exitFee, "stop", t);
        } else if (bar.h >= p.stop) close(p, Math.max(p.stop, bar.o), exitFee, "stop", t);
        else {
          p.low = Math.min(p.low ?? p.entry, bar.l);
          p.stop = Math.min(p.stop, p.low + p.trail!);
          keep.push(p);
        }
        continue;
      }
      if (p.trail) {
        // Rupturas: stop que sube detrás del máximo alcanzado; sin objetivo ni límite de tiempo.
        if (bar.l <= p.stop) close(p, Math.min(p.stop, bar.o), TAKER, "stop", t);
        else {
          p.high = Math.max(p.high ?? p.entry, bar.h);
          p.stop = Math.max(p.stop, p.high - p.trail);
          keep.push(p);
        }
        continue;
      }
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
      if (short) {
        if (bar && bar.h >= o.entry) {
          const p: Pos = { base: o.base, qty: (o.budget * lev * (1 - entryFee)) / o.entry, entry: o.entry, stop: o.stop, target: 0, openedAt: t, cost: o.budget, short: true, trail: o.target, low: o.entry };
          if (bar.h >= o.stop) close(p, o.stop, exitFee, "stop", t);
          else pos.push(p);
        } else cash += o.budget; // no se llenó en su hora: se cancela
        continue;
      }
      if (bar && bar.l <= o.entry) {
        const qty = o.budget / o.entry;
        const p: Pos = { base: o.base, qty, entry: o.entry, stop: o.stop, target: o.trail ? Infinity : o.target, openedAt: t, cost: o.budget, trail: o.trail, high: o.entry };
        if (bar.l <= o.stop) close(p, o.stop, TAKER, "stop", t);
        else pos.push(p);
      } else if (t + HOUR < o.until) waiting.push(o);
      else cash += o.budget; // caduca: se libera el dinero reservado
    }
    orders = waiting;
    // Valor de la cartera al cierre de la hora.
    let equity = cash + orders.reduce((s, o) => s + o.budget, 0);
    for (const p of pos) {
      const c = barAt(p.base, t)?.c ?? p.entry;
      equity += p.short ? Math.max(0, p.cost + p.qty * (p.entry - c)) : p.qty * c;
    }
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
    const m = new Date(t).toISOString().slice(0, 7);
    const mm = monthly.get(m);
    if (!mm) monthly.set(m, { start: equity, end: equity });
    else mm.end = equity;
    // 3) Escáner al cierre de la hora.
    const bi = btcIdx.get(t);
    if (bi === undefined || bi < 24) continue;
    if (!short && (btc[bi].c / btc[bi - 24].c - 1) * 100 < -3) continue;
    if (variant.regime && attack) {
      const on = attack.get(new Date(t).toISOString().slice(0, 10));
      if (on === undefined || (variant.regime === "ataque") !== on) continue;
    }
    const busy = new Set([...pos.map((p) => p.base), ...orders.map((o) => o.base)]);
    for (const b of coins) {
      if (pos.length + orders.length >= SLOTS) break;
      if (busy.has(b)) continue;
      const i = idx.get(b)?.get(t);
      if (i === undefined || i < 24) continue;
      if (crash) {
        const left = lastExit.get(b);
        if (left !== undefined && t - left < AVALANCHA.cooldownHours * HOUR) continue;
        const r = crashIdea(series.get(b)!.slice(i - 24, i + 1), (btc[bi].c / btc[bi - 24].c - 1) * 100);
        if (!r) continue;
        const budget = Math.min(cash, equity * SIZE);
        if (budget < 10) break;
        cash -= budget;
        // A mercado al cierre de la hora (comisión de taker); se vigila desde la hora siguiente.
        pos.push({ base: b, qty: (budget * lev * (1 - exitFee)) / r.entry, entry: r.entry, stop: r.stop, target: 0, openedAt: t + HOUR, cost: budget, short: true, trail: r.trail, low: r.entry });
        continue;
      }
      if (breakout) {
        // Rango de las 24 h anteriores (sin la vela de ahora) y cierre por encima de su techo.
        if (i < 25) continue;
        const prev = series.get(b)!.slice(i - 24, i);
        const rp = noiseIdea(prev, prev[prev.length - 1].c, 0);
        if (!rp) continue;
        const w = (rp.target - rp.invalidation) / 1.1;
        const hi = rp.invalidation + 0.3 * w + w;
        if (!(series.get(b)![i].c > hi)) continue;
        const budget = Math.min(cash, equity * SIZE);
        if (budget < 10) break;
        cash -= budget;
        orders.push({ base: b, entry: hi, stop: hi - 0.25 * w, target: Infinity, until: t + HOUR + ENTRY_WAIT * HOUR, budget, trail: 0.5 * w });
        continue;
      }
      const bars = series.get(b)!.slice(i - 23, i + 1);
      const price = bars[bars.length - 1].c;
      const r = noiseIdea(bars, price);
      if (!r) continue;
      const budget = Math.min(cash, equity * SIZE);
      if (budget < 10) break;
      if (short) {
        // Solo cuando ya está en la parte baja del rango: corto con orden limitada al cierre (maker).
        if (r.entry < price) continue;
        const w = (r.target - r.invalidation) / 1.1; // ancho del rango (objetivo − stop = 1,1 rangos)
        const lo = r.invalidation + 0.3 * w;
        cash -= budget;
        orders.push({ base: b, entry: price, stop: lo + 0.5 * w, target: 0.5 * w, until: t + 2 * HOUR, budget });
        continue;
      }
      const target = variant.targetFraction ? r.entry + (r.target - r.entry) * variant.targetFraction : r.target;
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
    fundingEur: r2(fundingTotal),
    leverage: lev,
    liquidations,
    byPhase: (["ataque", "defensa"] as const).map((ph) => {
      const xs = trades.filter((x) => x.phase === ph);
      return { phase: ph, trades: xs.length, winRatePct: r2((xs.filter((x) => x.pct > 0).length / Math.max(1, xs.length)) * 100), avgPct: r2(avg(xs.map((x) => x.pct))) };
    }),
    exits: { objetivo: trades.filter((x) => x.exit === "objetivo").length, stop: trades.filter((x) => x.exit === "stop").length, tiempo: trades.filter((x) => x.exit === "tiempo").length },
    monthly: [...monthly.entries()].map(([m, v]) => ({ m, pct: r2((v.end / v.start - 1) * 100) })),
  };
}
