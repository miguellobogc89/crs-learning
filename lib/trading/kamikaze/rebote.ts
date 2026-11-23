// lib/trading/kamikaze/rebote.ts
// Corto en el rebote de una caída (22/11/2026, en laboratorio). Puro: lo usa la simulación y, si se aprueba, el
// agente en vivo.
//
// En defensa las monedas no caen en línea recta: bajan, rebotan unos días y vuelven a caer. AVALANCHA entraba en
// plena caída (el peor precio) y el rebote la echaba; esta regla espera justo a ese rebote:
//  1. Tendencia bajista: el precio está por debajo de su media de 20 días (480 velas de 1 h).
//  2. Rebote: desde el mínimo de los últimos 3 días ha subido entre `minBouncePct` y `maxBouncePct`, sin recuperar
//     la media, y el máximo del rebote es de las últimas 24 h.
//  3. Se agota: la vela de ahora cierra por debajo del mínimo de la anterior, todavía en la mitad alta del rebote.
//  Stop justo encima del máximo del rebote; objetivo, el mínimo de antes del rebote.

export const REBOTE = {
  minBouncePct: 5,
  maxBouncePct: 10,
  /** Velas de 1 h de la media (20 días). */
  maPeriod: 480,
  /** Dónde se busca el mínimo de antes del rebote (3 días). */
  lowLookback: 72,
  /** El máximo del rebote tiene que ser reciente (24 h). */
  peakWithin: 24,
  /** Margen del stop sobre el máximo del rebote. */
  stopBufferPct: 0.2,
  /** Horas sin volver a una moneda tras cerrar un corto en ella. */
  cooldownHours: 12,
};
export type ReboteParams = typeof REBOTE;

type Bar = { h: number; l: number; c: number };

/** `bars`: velas de 1 h ya cerradas (la última es la de ahora), al menos `maPeriod`. Devuelve el corto o null. */
export function bounceShortIdea(bars: Bar[], p: ReboteParams = REBOTE) {
  const n = bars.length;
  if (n < p.maPeriod || n < p.lowLookback + 2) return null;
  const last = bars[n - 1];
  const prev = bars[n - 2];
  let sum = 0;
  for (let i = n - p.maPeriod; i < n; i++) sum += bars[i].c;
  const ma = sum / p.maPeriod;
  if (!(last.c < ma)) return null;
  // Mínimo de los últimos 3 días (sin la vela de ahora) y máximo del rebote desde entonces.
  const start = n - 1 - p.lowLookback;
  let lowIdx = start;
  for (let i = start; i < n - 1; i++) if (bars[i].l < bars[lowIdx].l) lowIdx = i;
  const low = bars[lowIdx].l;
  let peakIdx = -1;
  for (let i = lowIdx + 1; i < n - 1; i++) if (peakIdx < 0 || bars[i].h > bars[peakIdx].h) peakIdx = i;
  if (peakIdx < 0 || !(low > 0)) return null;
  const peak = bars[peakIdx].h;
  const bounce = (peak / low - 1) * 100;
  if (bounce < p.minBouncePct || bounce > p.maxBouncePct) return null;
  if (peak >= ma) return null; // recuperó la media: el rebote ya no es de una caída
  if (n - 1 - peakIdx > p.peakWithin) return null;
  // Se gira: cierra por debajo del mínimo de la vela anterior, aún en la mitad alta del rebote.
  if (!(last.c < prev.l)) return null;
  if (last.c < low + 0.5 * (peak - low)) return null;
  const stop = peak * (1 + p.stopBufferPct / 100);
  if (!(stop > last.c)) return null;
  return { entry: last.c, stop, target: low, bouncePct: bounce, risk: stop - last.c };
}
