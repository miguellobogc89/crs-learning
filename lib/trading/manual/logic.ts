// lib/trading/manual/logic.ts
// Mis operaciones (compras tuyas con dinero real): cuánto puedes ganar o perder y qué hacer en cada
// revisión con el precio de ahora. Puro (sin red ni base de datos): lo prueban los tests.

/** Comisión de Bitvavo por lado (taker), en %. */
export const MANUAL_FEE_PCT = 0.25;

/** Con `amount` € a `price`: lo que pierdes si toca el stop y lo que ganas si toca el objetivo (netos de comisiones). */
export function preview(amount: number, price: number, stop: number, target: number) {
  const q = amount / price;
  const fees = (exit: number) => (q * (price + exit) * MANUAL_FEE_PCT) / 100;
  const loss = q * (stop - price) - fees(stop);
  const gain = q * (target - price) - fees(target);
  return { loss, lossPct: (loss / amount) * 100, gain, gainPct: (gain / amount) * 100 };
}

/** Resultado neto (con comisiones) de vender `quantity` comprada a `entry` al precio `exit`. */
export const tradeResult = (quantity: number, entry: number, exit: number) => quantity * (exit - entry) - (quantity * (entry + exit) * MANUAL_FEE_PCT) / 100;

export type OpenTrade = { entry: number; stop: number; target: number; trail: boolean; trailing: boolean };
export type TradeStep = { sell: string } | { stop: number; trailing: boolean } | null;

/**
 * Qué hacer con el precio de ahora:
 * - toca el stop → vender;
 * - toca el objetivo → vender o, con «seguir si sube», el stop sube a mitad de camino entre la entrada
 *   y el objetivo y desde ahí sigue al precio a esa distancia (nunca baja).
 */
export function manualStep(t: OpenTrade, price: number): TradeStep {
  if (!(price > 0)) return null;
  if (price <= t.stop) return { sell: t.trailing ? "bajó al stop que había subido (ganancia asegurada)" : "tocó el stop" };
  if (!t.trail && price >= t.target) return { sell: "llegó al objetivo" };
  if (t.trail && (t.trailing || price >= t.target)) {
    const dist = Math.max(0.01, (t.target - t.entry) / 2 / t.target);
    const next = Math.max(price * (1 - dist), t.stop);
    if (next > t.stop || !t.trailing) return { stop: next, trailing: true };
  }
  return null;
}
