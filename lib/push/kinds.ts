// lib/push/kinds.ts
// Qué avisos de Trading van al móvil (22/11/2026). Puro: lo usan el envío y los tests.

/** «health» (fallos de FARO, agentes, exchanges) solo se ve en la campana: no se manda al móvil. */
export type PushKind = "trades" | "stops" | "agents" | "health";
/** Interruptores de cada móvil. */
export type PushPrefs = Record<Exclude<PushKind, "health">, boolean>;

/** Por defecto: compras, ventas y primeras operaciones sí; los movimientos del stop no (pueden ser varios al día). */
export const DEFAULT_PREFS: PushPrefs = { trades: true, stops: false, agents: true };

export const KIND_LABEL: Record<keyof PushPrefs, string> = {
  trades: "Compras y ventas",
  stops: "Cambios de stop",
  agents: "Primera operación de un agente",
};

/** A qué interruptor pertenece un aviso de trading_notifications. */
export function pushKind(n: { key: string; level: string }): PushKind {
  if (n.key.startsWith("agente:primera:")) return "agents";
  if (n.level === "operacion") return n.key.startsWith("op:stop") ? "stops" : "trades";
  return "health";
}

/** Solo se envían avisos recientes: si el envío estuvo parado, al volver no llegan avisos viejos de golpe. */
export const PUSH_MAX_AGE_MS = 2 * 3_600_000;

/** Tras tantos fallos seguidos (sin ser 404/410) se deja de intentar con ese móvil. */
export const MAX_FAILURES = 20;
