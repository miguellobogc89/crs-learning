// lib/trading/chip/phase.ts
// Fase del mercado según el detector de CAMALEÓN (B): ataque o defensa, cuánto lleva, cuánto suele
// durar y cuánto tiene que moverse Bitcoin para cambiar. Reglas puras (sin red): las prueban los tests.
const DAY = 86_400_000;

export type DailyClose = { t: number; c: number };
export type PhaseMode = "ataque" | "defensa";

export type MarketPhase = {
  mode: PhaseMode;
  /** Día (vela cerrada) en el que empezó la fase actual. */
  since: number;
  days: number;
  /** Mediana de lo que duraron las fases anteriores de este modo, en días. */
  typicalDays: number | null;
  /** De las fases de este modo que ya llevaban tanto como esta, mediana de lo que duraron DESPUÉS. */
  remainingDays: number | null;
  /** Cuántas fases de este modo hay en el historial (para saber cuánto fiarse). */
  samples: number;
  /** Precio que tendría que cruzar Bitcoin al cierre para cambiar de modo, y cuánto le falta desde `price`. */
  flipPrice: number;
  flipPct: number;
  price: number;
  checks: { ok: boolean; label: string; level: number }[];
  asOf: number;
};

function sma(closes: number[], n: number) {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Modo de cada día cerrado (mismas reglas que el detector B del laboratorio). null = sin historial suficiente. */
export function detectorModes(candles: DailyClose[]): (PhaseMode | null)[] {
  const closes = candles.map((k) => k.c);
  const m200 = sma(closes, 200);
  const m50 = sma(closes, 50);
  return closes.map((p, i) => {
    const a = m200[i];
    const b = m50[i];
    if (a === null || b === null || i < 10) return null;
    return p > a && p > b && p > closes[i - 10] ? "ataque" : "defensa";
  });
}

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Fase actual con las velas diarias cerradas de Bitcoin (de la más vieja a la más nueva) y, si lo hay,
 * el precio de ahora. El cambio de modo se decide al cierre del día: `flipPrice` es el cierre que lo provocaría
 * mañana (con las medias de hoy: es una aproximación, las medias se mueven poco en un día).
 */
export function marketPhase(candles: DailyClose[], livePrice: number | null = null): MarketPhase | null {
  const modes = detectorModes(candles);
  const last = candles.length - 1;
  const mode = modes[last];
  if (last < 10 || !mode) return null;

  // Fases: tramos seguidos del mismo modo.
  const phases: { mode: PhaseMode; start: number; len: number }[] = [];
  for (let i = 0; i <= last; i++) {
    const m = modes[i];
    if (!m) continue;
    const cur = phases[phases.length - 1];
    if (cur && cur.mode === m && cur.start + cur.len === i) cur.len++;
    else phases.push({ mode: m, start: i, len: 1 });
  }
  const current = phases[phases.length - 1];
  // La primera fase puede estar cortada por el principio del historial: no cuenta.
  const past = phases.slice(1, -1).filter((p) => p.mode === mode).map((p) => p.len);
  const longer = past.filter((len) => len > current.len).map((len) => len - current.len);

  const closes = candles.map((k) => k.c);
  const ma200 = sma(closes, 200)[last]!;
  const ma50 = sma(closes, 50)[last]!;
  // Mañana se comparará el cierre de hoy con el de hace 10 días desde mañana (= 9 velas atrás).
  const ref10 = closes[last - 9];
  const price = livePrice && livePrice > 0 ? livePrice : closes[last];
  const flipPrice = Math.max(ma200, ma50, ref10);
  return {
    mode,
    since: candles[current.start].t,
    days: current.len,
    typicalDays: median(past),
    remainingDays: median(longer),
    samples: past.length,
    flipPrice,
    flipPct: (flipPrice / price - 1) * 100,
    price,
    checks: [
      { ok: price > ma200, label: "Sobre su media de 200 días", level: ma200 },
      { ok: price > ma50, label: "Sobre su media de 50 días", level: ma50 },
      { ok: price > ref10, label: "Por encima de hace 10 días", level: ref10 },
    ],
    asOf: candles[last].t + DAY,
  };
}
