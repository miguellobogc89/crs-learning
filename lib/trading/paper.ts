// lib/trading/paper.ts
// Reglas de la cartera virtual, sin base de datos: ejecutar órdenes pendientes en la apertura
// y vigilar stop, objetivo, stop a break-even y salida por tiempo vela a vela.
import { closeSide, commission, openSide, slipped, type CostModel } from "./risk";
import type { Candle, Direction } from "./types";

export type PaperPosition = {
  direction: Direction;
  quantity: number;
  entryPrice: number;
  stop: number;
  initialStop: number;
  target: number;
  /** Fecha límite (ms) para salir por tiempo; null = sin límite. */
  maxHoldUntil: number | null;
  /** Mover el stop a la entrada cuando la ganancia latente llega a 1 R. */
  breakeven: boolean;
};

export type ExitReason = "stop" | "objetivo" | "tiempo" | "manual" | "break-even";

export type StepResult =
  | { kind: "hold"; stop: number }
  | { kind: "exit"; price: number; reason: ExitReason; stop: number };

/** Revisa una posición abierta con una vela nueva. */
export function stepPosition(p: PaperPosition, bar: Candle, cost: CostModel): StepResult {
  const long = p.direction === "long";
  const atBreakeven = Math.abs(p.stop - p.entryPrice) < 1e-9;
  const stopReason: ExitReason = atBreakeven ? "break-even" : "stop";
  const exit = (raw: number, reason: ExitReason): StepResult => ({
    kind: "exit",
    price: slipped(raw, closeSide(p.direction), cost),
    reason,
    stop: p.stop,
  });
  if (long ? bar.o <= p.stop : bar.o >= p.stop) return exit(bar.o, stopReason);
  if (long ? bar.o >= p.target : bar.o <= p.target) return exit(bar.o, "objetivo");
  if (long ? bar.l <= p.stop : bar.h >= p.stop) return exit(p.stop, stopReason);
  if (long ? bar.h >= p.target : bar.l <= p.target) return exit(p.target, "objetivo");
  if (p.maxHoldUntil !== null && bar.t >= p.maxHoldUntil) return exit(bar.c, "tiempo");
  let stop = p.stop;
  const oneR = Math.abs(p.entryPrice - p.initialStop);
  if (p.breakeven && oneR > 0 && (long ? bar.h - p.entryPrice >= oneR : p.entryPrice - bar.l >= oneR))
    stop = long ? Math.max(stop, p.entryPrice) : Math.min(stop, p.entryPrice);
  return { kind: "hold", stop };
}

export type FillResult =
  | { kind: "filled"; price: number; commission: number }
  | { kind: "cancelled"; reason: string };

/** Ejecuta una orden pendiente en la apertura de `bar`. */
export function fillAtOpen(
  o: { direction: Direction; quantity: number; stop: number; target: number },
  bar: Candle,
  cost: CostModel,
): FillResult {
  const long = o.direction === "long";
  if (long ? bar.o <= o.stop : bar.o >= o.stop)
    return { kind: "cancelled", reason: "La apertura ya estaba más allá del stop" };
  if (long ? bar.o >= o.target : bar.o <= o.target)
    return { kind: "cancelled", reason: "La apertura ya estaba más allá del objetivo" };
  const price = slipped(bar.o, openSide(o.direction), cost);
  return { kind: "filled", price, commission: commission(price * o.quantity, cost) };
}

/** Efecto en caja de abrir (signo +1) o cerrar (signo −1) una posición. */
export function cashDelta(direction: Direction, action: "open" | "close", quantity: number, price: number, fee: number) {
  const notional = quantity * price;
  const buy = (direction === "long") === (action === "open");
  return (buy ? -notional : notional) - fee;
}

/** Resultado neto de una posición cerrada (sin la comisión de apertura, que se pasa aparte). */
export function realizedPnl(direction: Direction, quantity: number, entry: number, exit: number) {
  return (direction === "long" ? exit - entry : entry - exit) * quantity;
}

/** Valor de mercado con signo para el cálculo del patrimonio (los cortos restan). */
export function marketValue(direction: Direction, quantity: number, price: number) {
  return (direction === "long" ? 1 : -1) * quantity * price;
}
