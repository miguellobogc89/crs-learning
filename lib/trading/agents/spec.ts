// lib/trading/agents/spec.ts
// Ficha estándar de un agente: lo mismo para todos, en lenguaje claro. Todos toman de la misma carta:
//   - ideas de compra: las que publica FARO (su IA propone y su filtro decide) y el escáner de rupturas
//     de 20 días (reglas, sin IA);
//   - contexto del mercado: la fase (ataque o defensa) y lo que se ve en Panorama.
// Un agente es una combinación de esa carta y su forma de gestionar el dinero. Ninguno decide con IA.
// Puro: lo usan el servidor, la interfaz y los tests.
import { CARTA } from "../carta";
import type { ChipDef } from "../chip/roster";
import { MAX_CHASE_PCT } from "../faro/logic";
import type { KamikazeDef } from "../kamikaze/roster";

export type AgentSpec = {
  /** Familia: cripto (se copia en un exchange) o stock (acciones de cualquier bolsa; se copia en un bróker). */
  market: "Cripto" | "Stock";
  /** Etiqueta corta del estilo (pastilla): Prudente, Equilibrado, Agresivo, Diversificado, Fase… */
  style: string;
  /** Las líneas de la ficha. */
  ideas: string;
  when: string;
  size: string;
  exit: string;
};

const STYLE_LABEL: Record<KamikazeDef["style"], string> = { impulso: "Impulso", rupturas: "Rupturas", rebotes: "Rebotes", selectivo: "Selectivo" };
const nf = (v: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(v);

/** Agentes que toman las ideas que publica FARO. */
export function kamikazeSpec(k: KamikazeDef): AgentSpec {
  const chase = k.maxChasePct ?? MAX_CHASE_PCT;
  const slots = k.slots ?? 1;
  const what =
    k.style === "impulso"
      ? "Las de impulso que publica FARO: monedas que ya suben con fuerza y volumen."
      : k.style === "rupturas"
        ? "Las de ruptura o noticia que publica FARO: monedas que rompen su máximo reciente o tienen una noticia que las puede disparar."
        : k.style === "selectivo" && (k.minConviction ?? 4) <= 1
          ? "Todas las que publica FARO en cripto, sea cual sea su tipo."
          : k.style === "selectivo"
          ? `Cualquiera de las que publica FARO, pero solo con convicción alta (${k.minConviction ?? 4} o más de 5).`
          : "Las de rebote que publica FARO.";
  const stop = k.stopMode === "idea" ? "su stop (justo donde la idea deja de valer)" : "su stop (donde la idea deja de valer, entre un 5 % y un 40 % por debajo)";
  if (k.engine === "enjambre-corto")
    return {
      market: "Cripto",
      style: k.label ?? "Defensa",
      ideas: "No usa las ideas de FARO: busca él mismo las monedas grandes (Bitcoin, Ethereum, Solana…) que llevan 24 h de lado en un rango estrecho y están perdiendo su suelo.",
      when: "Solo con el mercado en defensa (Bitcoin por debajo de sus medias de 50 y 200 días o de su precio de hace 10 días). Revisa cada hora; en ataque no abre nada.",
      size: (k.leverage ?? 1) > 1
        ? `Pone un ${nf(k.sizeOfEquityPct ?? 10)} % de su dinero como garantía de cada corto, con apalancamiento x${k.leverage} (cada corto vale ${nf((k.sizeOfEquityPct ?? 10) * (k.leverage ?? 1))} % de su dinero). Hasta ${slots} a la vez (empezó con ${nf(k.capital)} €).`
        : `Vende en corto un ${nf(k.sizeOfEquityPct ?? 10)} % de su dinero en cada moneda, hasta ${slots} a la vez (empezó con ${nf(k.capital)} €). Sin apalancamiento.`,
      exit: "Stop a mitad del rango (si rebota, la caída no era tal). Sin objetivo ni plazo: el stop baja detrás del precio a medio rango de distancia y deja correr la caída.",
    };
  if (k.kinds) return cartaSpec(k, slots);
  return {
    market: "Cripto",
    style: k.label ?? STYLE_LABEL[k.style],
    ideas: `${what} La de más convicción primero.`,
    when: `Siempre que haya una publicada y el precio no se haya escapado más de un ${nf(chase)} % desde la idea. Tras una pérdida, media hora de pausa.`,
    size: k.sizeOfEquityPct
      ? `Un ${nf(k.sizeOfEquityPct)} % de su dinero en cada moneda, hasta ${slots} a la vez (empezó con ${nf(k.capital)} €). Nunca dos veces la misma.`
      : k.riskPct
        ? `Arriesga el ${nf(k.riskPct)} % de su dinero en cada operación: compra lo justo para perder eso si salta el stop (con 1.000 € y el stop a −5 %, ${nf(Math.min(1000, (1000 * k.riskPct) / 100 / 0.05))} €). Hasta ${slots} a la vez, sin pasar de lo que tiene.`
        : slots === 1
          ? `Todo su capital (${nf(k.capital)} €) en una sola operación: una a la vez.`
          : `Su capital (${nf(k.capital)} €) repartido en hasta ${slots} operaciones a la vez (${nf(k.capital / slots)} € cada una), nunca dos en la misma moneda.`,
    exit:
      k.exitMode === "noise"
        ? "Recoge las subidas pequeñas: vende a +3 %, con el stop como mucho a −3 %. En cuanto gana +1,5 %, el stop pasa por encima de la entrada (ya no puede perder) y sigue al precio a un 1,5 %."
        : k.exitMode === "trail"
        ? `Sin objetivo fijo: deja correr con un stop que sube con el precio. Sale por ${stop}.`
        : `En el objetivo de la idea (al menos +10 %) o en ${stop}. Desde +30 %, el stop sube a la entrada: ya no puede acabar en pérdida.`,
  };
}

/** CAMALEÓN y ATLAS: escáner de rupturas de 20 días + fase del mercado (las reglas probadas en el laboratorio). */
export function chipSpec(c: ChipDef): AgentSpec {
  const u = c.universe;
  const what = u ? `acciones de ${u.where} (en euros)` : "criptomonedas";
  const phase = u ? `${u.label} en fase de ataque` : "el mercado en fase de ataque";
  return {
    market: u ? "Stock" : "Cripto",
    style: "Fase",
    ideas: `Las del escáner de rupturas de 20 días (sin IA): ${what} que cierran el día por encima de su máximo de 20 días, las más fuertes primero.`,
    when: `Solo con ${phase} (por encima de sus medias de 200 y 50 días y subiendo en 10 días). En defensa no compra nada.${u ? " Decide tras cada sesión; compra en la apertura siguiente si la bolsa está cerrada." : ""}`,
    size: `Su capital (${nf(c.capital)} €) repartido a partes iguales en hasta ${c.settings.max_open_positions} ${u ? "valores" : "monedas"}.`,
    exit: `Vende ${u ? "un valor" : "una moneda"} si cierra por debajo de su mínimo de 10 días, y todo si pasa a defensa (se queda en efectivo).`,
  };
}

const hoursText = (h: number) => (h % 24 === 0 ? `${h / 24} ${h === 24 ? "día" : "días"}` : `${h} h`);

/** Agentes de la carta: qué tipos de oportunidad toma y las reglas de cada tipo. */
function cartaSpec(k: KamikazeDef, slots: number): AgentSpec {
  const kinds = k.kinds ?? [];
  const names = kinds.map((x) => CARTA[x].label.toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}` : names[0];
  const limits = kinds
    .map((x) => (CARTA[x].maxHoldHours ? `${CARTA[x].label.toLowerCase()}, ${hoursText(CARTA[x].maxHoldHours!)}` : `${CARTA[x].label.toLowerCase()}, sin límite`))
    .join("; ");
  const limit = kinds.some((x) => CARTA[x].order === "limitada");
  const reinf = k.refuerzo ? kinds.filter((x) => CARTA[x].refuerzo).map((x) => CARTA[x].label.toLowerCase()) : [];
  return {
    market: "Cripto",
    style: k.label ?? STYLE_LABEL[k.style],
    ideas: `Oportunidades de ${list}${k.coins ? ` solo en monedas grandes (${k.coins.slice(0, 6).join(", ")}…)` : ""}${kinds.some((x) => CARTA[x].source === "Escáner") ? " (las de escáner salen de reglas, sin IA)" : ""}. La de más convicción primero.`,
    when: `${limit ? "Las de orden limitada, solo cuando el precio baja a su nivel. " : ""}Las de a mercado, si el precio no se ha escapado más de un ${nf(k.maxChasePct ?? MAX_CHASE_PCT)} %. Tras un stop, esa moneda descansa 12 h.`,
    size: k.sizeOfEquityPct
      ? `Un ${nf(k.sizeOfEquityPct)} % de su dinero en cada moneda, hasta ${slots} a la vez (empezó con ${nf(k.capital)} €). Nunca dos veces la misma.`
      : `Arriesga el ${nf(k.riskPct ?? 1)} % de su dinero en cada operación: compra lo justo para perder eso si salta el stop. Hasta ${slots} a la vez.${reinf.length ? ` Si una de ${reinf.join(" o ")} sube pronto, refuerza (como mucho el doble) y sube el stop para no arriesgar más que al principio.` : ""}`,
    exit: `${k.targetFraction ? `A mitad de camino hacia el objetivo de la oportunidad (${nf(k.targetFraction * 100)} % del recorrido) o en el stop.` : "En el objetivo o en el stop de la oportunidad."} Tiempo máximo por tipo: ${limits}.${kinds.includes("tendencia") ? " En las tendencias, el stop sube con el precio." : ""}`,
  };
}
