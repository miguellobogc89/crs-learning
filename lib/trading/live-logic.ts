// lib/trading/live-logic.ts
// Reglas puras del precio en directo: qué vela del proveedor es la de la sesión de hoy y cuándo
// el precio provisional manda sobre el último cierre guardado. Sin red ni base de datos.
import type { Candle } from "./types";

const madrid = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")), weekday: get("weekday") };
};

/** La Bolsa de Madrid abre a las 9:00; se deja un margen para que el proveedor tenga la apertura. */
export const BOLSA_OPEN_MINUTES = 9 * 60 + 5;

/**
 * Vela de la sesión de hoy, si ya ha empezado: bolsa (día de Madrid, desde las 9:05, laborables)
 * o crypto (día UTC, desde las 00:00). null si hoy no hay sesión o aún no hay datos.
 */
export function todayBar(candles: Candle[], crypto: boolean, now = new Date()): Candle | null {
  let day: string;
  if (crypto) {
    day = now.toISOString().slice(0, 10);
  } else {
    const m = madrid(now);
    if (m.weekday === "Sat" || m.weekday === "Sun" || m.minutes < BOLSA_OPEN_MINUTES) return null;
    day = m.day;
  }
  const t = Date.parse(`${day}T00:00:00Z`);
  const bar = candles.find((c) => c.t === t);
  return bar && bar.o > 0 && bar.c > 0 ? bar : null;
}

/** El precio en directo solo manda si es de un día posterior al último cierre guardado. */
export function preferLive(lastCandleDay: number | null, liveDay: number | null) {
  return liveDay !== null && (lastCandleDay === null || liveDay > lastCandleDay);
}

/**
 * ¿Se puede ejecutar ya una orden pendiente con la vela en directo?
 * Solo si es de una sesión posterior al día en que se creó y aún no hay vela de cierre de esa sesión
 * (si la hay, la ejecuta el proceso diario con datos definitivos).
 */
export function canFillLive(createdDay: number, liveDay: number | null, firstStoredAfterCreated: number | null) {
  return liveDay !== null && liveDay > createdDay && firstStoredAfterCreated === null;
}
