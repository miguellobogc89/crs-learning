// lib/trading/summary-logic.ts
// Cálculos del Resumen de Inicio (17/11/2026). Puro: lo usan el servidor y los tests.

/** Familias de agentes para ver de un vistazo cómo va cada enfoque. */
export const AGENT_GROUPS: { key: string; label: string; agents: string[] }[] = [
  { key: "defensa", label: "Defensa (cortos)", agents: ["enjambre-corto", "enjambre-x2", "enjambre-x3"] },
  { key: "enjambres", label: "Enjambres de ruido", agents: ["enjambre", "enjambre-grandes", "enjambre-rapido"] },
  { key: "riesgo", label: "Por riesgo", agents: ["roca", "brujula", "vertigo-10"] },
  { key: "reglas", label: "De reglas", agents: ["camaleon", "atlas"] },
];

export type AgentRow = { key: string; name: string; color: string; equity: number; returnPct: number; trades: number };
export type GroupRow = { key: string; label: string; returnPct: number; equity: number; agents: AgentRow[]; idle: number };

/** Por familia, solo los agentes que ya han operado; la rentabilidad del grupo es la media de la suya. */
export function agentGroups(rows: AgentRow[]): GroupRow[] {
  return AGENT_GROUPS.map((g) => {
    const mine = rows.filter((r) => g.agents.includes(r.key));
    const active = mine.filter((r) => r.trades > 0).sort((a, b) => b.returnPct - a.returnPct);
    return {
      key: g.key,
      label: g.label,
      returnPct: active.length ? active.reduce((s, r) => s + r.returnPct, 0) / active.length : 0,
      equity: active.reduce((s, r) => s + r.equity, 0),
      agents: active,
      idle: mine.length - active.length,
    };
  }).filter((g) => g.agents.length > 0);
}

/**
 * Coste aproximado de la IA en euros, si se configuró el precio del modelo (euros por millón de tokens de
 * entrada y de salida). Sin precio, null: se enseñan solo las llamadas y los tokens.
 */
export function aiCostEur(tokens: { input: number; output: number }, price: { input: number; output: number } | null) {
  if (!price) return null;
  return (tokens.input * price.input + tokens.output * price.output) / 1_000_000;
}
