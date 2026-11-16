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
  /**
   * Otro mercado con las mismas reglas: instrumentos de `market` y detector sobre `benchmark` (que, como
   * las de `exclude`, nunca se compra). Sin esto: las crypto y Bitcoin, como CAMALEÓN.
   */
  universe?: { market: string; benchmark: string; label: string; exclude: string[]; where: string };
};

export const CHIP_AGENTS: ChipDef[] = [
  {
    key: "camaleon",
    name: "CAMALEÓN",
    profile: "arriesgado",
    tagline: "Fase: con el mercado en ataque, compra las criptomonedas que rompen su máximo de 20 días; en defensa, se queda en efectivo.",
    strategy: "chip-b-rupt",
    // 1.000 €, como todos los agentes desde el 16/11/2026 (antes 5.000 €).
    capital: 1000,
    color: "amber",
    // Como un exchange de crypto (Bitvavo): ~0,25 % por orden y algo de deslizamiento.
    settings: { commission_pct: 0.25, commission_min: 0, slippage_bps: 5, risk_per_trade_pct: 100, max_position_pct: 100, max_open_positions: 3, breakeven: false },
    rules: { maxBuys: 3, minConviction: 1, minRewardRisk: 1, buyInBearMarket: false },
  },
  {
    // Las reglas de CAMALEÓN sobre las grandes de EE. UU. (16/11/2026): detector sobre el Nasdaq 100.
    key: "atlas",
    name: "ATLAS",
    profile: "arriesgado",
    tagline: "Fase en EE. UU.: con el Nasdaq en ataque, compra las grandes americanas que rompen su máximo de 20 días; en defensa, se queda en efectivo.",
    strategy: "rupt-QQQ",
    capital: 1000,
    color: "blue",
    // Como un bróker de acciones con fracciones (Trading 212): sin comisión, algo de deslizamiento y cambio de divisa.
    settings: { commission_pct: 0.15, commission_min: 0, slippage_bps: 5, risk_per_trade_pct: 100, max_position_pct: 100, max_open_positions: 3, breakeven: false },
    rules: { maxBuys: 3, minConviction: 1, minRewardRisk: 1, buyInBearMarket: false },
    universe: { market: "US", benchmark: "QQQ", label: "El Nasdaq 100", exclude: ["QQQ", "SPY"], where: "las grandes de EE. UU." },
  },
];

export const chipByKey = (key: string) => CHIP_AGENTS.find((c) => c.key === key) ?? null;
export const isChip = (key: unknown): key is string => typeof key === "string" && CHIP_AGENTS.some((c) => c.key === key);
