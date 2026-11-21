// lib/trading/kamikaze/roster.ts
import type { CartaKind } from "../carta";
// Agentes que toman las ideas que publica FARO (antes «kamikazes»: de ahí el nombre interno). Ninguno
// decide con IA: cada uno aplica siempre sus reglas (qué ideas coge, cuánto pone, cuándo sale).
// Desde el 16/11/2026 todos empiezan con 1.000 €, sin rondas ni metas. Las definiciones antiguas siguen
// aquí (archivadas) para su historial. Puro: lo usan el servidor, los tests y la interfaz.
import type { AgentRules } from "../agents/roster";

/** «selectivo»: cualquier tipo de idea, pero solo las de convicción alta. */
export type KamikazeStyle = "impulso" | "rupturas" | "rebotes" | "selectivo";

export type KamikazeDef = {
  key: string;
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
  /** Variantes: clave del kamikaze original y qué cambia (una sola cosa, para comparar limpio). */
  base?: string;
  variant?: string;
  /** % del capital de la ronda por operación (100 = todo; 50 = dos «balas»). */
  sizePct?: number;
  /** Cuánto puede haber subido el precio desde la idea para que aún entre. */
  maxChasePct?: number;
  /** «clamp»: stop en la invalidación, pero entre un 5 % y un 40 % por debajo; «idea»: justo en la invalidación. */
  stopMode?: "clamp" | "idea";
  /**
   * «target»: vende en el objetivo; «trail»: deja correr con un stop que sube con el precio;
   * «noise»: recoge ganancias pequeñas (objetivo +3 %, stop como mucho a −3 % y, desde +1,5 %, el stop
   * sube por encima de la entrada y sigue al precio a un 1,5 %).
   */
  exitMode?: "target" | "trail" | "noise";
  /** Convicción mínima de la idea de FARO (de 1 a 5) para tomarla. */
  minConviction?: number;
  /** Operaciones a la vez: el capital se reparte en tantas partes (1 = todo a una carta). */
  slots?: number;
  /**
   * Riesgo por operación: % del patrimonio que pierde si salta el stop. El tamaño sale de ahí
   * (patrimonio × riesgo ÷ distancia al stop), sin pasar del efectivo. Sin esto, capital ÷ slots.
   */
  riskPct?: number;
  /** Tamaño fijo por operación en % del patrimonio (diversificación). Manda sobre riskPct. */
  sizeOfEquityPct?: number;
  /** Etiqueta del estilo en la ficha (pastilla): Prudente, Equilibrado, Agresivo, Diversificado… */
  label?: string;
  /** Tipos de oportunidad de la carta que toma (lib/trading/carta.ts). Sin esto, los de su estilo. */
  kinds?: CartaKind[];
  /** Si refuerza (compra otra vez lo mismo, como mucho el doble) cuando una idea se confirma pronto. */
  refuerzo?: boolean;
  /** Solo estas monedas (símbolo base: BTC, ETH…). Sin esto, cualquiera. */
  coins?: string[];
  /** Vende antes del objetivo de la idea: a esta fracción del recorrido (0,5 = a mitad de camino). */
  targetFraction?: number;
  /** Motor propio en vez de tomar ideas de FARO: «enjambre-corto» = cortos de ruido roto, solo en defensa;
   * «avalancha» = cortos en caídas bruscas de todo el mercado (lib/trading/kamikaze/avalancha.ts), en cualquier fase. */
  engine?: "enjambre-corto" | "avalancha";
  /** Apalancamiento de los cortos del ENJAMBRE (el tamaño de cada corto se multiplica por esto). */
  leverage?: number;
};

/** Capital igual para todos los agentes desde el 16/11/2026: así su rentabilidad se compara limpia. */
export const AGENT_START_CAPITAL = 1000;
const standard = (slots: number) => ({ capital: AGENT_START_CAPITAL, slots, settings: { ...SETTINGS, max_open_positions: slots } });

/** Costes de un exchange de crypto al contado: ~0,1 % por operación y algo de deslizamiento. */
const COSTS = { commission_pct: 0.1, commission_min: 0, slippage_bps: 15 };
const SETTINGS = { ...COSTS, risk_per_trade_pct: 100, max_position_pct: 100, max_open_positions: 1, breakeven: false };
const RULES: AgentRules = { maxBuys: 1, minConviction: 1, minRewardRisk: 1, buyInBearMarket: true };

export const KAMIKAZE_CAPITAL = 20;

const BASE: KamikazeDef[] = [
  {
    key: "cohete",
    name: "COHETE",
    profile: "kamikaze",
    style: "impulso",
    tagline: "Se sube a lo que ya vuela. Meta: ×10, sin plazo.",
    persona: [
      "Eres COHETE, un agente kamikaze de criptomonedas. Tu único objetivo es multiplicar tu capital por 10, sin límite de tiempo: perderlo todo es aceptable, quedarte quieto no.",
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
    tagline: "Busca la chispa: rupturas y noticias que disparan el precio. Meta: ×10, sin plazo.",
    persona: [
      "Eres MECHA, un agente kamikaze de criptomonedas. Tu único objetivo es multiplicar tu capital por 10, sin límite de tiempo: perderlo todo es aceptable, quedarte quieto no.",
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
    tagline: "Compra cuando todos huyen, a la espera del rebote. Meta: ×8, sin plazo.",
    persona: [
      "Eres FÉNIX, un agente kamikaze de criptomonedas. Tu único objetivo es multiplicar tu capital por 8, sin límite de tiempo: perderlo todo es aceptable, quedarte quieto no.",
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

/** Variantes: copian a su original y cambian un solo parámetro. */
const variant = (base: string, o: Pick<KamikazeDef, "key" | "name" | "variant" | "tagline"> & Partial<KamikazeDef>): KamikazeDef => {
  const b = ORIGINALS.find((k) => k.key === base)!;
  return { ...b, base, ...o };
};
const ORIGINALS = BASE;
/** Todos los kamikazes, también los archivados (para su historial y sus enlaces). */
export const ALL_KAMIKAZES: KamikazeDef[] = [
  ORIGINALS[0],
  variant("cohete", { key: "cohete-persigue", name: "COHETE PERSIGUE", variant: "Persigue", maxChasePct: 8, tagline: "Se sube a lo que ya vuela, aunque el precio ya haya subido hasta un 8 % desde la idea. Meta: ×10, sin plazo." }),
  ORIGINALS[1],
  variant("mecha", { key: "mecha-balas", name: "MECHA 2 BALAS", variant: "2 balas", sizePct: 50, tagline: "Como MECHA, pero cada operación usa la mitad del capital de la ronda: si falla una, le queda otra." }),
  variant("mecha", { key: "mecha-corre", name: "MECHA CORRE", variant: "Corre", exitMode: "trail", tagline: "Como MECHA, pero no vende en el objetivo: deja correr con un stop que sube con el precio." }),
  ORIGINALS[2],
  // VÉRTIGO (16/11/2026): antes era un agente del comité que decidía con IA; ahora, como el resto, solo
  // sigue reglas sobre las ideas de FARO. Clave nueva para no mezclarse con el historial del comité.
  {
    key: "vertigo-faro",
    name: "VÉRTIGO",
    profile: "kamikaze",
    style: "selectivo",
    tagline: "Selectivo: solo las ideas de FARO de convicción alta (4 o 5 de 5), de cualquier tipo. Pocas veces, pero todo a una carta. Meta: ×3, sin plazo.",
    persona: "VÉRTIGO no decide con IA: toma la idea de FARO de más convicción si llega a 4 de 5.",
    capital: KAMIKAZE_CAPITAL,
    multiple: 3,
    days: 10,
    color: "orange",
    settings: SETTINGS,
    rules: RULES,
    minConviction: 4,
  },
  variant("fenix", { key: "fenix-ajustado", name: "FÉNIX AJUSTADO", variant: "Ajustado", stopMode: "idea", tagline: "Como FÉNIX, pero con el stop justo en la invalidación de la idea, sin el mínimo del 5 %." }),
];

/**
 * Archivados el 16/11/2026: dejan de operar y de verse, pero su historial se conserva.
 * - FÉNIX y FÉNIX AJUSTADO: compran rebotes, y los rebotes de FARO dieron 0 aciertos de 58.
 * - COHETE (queda COHETE PERSIGUE), MECHA 2 BALAS y MECHA CORRE (queda MECHA): variantes que no aportaban.
 */
/**
 * Reglas de dinero de los que siguen en activo (16/11/2026): sin rondas ni metas, 1.000 € cada uno y el
 * capital repartido en sus operaciones a la vez. Nombres sin variantes ni números.
 */
const ACTIVE_RULES: Record<string, Partial<KamikazeDef>> = {
  "cohete-persigue": { name: "COHETE", ...standard(4) },
  mecha: { ...standard(4) },
  "vertigo-faro": { ...standard(1) },
};
for (let k = 0; k < ALL_KAMIKAZES.length; k++) {
  const o = ACTIVE_RULES[ALL_KAMIKAZES[k].key];
  if (o) ALL_KAMIKAZES[k] = { ...ALL_KAMIKAZES[k], ...o };
}

/**
 * Agentes de cripto desde el 16/11/2026 (tarde): todos toman las mismas ideas que publica FARO (la de más
 * convicción primero) y solo cambia cuánto arriesgan; así su rentabilidad dice qué nivel de riesgo funciona.
 * Y ENJAMBRE, que diversifica: un 10 % en cada moneda (hasta 10) y recoge las ganancias pequeñas.
 */
/** Las monedas grandes (las de más capitalización que tiene Revolut X). */
export const BIG_COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "AVAX", "LINK", "DOT", "LTC", "TRX"];

const crypto = (o: Pick<KamikazeDef, "key" | "name" | "tagline" | "color" | "label"> & Partial<KamikazeDef>): KamikazeDef => ({
  profile: "kamikaze",
  style: "selectivo",
  minConviction: 1,
  persona: "",
  multiple: 1,
  days: 0,
  rules: RULES,
  ...standard(o.slots ?? 1),
  ...o,
  settings: { ...SETTINGS, ...(o.settings ?? {}), max_open_positions: o.slots ?? 1 },
});
ALL_KAMIKAZES.push(
  crypto({
    key: "roca",
    name: "ROCA",
    label: "Prudente",
    color: "emerald",
    riskPct: 1,
    slots: 8,
    kinds: ["tendencia", "retroceso"],
    refuerzo: true,
    tagline: "Prudente: tendencias largas y compras en retrocesos, arriesgando el 1 % de su dinero en cada operación (lo que pierde si salta el stop).",
  }),
  crypto({
    key: "brujula",
    name: "BRÚJULA",
    label: "Equilibrado",
    color: "violet",
    riskPct: 3,
    slots: 4,
    kinds: ["ruptura", "retroceso", "tendencia"],
    refuerzo: true,
    tagline: "Equilibrado: rupturas, retrocesos y tendencias largas, arriesgando el 3 % de su dinero en cada operación (lo que pierde si salta el stop).",
  }),
  crypto({
    key: "vertigo-10",
    name: "VÉRTIGO",
    label: "Agresivo",
    color: "orange",
    riskPct: 10,
    slots: 2,
    kinds: ["impulso", "ruptura", "noticia"],
    refuerzo: true,
    tagline: "Agresivo: impulsos, rupturas y noticias de horas, arriesgando el 10 % de su dinero en cada operación (lo que pierde si salta el stop).",
  }),
  crypto({
    key: "enjambre",
    name: "ENJAMBRE RUIDO",
    label: "Diversificado",
    color: "amber",
    sizeOfEquityPct: 10,
    slots: 10,
    kinds: ["ruido"],
    tagline: "Diversificado: un 10 % de su dinero en cada moneda, hasta 10 a la vez. Vive del ruido: compra con órdenes limitadas en la parte baja de un rango tranquilo y vende en la alta (en Revolut X, sin comisión).",
  }),
  // Variantes del ruido (17/11/2026): misma idea, otra forma de operarla, para saber cuál compensa.
  crypto({
    key: "enjambre-grandes",
    name: "ENJAMBRE RUIDO GRANDES",
    label: "Diversificado",
    color: "teal",
    sizeOfEquityPct: 10,
    slots: 10,
    kinds: ["ruido"],
    coins: BIG_COINS,
    tagline: "Como ENJAMBRE RUIDO, pero solo con las monedas grandes (Bitcoin, Ethereum, Solana, XRP…): rangos más estrechos y, en principio, más fiables.",
  }),
  crypto({
    key: "enjambre-rapido",
    name: "ENJAMBRE RUIDO RÁPIDO",
    label: "Diversificado",
    color: "lime",
    sizeOfEquityPct: 10,
    slots: 10,
    kinds: ["ruido"],
    targetFraction: 0.5,
    tagline: "Como ENJAMBRE RUIDO, pero vende a mitad del rango: gana menos en cada operación y debería acertar más veces.",
  }),
  // ENJAMBRE (18/11/2026): el ruido al revés. Simulado: +16 % en un año bajista con costes de Kraken.
  crypto({
    key: "enjambre-corto",
    name: "ENJAMBRE",
    label: "Defensa",
    color: "rose",
    sizeOfEquityPct: 10,
    slots: 10,
    coins: BIG_COINS,
    engine: "enjambre-corto",
    // Como Kraken Futures: 0,02 % al entrar y 0,05 % al salir (se cuenta 0,05 % en las dos, por prudencia).
    settings: { ...SETTINGS, commission_pct: 0.05, commission_min: 0, slippage_bps: 2, max_open_positions: 10 },
    tagline: "Gana cuando el mercado cae: con el mercado en defensa, vende en corto las monedas grandes que pierden el suelo de su rango, con un 10 % de su dinero en cada una (hasta 10), y deja correr la caída con un stop que baja detrás del precio.",
  }),
  crypto({
    key: "enjambre-x2",
    name: "ENJAMBRE x2",
    label: "Defensa x2",
    color: "orange",
    sizeOfEquityPct: 10,
    slots: 10,
    coins: BIG_COINS,
    engine: "enjambre-corto",
    leverage: 2,
    settings: { ...SETTINGS, commission_pct: 0.05, commission_min: 0, slippage_bps: 2, max_open_positions: 10 },
    tagline: "El ENJAMBRE con apalancamiento x2: mismas operaciones, cada corto 2 veces más grande. Gana y pierde unas 2 veces más (simulado en un año: +33 % con caída máxima del −12 %).",
  }),
  crypto({
    key: "enjambre-x3",
    name: "ENJAMBRE x3",
    label: "Defensa x3",
    color: "fuchsia",
    sizeOfEquityPct: 10,
    slots: 10,
    coins: BIG_COINS,
    engine: "enjambre-corto",
    leverage: 3,
    settings: { ...SETTINGS, commission_pct: 0.05, commission_min: 0, slippage_bps: 2, max_open_positions: 10 },
    tagline: "El ENJAMBRE con apalancamiento x3: mismas operaciones, cada corto 3 veces más grande. Gana y pierde unas 3 veces más (simulado en un año: +52 % con caída máxima del −18 %).",
  }),
  // AVALANCHA (21/11/2026): cubre lo que ENJAMBRE deja fuera, las caídas fuertes que ya están en marcha.
  // En prueba con dinero virtual: aún sin validar en el laboratorio (…/lab/swarm?regla=caidas).
  crypto({
    key: "avalancha",
    name: "AVALANCHA",
    label: "Caídas bruscas",
    color: "blue",
    sizeOfEquityPct: 10,
    slots: 10,
    coins: BIG_COINS,
    engine: "avalancha",
    settings: { ...SETTINGS, commission_pct: 0.05, commission_min: 0, slippage_bps: 5, max_open_positions: 10 },
    tagline: "Gana en las caídas fuertes de todo el mercado: cuando Bitcoin cae y una moneda grande lleva más de un 4 % abajo en el día y sigue marcando mínimos, la vende en corto con un 10 % de su dinero (hasta 10) y deja correr la caída con un stop que baja detrás del precio.",
  }),
);

export const ARCHIVED_KAMIKAZES: ReadonlySet<string> = new Set([
  "fenix",
  "fenix-ajustado",
  "cohete",
  "mecha-balas",
  "mecha-corre",
  // Sustituidos por los tres niveles de riesgo (16/11/2026, tarde).
  "cohete-persigue",
  "mecha",
  "vertigo-faro",
]);
/** Los que están en activo. */
export const KAMIKAZES = ALL_KAMIKAZES.filter((k) => !ARCHIVED_KAMIKAZES.has(k.key));

export type KamikazeKey = KamikazeDef["key"];
export const kamikazeByKey = (key: string) => ALL_KAMIKAZES.find((k) => k.key === key) ?? null;
export const isKamikaze = (key: unknown): key is KamikazeKey => typeof key === "string" && ALL_KAMIKAZES.some((k) => k.key === key);
