// lib/push/kinds.ts
// Qué avisos de Trading van al móvil (22/11/2026). Puro: lo usan el envío y los tests.

export type PushKind = "trades" | "stops" | "health";
export type PushPrefs = Record<PushKind, boolean>;

/** Por defecto: compras, ventas y fallos sí; los movimientos del stop no (pueden ser varios al día). */
export const DEFAULT_PREFS: PushPrefs = { trades: true, stops: false, health: true };

export const KIND_LABEL: Record<PushKind, string> = {
  trades: "Compras y ventas",
  stops: "Movimientos del stop",
  health: "Fallos (FARO, agentes, exchanges, copias)",
};

/** A qué interruptor pertenece un aviso de trading_notifications. */
export function pushKind(n: { key: string; level: string }): PushKind {
  if (n.level === "operacion") return n.key.startsWith("op:stop") ? "stops" : "trades";
  return "health";
}

/** Solo se envían avisos recientes: si el envío estuvo parado, al volver no llegan avisos viejos de golpe. */
export const PUSH_MAX_AGE_MS = 2 * 3_600_000;

/** Tras tantos fallos seguidos (sin ser 404/410) se deja de intentar con ese móvil. */
export const MAX_FAILURES = 20;
