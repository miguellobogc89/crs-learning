// lib/trading/carta.ts
// La carta: los tipos de oportunidad que publica el sistema y sus reglas comunes. Cada agente elige qué
// tipos coge (y con cuánto riesgo); las reglas de cada tipo (plazo máximo, orden, momento del mercado…)
// son las mismas para todos. Valores iniciales del 16/11/2026, a ajustar con lo que se mida.
// Puro: lo usan el servidor, la interfaz y los tests.

export type CartaKind = "impulso" | "noticia" | "ruptura" | "retroceso" | "ruido" | "tendencia";

export type CartaEntry = {
  label: string;
  /** Qué es, en una línea. */
  what: string;
  /** Plazo típico, en palabras. */
  horizon: string;
  /** «mercado»: se compra ya; «limitada»: se deja una orden a un precio por debajo y se espera. */
  order: "mercado" | "limitada";
  /** Pasado este tiempo desde la entrada, se vende aunque no haya tocado stop ni objetivo. null = sin límite. */
  maxHoldHours: number | null;
  /** Solo limitadas: cuánto espera la orden a que el precio baje a su nivel antes de cancelarse. */
  entryHours: number | null;
  /** Momento del mercado en que se publica. */
  regime: "ataque" | "cualquiera" | "tranquilo";
  /** Quién la detecta. */
  source: "FARO" | "Escáner";
  /** Si admite reforzar (comprar otra vez lo mismo) cuando se confirma pronto: en qué plazo y con qué ganancia. */
  refuerzo: boolean;
  refuerzoHours?: number;
  refuerzoGainPct?: number;
  /** Si solo tiene sentido con comisión cero en las órdenes que esperan (Revolut X). */
  zeroFeeOnly?: boolean;
};

export const CARTA: Record<CartaKind, CartaEntry> = {
  impulso: {
    label: "Impulso",
    what: "Algo que ya sube con fuerza y volumen.",
    horizon: "Horas",
    order: "mercado",
    // Las que aciertan llegan en <1 h la mitad y el 80 % en <2,4 h; las que caducan acaban en −1,3 % (11-16/11).
    maxHoldHours: 3,
    entryHours: null,
    regime: "ataque",
    source: "FARO",
    refuerzo: true,
    refuerzoHours: 1,
    refuerzoGainPct: 1.5,
  },
  noticia: {
    label: "Noticia",
    what: "Una noticia que puede mover el precio.",
    horizon: "Horas",
    order: "mercado",
    maxHoldHours: 6,
    entryHours: null,
    regime: "cualquiera",
    source: "FARO",
    refuerzo: false,
  },
  ruptura: {
    label: "Ruptura",
    what: "Rompe su máximo reciente.",
    horizon: "Horas a días",
    order: "mercado",
    // Las que aciertan llegan en 2,4 h la mitad y el 80 % en <4,7 h (11-16/11).
    maxHoldHours: 6,
    entryHours: null,
    regime: "ataque",
    source: "FARO",
    refuerzo: true,
    refuerzoHours: 2,
    refuerzoGainPct: 1.5,
  },
  retroceso: {
    label: "Retroceso",
    what: "Sube de fondo y se compra si baja a un soporte.",
    horizon: "Horas a días",
    order: "limitada",
    maxHoldHours: 48,
    entryHours: 6,
    regime: "ataque",
    source: "FARO",
    refuerzo: false,
  },
  ruido: {
    label: "Ruido",
    what: "Oscila en un rango estrecho: se compra abajo y se vende arriba.",
    horizon: "Horas",
    order: "limitada",
    maxHoldHours: 8,
    entryHours: 2,
    regime: "tranquilo",
    source: "Escáner",
    refuerzo: false,
    zeroFeeOnly: true,
  },
  tendencia: {
    label: "Tendencia larga",
    what: "Mercado en ataque y cierre por encima de su máximo de 20 días.",
    horizon: "Semanas",
    order: "mercado",
    maxHoldHours: null,
    entryHours: null,
    regime: "ataque",
    source: "Escáner",
    refuerzo: true,
    refuerzoHours: 72,
    refuerzoGainPct: 5,
  },
};

export const CARTA_KINDS = Object.keys(CARTA) as CartaKind[];
export const isCartaKind = (k: string): k is CartaKind => k in CARTA;
export const isLimitKind = (k: string) => isCartaKind(k) && CARTA[k].order === "limitada";

/** El objetivo tiene que cubrir al menos 5 veces la comisión de ida y vuelta del sitio más barato. */
export const FEE_MULTIPLE = 5;

export type Venue = { id: string; name: string; fees: { maker: number; taker: number } };

/**
 * Dónde sale más barata una oportunidad: la comisión de entrada (maker si es limitada, taker si es a
 * mercado) más la de salida al objetivo (maker: se deja una venta limitada en el objetivo).
 */
export function bestVenue(kind: CartaKind, venues: Venue[]): { venue: Venue; roundTripPct: number } | null {
  const order = CARTA[kind].order;
  const cost = (v: Venue) => (order === "limitada" ? v.fees.maker : v.fees.taker) + v.fees.maker;
  const list = venues.filter((v) => !CARTA[kind].zeroFeeOnly || v.fees.maker === 0).sort((a, b) => cost(a) - cost(b));
  return list[0] ? { venue: list[0], roundTripPct: cost(list[0]) } : null;
}

/** Ganancia mínima (en %) que debe tener el objetivo para que compense con esa comisión. */
export const minTargetPct = (roundTripPct: number) => Math.max(roundTripPct * FEE_MULTIPLE, 0.8);

/** Hasta cuándo vale una idea: el tiempo de entrar (limitadas) más el plazo máximo (o el que diga la IA, si es menor). */
export function ideaValidHours(kind: CartaKind, aiHours: number) {
  const c = CARTA[kind];
  const hold = c.maxHoldHours === null ? aiHours : Math.min(aiHours, c.maxHoldHours);
  return (c.entryHours ?? 0) + hold;
}

/**
 * Stop común tras reforzar, para que lo máximo que se pueda perder entre las dos compras sea lo que se
 * arriesgaba con la primera: q1·(e1 − S) + q2·(p − S) ≤ q1·(e1 − s1). null si no cabe por debajo del precio.
 */
export function refuerzoStop(o: { q1: number; entry: number; stop: number; q2: number; price: number }) {
  const risk = o.q1 * (o.entry - o.stop);
  const s = (o.q1 * o.entry + o.q2 * o.price - risk) / (o.q1 + o.q2);
  return s < o.price * 0.998 ? Math.max(s, o.stop) : null;
}

/**
 * Escáner de «ruido» (sin IA): en las últimas 24 velas de 1 h, un rango estrecho (1,5-6 %) sin tendencia
 * y el precio en su parte baja. Compra limitada cerca del suelo, venta en la parte alta y stop algo por
 * debajo del rango. null si no encaja o si el recorrido no compensa la comisión.
 */
export function noiseIdea(bars: { h: number; l: number; c: number }[], price: number, minTarget = 0.8) {
  const w = bars.slice(-24);
  if (w.length < 20 || !(price > 0)) return null;
  const hi = Math.max(...w.map((b) => b.h));
  const lo = Math.min(...w.map((b) => b.l));
  const mid = (hi + lo) / 2;
  const width = ((hi - lo) / mid) * 100;
  if (!(width >= 1.5 && width <= 6)) return null;
  // Sin tendencia: de punta a punta del día se ha movido menos de un tercio del rango.
  if (Math.abs(w[w.length - 1].c - w[0].c) > (hi - lo) / 3) return null;
  if ((price - lo) / (hi - lo) > 0.4) return null;
  // Si ya está más abajo que el nivel de compra, la orden va a su precio de ahora.
  const entry = Math.min(price, lo + 0.2 * (hi - lo));
  const target = hi - 0.2 * (hi - lo);
  const invalidation = lo - 0.3 * (hi - lo);
  if (!(entry > invalidation)) return null;
  if (((target - entry) / entry) * 100 < minTarget) return null;
  return { entry, target, invalidation, width };
}
