// lib/trading/mirror/logic.ts
// Copia de un agente en tu bróker: qué comprar y qué vender comparando sus posiciones abiertas con tus
// tramos. Puro (sin red ni base de datos): lo prueban los tests.
//
// Reglas:
// - Solo se copian entradas recientes (el agente entró hace menos de FRESH_MINUTES y después de que
//   empezaras a copiarle): llegar tarde a una subida es comprar más caro que él.
// - El importe es tu presupuesto × el peso que esa posición tiene en la cartera del agente (un kamikaze
//   que mete todo → todo tu presupuesto), sin pasar nunca de lo que queda libre del presupuesto.
// - Cuando la posición del agente deja de estar abierta, se vende tu tramo.

export const FRESH_MINUTES = 30;
/** Importe mínimo por orden en Binance (EUR). */
export const MIN_ORDER_EUR = 5;
/** Comisión estimada por lado (Binance spot sin BNB). */
export const FEE_PCT = 0.1;

export type SourcePosition = { id: string; symbol: string; quantity: number; price: number; openedAt: number };
export type MirrorLeg = { sourceId: string; status: string; amount: number | null };

export type MirrorPlan = {
  buys: { source: SourcePosition; amount: number }[];
  skips: { source: SourcePosition; reason: string }[];
  /** sourceId de los tramos abiertos cuya posición ya no está abierta en el agente. */
  sells: string[];
};

const HOLDING = ["abriendo", "abierta", "vendiendo"];

export function planMirror(input: {
  open: SourcePosition[];
  legs: MirrorLeg[];
  agentEquity: number;
  budget: number;
  startedAt: number;
  now: number;
}): MirrorPlan {
  const plan: MirrorPlan = { buys: [], skips: [], sells: [] };
  const known = new Set(input.legs.map((l) => l.sourceId));
  const openIds = new Set(input.open.map((p) => p.id));
  let committed = input.legs.filter((l) => HOLDING.includes(l.status)).reduce((s, l) => s + (l.amount ?? 0), 0);

  for (const l of input.legs) if (l.status === "abierta" && !openIds.has(l.sourceId)) plan.sells.push(l.sourceId);

  for (const p of [...input.open].sort((a, b) => a.openedAt - b.openedAt)) {
    if (known.has(p.id)) continue;
    if (!/-EUR$/.test(p.symbol)) {
      plan.skips.push({ source: p, reason: "No es cripto: en Binance solo se copia cripto" });
      continue;
    }
    if (p.openedAt < input.startedAt) {
      plan.skips.push({ source: p, reason: "Ya la tenía cuando empezaste a copiarle" });
      continue;
    }
    if (input.now - p.openedAt > FRESH_MINUTES * 60_000) {
      plan.skips.push({ source: p, reason: `Entró hace más de ${FRESH_MINUTES} min: se habría comprado tarde` });
      continue;
    }
    const weight = input.agentEquity > 0 ? Math.min(1, (p.quantity * p.price) / input.agentEquity) : 0;
    const amount = Math.floor(Math.min(input.budget * weight, input.budget - committed) * 100) / 100;
    if (amount < MIN_ORDER_EUR) {
      plan.skips.push({
        source: p,
        reason: input.budget - committed < MIN_ORDER_EUR ? "Tu presupuesto ya está invertido en otra posición" : `Le tocaban ${amount.toFixed(2)} €: menos del mínimo de Binance (${MIN_ORDER_EUR} €)`,
      });
      continue;
    }
    committed += amount;
    plan.buys.push({ source: p, amount });
  }
  return plan;
}

/** Cantidad redondeada hacia abajo al paso del par (Binance rechaza decimales de más). */
export function stepQuantity(amount: number, price: number, step: number | null) {
  if (!(price > 0) || !(amount > 0)) return 0;
  const q = amount / price;
  if (!step || !(step > 0)) return q;
  const dec = Math.max(0, Math.round(-Math.log10(step)));
  return Number((Math.floor(q / step + 1e-9) * step).toFixed(dec));
}

/** Resultado neto aproximado de un tramo (comisión estimada en la compra y en la venta). */
export function legResult(quantity: number, entry: number, exit: number) {
  const fees = (quantity * (entry + exit) * FEE_PCT) / 100;
  return quantity * (exit - entry) - fees;
}
