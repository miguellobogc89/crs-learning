// lib/trading/agents/roster.ts
// Los agentes de la casa: mismo acceso a la información, distinto carácter y distinto riesgo.
// Puro: lo usan el servidor y la interfaz.

export type AgentRules = {
  /** Compras nuevas como máximo por reunión. */
  maxBuys: number;
  /** Convicción mínima (1-5) para comprar. */
  minConviction: number;
  /** Beneficio/riesgo mínimo del objetivo frente al stop. */
  minRewardRisk: number;
  /** Si puede comprar en un mercado en fase bajista (con convicción 5). */
  buyInBearMarket: boolean;
};

export type AgentDef = {
  key: "argo" | "nova" | "vertigo";
  name: string;
  profile: "precavido" | "equilibrado" | "arriesgado";
  tagline: string;
  /** Carácter que se le da a la IA. */
  persona: string;
  capital: number;
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
  color: string;
};

/** Los agentes son de la plataforma, no de un espacio: viven en este espacio ficticio. */
export const AGENTS_WORKSPACE = "00000000-0000-4000-8000-000000000001";
/** Clave de la subcartera con la que un usuario copia a un agente. */
export const copyKey = (agent: string) => `copia:${agent}`;

/** Sin comisiones, como Trading 212; el deslizamiento sí cuenta. */
const COSTS = { commission_pct: 0, commission_min: 0, slippage_bps: 8 };

export const AGENT_CAPITAL = 5000;

export const AGENTS: AgentDef[] = [
  {
    key: "argo",
    name: "ARGO-1",
    profile: "precavido",
    tagline: "Primero no perder. Entra poco, con mucha confirmación, y sale pronto si algo se tuerce.",
    persona: [
      "Eres ARGO-1, un agente precavido. Tu prioridad es proteger el capital: prefieres perderte una subida a comerte una bajada.",
      "Solo compras cuando varias pruebas independientes coinciden (fuerza relativa en el top, tendencia alcista y noticias que no van en contra).",
      "Prefieres valores grandes y estables y evitas las criptomonedas pequeñas. Si dudas, no operas.",
      "Vendes en cuanto una noticia importante va en contra o el valor pierde su tendencia.",
    ].join(" "),
    capital: AGENT_CAPITAL,
    settings: { ...COSTS, risk_per_trade_pct: 0.5, max_position_pct: 15, max_open_positions: 6, breakeven: true },
    rules: { maxBuys: 1, minConviction: 4, minRewardRisk: 2, buyInBearMarket: false },
    color: "emerald",
  },
  {
    key: "nova",
    name: "NOVA-2",
    profile: "equilibrado",
    tagline: "Sigue la tendencia con cabeza: ni se lanza ni se esconde.",
    persona: [
      "Eres NOVA-2, un agente equilibrado. Buscas buenas oportunidades a favor de la tendencia, con un riesgo medido en cada operación.",
      "Te apoyas sobre todo en la fuerza relativa y en las noticias importantes, y usas las figuras como confirmación.",
      "Repartes entre bolsa española y criptomonedas según qué mercado esté mejor.",
    ].join(" "),
    capital: AGENT_CAPITAL,
    settings: { ...COSTS, risk_per_trade_pct: 1, max_position_pct: 25, max_open_positions: 8, breakeven: true },
    rules: { maxBuys: 2, minConviction: 3, minRewardRisk: 1.5, buyInBearMarket: false },
    color: "blue",
  },
  {
    key: "vertigo",
    name: "VÉRTIGO-3",
    profile: "arriesgado",
    tagline: "Va a por las subidas fuertes. Acepta más golpes a cambio de más recorrido.",
    persona: [
      "Eres VÉRTIGO-3, un agente arriesgado. Buscas los activos con más impulso y las noticias que pueden mover mucho el precio, en bolsa y en criptomonedas.",
      "Aceptas más volatilidad y operaciones más grandes, pero siempre con stop: el riesgo se mide, no se ignora.",
      "Te gusta concentrarte en pocas ideas con mucha convicción y dejar correr las ganadoras.",
    ].join(" "),
    capital: AGENT_CAPITAL,
    settings: { ...COSTS, risk_per_trade_pct: 2, max_position_pct: 35, max_open_positions: 8, breakeven: false },
    rules: { maxBuys: 3, minConviction: 3, minRewardRisk: 1.5, buyInBearMarket: true },
    color: "orange",
  },
];

export type AgentKey = AgentDef["key"];
export const agentByKey = (key: string) => AGENTS.find((a) => a.key === key) ?? null;
export const isAgentKey = (key: unknown): key is AgentKey => typeof key === "string" && AGENTS.some((a) => a.key === key);

/** Bloque de instrucciones que se añade a las del comité. */
export function agentInstructions(a: AgentDef) {
  return [
    "",
    "Tu papel en esta reunión:",
    a.persona,
    "Tienes autonomía total: lo que propongas se ejecuta solo en tu cartera, sin que nadie lo revise. Tus resultados se publican y se comparan con los de los otros agentes y con el mercado.",
    `Reglas de tu perfil (${a.profile}), que tienen prioridad sobre las generales:`,
    `- Como mucho ${a.rules.maxBuys} ${a.rules.maxBuys === 1 ? "compra nueva" : "compras nuevas"} por reunión.`,
    `- Convicción mínima para comprar: ${a.rules.minConviction}.`,
    `- El objetivo tiene que ganar al menos ${a.rules.minRewardRisk.toString().replace(".", ",")} veces lo que arriesgas.`,
    a.rules.buyInBearMarket
      ? "- Puedes comprar en un mercado bajista si hay un activo con fuerza clara y convicción 5."
      : "- No compres en un mercado en fase bajista.",
    "- La «posición» de cada activo es la de tu cartera, no la de nadie más.",
  ].join("\n");
}
