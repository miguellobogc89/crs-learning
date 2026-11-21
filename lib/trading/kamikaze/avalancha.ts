// lib/trading/kamikaze/avalancha.ts
// AVALANCHA (21/11/2026): cortos en caídas bruscas. Puro: lo usan el agente en vivo y el laboratorio, así lo que
// se simula es exactamente lo que se opera.
//
// ENJAMBRE solo entra cuando una moneda llevaba un día tranquila y pierde el suelo de su rango; en una caída fuerte
// y seguida se queda fuera (el día ya tiene tendencia). AVALANCHA cubre ese hueco: se sube a la caída cuando ya está
// en marcha y es de todo el mercado.
//  - Con Bitcoin cayendo al menos un 2 % en 24 h (la caída es del mercado, no de una moneda suelta).
//  - La moneda ha caído al menos un 4 % en 24 h, pero no más de un 15 % (después de tanto suele rebotar fuerte).
//  - La última vela de 1 h cierra por debajo del mínimo de las 24 h anteriores: la caída sigue, no se ha frenado.
//  - Stop a 1,5 veces el movimiento medio de una hora por encima de la entrada, y baja detrás del precio a esa misma
//    distancia. Sin objetivo ni plazo: el stop es la salida.

export const AVALANCHA = {
  /** Caída mínima de Bitcoin en 24 h (%). */
  btcDropPct: 2,
  /** Caída mínima de la moneda en 24 h (%). */
  minDropPct: 4,
  /** Caída máxima de la moneda en 24 h (%): más allá, demasiado tarde. */
  maxDropPct: 15,
  /** Distancia del stop, en movimientos medios de 1 h. */
  atrMult: 1.5,
  /** Horas sin volver a entrar en una moneda tras cerrar un corto en ella. */
  cooldownHours: 6,
};

type Bar = { h: number; l: number; c: number };

/**
 * `bars`: las 25 últimas velas de 1 h ya cerradas (la última es la de ahora). `btc24hPct`: cambio de Bitcoin en
 * 24 h (en %, negativo si cae). Devuelve el stop y la distancia a la que baja detrás del precio, o null.
 */
export function crashIdea(bars: Bar[], btc24hPct: number | null, p = AVALANCHA) {
  if (bars.length < 25 || btc24hPct === null || !(btc24hPct <= -p.btcDropPct)) return null;
  const w = bars.slice(-25);
  const last = w[24];
  const before = w.slice(0, 24);
  const ref = before[0].c;
  if (!(ref > 0 && last.c > 0)) return null;
  const drop = (1 - last.c / ref) * 100;
  if (drop < p.minDropPct || drop > p.maxDropPct) return null;
  const prevLow = Math.min(...before.map((b) => b.l));
  if (!(last.c < prevLow)) return null;
  const atr = w.slice(-24).reduce((s, b) => s + (b.h - b.l), 0) / 24;
  if (!(atr > 0)) return null;
  const trail = p.atrMult * atr;
  return { entry: last.c, stop: last.c + trail, trail, dropPct: drop };
}
