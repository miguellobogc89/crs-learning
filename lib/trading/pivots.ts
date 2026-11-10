// lib/trading/pivots.ts
// Zigzag adaptativo: un máximo o mínimo cuenta como pivote cuando el precio gira desde él
// al menos max(minPct · precio, atrMult · ATR). Es un algoritmo en línea: cada pivote guarda
// en qué vela quedó confirmado, así el backtest nunca usa información del futuro.
import { atr, atrAt } from "./indicators";
import type { Candle, Pivot } from "./types";

export type ZigzagOptions = { atrMult?: number; minPct?: number; atrPeriod?: number };

export function zigzag(c: Candle[], opts: ZigzagOptions = {}): Pivot[] {
  const atrMult = opts.atrMult ?? 1.8;
  const minPct = opts.minPct ?? 0.025;
  const a = atr(c, opts.atrPeriod ?? 14);
  const pivots: Pivot[] = [];
  if (c.length < 3) return pivots;

  let dir: 0 | 1 | -1 = 0;
  let ext = 0;
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < c.length; i++) {
    const thr = Math.max(minPct * c[i].c, atrMult * atrAt(a, c, i));
    if (dir === 0) {
      if (c[i].h >= c[hi].h) hi = i;
      if (c[i].l <= c[lo].l) lo = i;
      if (hi < i && c[hi].h - c[i].l >= thr) {
        pivots.push({ i: hi, price: c[hi].h, kind: "H", confirmedAt: i });
        dir = -1;
        ext = i;
      } else if (lo < i && c[i].h - c[lo].l >= thr) {
        pivots.push({ i: lo, price: c[lo].l, kind: "L", confirmedAt: i });
        dir = 1;
        ext = i;
      }
      continue;
    }
    if (dir === 1) {
      if (c[i].h >= c[ext].h) ext = i;
      else if (c[ext].h - c[i].l >= thr) {
        pivots.push({ i: ext, price: c[ext].h, kind: "H", confirmedAt: i });
        dir = -1;
        ext = i;
      }
    } else {
      if (c[i].l <= c[ext].l) ext = i;
      else if (c[i].h - c[ext].l >= thr) {
        pivots.push({ i: ext, price: c[ext].l, kind: "L", confirmedAt: i });
        dir = 1;
        ext = i;
      }
    }
  }
  return pivots;
}

/** Pivotes conocidos al cierre de la vela `at`. */
export function pivotsKnownAt(pivots: Pivot[], at: number) {
  let n = 0;
  while (n < pivots.length && pivots[n].confirmedAt <= at) n++;
  return pivots.slice(0, n);
}
