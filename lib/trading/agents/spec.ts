// lib/trading/agents/spec.ts
// Ficha estándar de un agente: lo mismo para todos, en lenguaje claro. Todos toman de la misma carta:
//   - ideas de compra: las que publica FARO (su IA propone y su filtro decide) y el escáner de rupturas
//     de 20 días (reglas, sin IA);
//   - contexto del mercado: la fase (ataque o defensa) y lo que se ve en Panorama.
// Un agente es una combinación de esa carta y su forma de gestionar el dinero. Ninguno decide con IA.
// Puro: lo usan el servidor, la interfaz y los tests.
import type { ChipDef } from "../chip/roster";
import { MAX_CHASE_PCT } from "../faro/logic";
import type { KamikazeDef } from "../kamikaze/roster";

export type AgentSpec = {
  /** Etiqueta corta del estilo (pastilla): Impulso, Rupturas, Selectivo, Fase… */
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
        : k.style === "selectivo"
          ? `Cualquiera de las que publica FARO, pero solo con convicción alta (${k.minConviction ?? 4} o más de 5).`
          : "Las de rebote que publica FARO.";
  const stop = k.stopMode === "idea" ? "su stop (justo donde la idea deja de valer)" : "su stop (donde la idea deja de valer, entre un 5 % y un 40 % por debajo)";
  return {
    style: STYLE_LABEL[k.style],
    ideas: `${what} La de más convicción primero.`,
    when: `Siempre que haya una publicada y el precio no se haya escapado más de un ${nf(chase)} % desde la idea. Tras una pérdida, media hora de pausa.`,
    size:
      slots === 1
        ? `Todo su capital (${nf(k.capital)} €) en una sola operación: una a la vez.`
        : `Su capital (${nf(k.capital)} €) repartido en hasta ${slots} operaciones a la vez (${nf(k.capital / slots)} € cada una), nunca dos en la misma moneda.`,
    exit:
      k.exitMode === "trail"
        ? `Sin objetivo fijo: deja correr con un stop que sube con el precio. Sale por ${stop}.`
        : `En el objetivo de la idea (al menos +10 %) o en ${stop}. Desde +30 %, el stop sube a la entrada: ya no puede acabar en pérdida.`,
  };
}

/** CAMALEÓN: escáner de rupturas de 20 días + fase del mercado (las reglas probadas en el laboratorio). */
export function chipSpec(c: ChipDef): AgentSpec {
  return {
    style: "Fase",
    ideas: "Las del escáner de rupturas de 20 días (sin IA): criptomonedas que cierran el día por encima de su máximo de 20 días, las más fuertes primero.",
    when: "Solo con el mercado en fase de ataque. En defensa no compra nada.",
    size: `Su capital (${nf(c.capital)} €) repartido a partes iguales en hasta ${c.settings.max_open_positions} monedas.`,
    exit: "Vende una moneda si cierra por debajo de su mínimo de 10 días, y todo si el mercado pasa a defensa (se queda en efectivo).",
  };
}
