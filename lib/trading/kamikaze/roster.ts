// lib/trading/kamikaze/roster.ts
// Agentes kamikaze: poco dinero, todo a una carta y una meta muy ambiciosa en pocos días. Es una
// lotería con método, no una estrategia de inversión. Cada uno caza de una forma distinta para ver
// qué funciona mejor a lo largo de muchas rondas. Puro: lo usan el servidor, los tests y la interfaz.
import type { AgentRules } from "../agents/roster";

export type KamikazeStyle = "impulso" | "rupturas" | "rebotes";

export type KamikazeDef = {
  key: "cohete" | "mecha" | "fenix";
  name: string;
  profile: "kamikaze";
  style: KamikazeStyle;
  tagline: string;
  /** Carácter que se le da a la IA. */
  persona: string;
  /** Capital de cada ronda. */
  capital: number;
  /** Meta de la ronda: multiplicar el capital por esto… */
  multiple: number;
  /** …en estos días. */
  days: number;
  color: string;
  /** Compatibles con los agentes normales (la interfaz y la cartera virtual los usan igual). */
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

/** Costes de un exchange de crypto al contado: ~0,1 % por operación y algo de deslizamiento. */
const COSTS = { commission_pct: 0.1, commission_min: 0, slippage_bps: 15 };
const SETTINGS = { ...COSTS, risk_per_trade_pct: 100, max_position_pct: 100, max_open_positions: 1, breakeven: false };
const RULES: AgentRules = { maxBuys: 1, minConviction: 1, minRewardRisk: 1, buyInBearMarket: true };

export const KAMIKAZE_CAPITAL = 20;

export const KAMIKAZES: KamikazeDef[] = [
  {
    key: "cohete",
    name: "COHETE",
    profile: "kamikaze",
    style: "impulso",
    tagline: "Se sube a lo que ya vuela. Meta: ×10 en 7 días.",
    persona: [
      "Eres COHETE, un agente kamikaze de criptomonedas. Tu único objetivo es multiplicar tu capital por 10 en 7 días: perderlo todo es aceptable, quedarte quieto no.",
      "Cazas IMPULSO: te subes a las monedas que ya están subiendo con fuerza y volumen, y sales en cuanto el impulso se agota.",
    ].join(" "),
    capital: KAMIKAZE_CAPITAL,
    multiple: 10,
    days: 7,
    color: "rose",
    settings: SETTINGS,
    rules: RULES,
  },
  {
    key: "mecha",
    name: "MECHA",
    profile: "kamikaze",
    style: "rupturas",
    tagline: "Busca la chispa: rupturas y noticias que disparan el precio. Meta: ×10 en 5 días.",
    persona: [
      "Eres MECHA, un agente kamikaze de criptomonedas. Tu único objetivo es multiplicar tu capital por 10 en 5 días: perderlo todo es aceptable, quedarte quieto no.",
      "Cazas RUPTURAS: monedas que rompen sus máximos recientes con un aumento claro de volumen, o que tienen una noticia que puede dispararlas.",
    ].join(" "),
    capital: KAMIKAZE_CAPITAL,
    multiple: 10,
    days: 5,
    color: "amber",
    settings: SETTINGS,
    rules: RULES,
  },
  {
    key: "fenix",
    name: "FÉNIX",
    profile: "kamikaze",
    style: "rebotes",
    tagline: "Compra cuando todos huyen, a la espera del rebote. Meta: ×8 en 10 días.",
    persona: [
      "Eres FÉNIX, un agente kamikaze de criptomonedas. Tu único objetivo es multiplicar tu capital por 8 en 10 días: perderlo todo es aceptable, quedarte quieto no.",
      "Cazas REBOTES: monedas que han caído con violencia y empiezan a girarse al alza; entras pronto y sales en el rebote.",
    ].join(" "),
    capital: KAMIKAZE_CAPITAL,
    multiple: 8,
    days: 10,
    color: "fuchsia",
    settings: SETTINGS,
    rules: RULES,
  },
];

export type KamikazeKey = KamikazeDef["key"];
export const kamikazeByKey = (key: string) => KAMIKAZES.find((k) => k.key === key) ?? null;
export const isKamikaze = (key: unknown): key is KamikazeKey => typeof key === "string" && KAMIKAZES.some((k) => k.key === key);
