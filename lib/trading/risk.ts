// lib/trading/risk.ts
// Costes de operar y tamaño de posición por riesgo fijo.
import type { Direction } from "./types";

export type CostModel = {
  /** Comisión por operación, en % del efectivo negociado. */
  commissionPct: number;
  /** Comisión mínima por operación, en euros. */
  commissionMin: number;
  /** Deslizamiento: lo que se pierde respecto al precio teórico, en puntos básicos. */
  slippageBps: number;
};

export const DEFAULT_COSTS: CostModel = { commissionPct: 0.1, commissionMin: 3, slippageBps: 5 };

export function commission(notional: number, cost: CostModel) {
  if (notional <= 0) return 0;
  return Math.max(cost.commissionMin, (notional * cost.commissionPct) / 100);
}

/** Precio efectivo de una orden tras el deslizamiento. `side` es la dirección de esa orden concreta. */
export function slipped(price: number, side: "buy" | "sell", cost: CostModel) {
  const k = cost.slippageBps / 10_000;
  return side === "buy" ? price * (1 + k) : price * (1 - k);
}

export const openSide = (d: Direction): "buy" | "sell" => (d === "long" ? "buy" : "sell");
export const closeSide = (d: Direction): "buy" | "sell" => (d === "long" ? "sell" : "buy");

export type SizingInput = {
  /** Valor total de la cartera (efectivo + posiciones). */
  equity: number;
  /** Efectivo disponible. */
  cash: number;
  riskPct: number;
  maxPositionPct: number;
  entry: number;
  stop: number;
  cost: CostModel;
};

export type Sizing = {
  quantity: number;
  notional: number;
  riskAmount: number;
  riskPerShare: number;
  commission: number;
  /** Qué ha limitado el tamaño. */
  limitedBy: "riesgo" | "tamaño máximo" | "efectivo" | null;
};

export function positionSize(s: SizingInput): Sizing {
  const riskPerShare = Math.abs(s.entry - s.stop);
  const empty: Sizing = { quantity: 0, notional: 0, riskAmount: 0, riskPerShare, commission: 0, limitedBy: null };
  if (!(riskPerShare > 0) || !(s.entry > 0) || s.equity <= 0) return empty;
  const budgetRisk = (s.equity * s.riskPct) / 100;
  let qty = Math.floor(budgetRisk / riskPerShare);
  let limitedBy: Sizing["limitedBy"] = "riesgo";
  const maxByPosition = Math.floor((s.equity * s.maxPositionPct) / 100 / s.entry);
  if (maxByPosition < qty) {
    qty = maxByPosition;
    limitedBy = "tamaño máximo";
  }
  // Deja margen para la comisión.
  const maxByCash = Math.floor(Math.max(0, s.cash - commission(s.cash, s.cost)) / s.entry);
  if (maxByCash < qty) {
    qty = maxByCash;
    limitedBy = "efectivo";
  }
  if (qty <= 0) return { ...empty, limitedBy };
  const notional = qty * s.entry;
  return {
    quantity: qty,
    notional,
    riskAmount: qty * riskPerShare,
    riskPerShare,
    commission: commission(notional, s.cost),
    limitedBy,
  };
}
