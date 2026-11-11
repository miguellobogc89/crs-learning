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

/**
 * ¿Se puede operar ya a precio de mercado? Crypto siempre; bolsa en días laborables de 9:30 a 17:30
 * (desde las 9:30 para que el proveedor ya tenga la apertura, que llega con ~15 min de retraso).
 */
export function marketOpenNow(market: "bolsa" | "crypto", now = new Date()) {
  if (market === "crypto") return true;
  const m = madrid(now);
  if (m.weekday === "Sat" || m.weekday === "Sun") return false;
  return m.minutes >= 9 * 60 + 30 && m.minutes < 17 * 60 + 30;
}

/**
 * Cada cuánto se reúne un agente: más a menudo con la bolsa abierta y menos fuera (solo crypto).
 * Configurable con TRADING_AGENT_MEETING_MINUTES y TRADING_AGENT_MEETING_MINUTES_OFF (0 = nunca).
 */
export function meetingIntervalMinutes(now = new Date(), env: Record<string, string | undefined> = process.env) {
  const n = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : d);
  return marketOpenNow("bolsa", now) ? n(env.TRADING_AGENT_MEETING_MINUTES, 60) : n(env.TRADING_AGENT_MEETING_MINUTES_OFF, 240);
}

/** ¿Le toca reunirse a un agente cuya última reunión fue en `lastAt`? */
export function meetingDue(lastAt: number | null, intervalMinutes: number, now = Date.now()) {
  if (intervalMinutes <= 0) return false;
  return lastAt === null || now - lastAt >= intervalMinutes * 60_000;
}
