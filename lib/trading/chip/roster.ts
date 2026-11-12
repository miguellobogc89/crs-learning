// lib/trading/chip/roster.ts
// Agentes de dos modos («cambian el chip»): reglas fijas, sin IA, probadas en el laboratorio
// (scripts/trading/lab.mjs). Puro: lo usan el servidor, los tests y la interfaz.
import type { AgentRules } from "../agents/roster";

export type ChipDef = {
  key: string;
  name: string;
  profile: "arriesgado";
  tagline: string;
  /** Clave de la estrategia del laboratorio que ejecuta. */
  strategy: string;
  capital: number;
  color: string;
  settings: {
    risk_per_trade_pct: number;
    max_position_pct: number;
    max_open_positions: number;
    commission_pct: number;
    commission_min: number;
    slippage_bps: number;
    breakeven: boolean;
  };
  rules: AgentRules;
};

export const CHIP_AGENTS: ChipDef[] = [
  {
    key: "camaleon",
    name: "CAMALEÓN-4",
    profile: "arriesgado",
    tagline: "Cambia el chip según el mercado: ataca con las crypto que rompen máximos cuando Bitcoin acompaña, y se pone a salvo en efectivo en cuanto se tuerce.",
    strategy: "chip-b-rupt",
    capital: 5000,
    color: "amber",
    // Como un exchange de crypto (Bitvavo): ~0,25 % por orden y algo de deslizamiento.
    settings: { commission_pct: 0.25, commission_min: 0, slippage_bps: 5, risk_per_trade_pct: 100, max_position_pct: 100, max_open_positions: 3, breakeven: false },
    rules: { maxBuys: 3, minConviction: 1, minRewardRisk: 1, buyInBearMarket: false },
  },
];

export const chipByKey = (key: string) => CHIP_AGENTS.find((c) => c.key === key) ?? null;
export const isChip = (key: unknown): key is string => typeof key === "string" && CHIP_AGENTS.some((c) => c.key === key);
