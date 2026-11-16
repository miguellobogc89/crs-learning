// lib/trading/agents/spec.ts
// Ficha estándar de un agente: lo mismo para todos, en lenguaje claro. La IA no invierte (solo informa con
// FARO): cada agente es un reglamento fijo, y aquí se explica entero. Puro: lo usan el servidor y los tests.
import type { ChipDef } from "../chip/roster";
import type { DcaDef } from "../dca/roster";
import { MAX_CHASE_PCT } from "../faro/logic";
import type { KamikazeDef } from "../kamikaze/roster";

/** De dónde salen sus compras: ideas de FARO, reglas propias sobre el mercado, o ninguna (referencia). */
export type AgentFamily = "faro" | "propio" | "referencia";

export type AgentSpec = {
  family: AgentFamily;
  /** Etiqueta corta del estilo (pastilla): Impulso, Rupturas, Selectivo, Fase, DCA… */
  style: string;
  /** Las cinco líneas de la ficha. */
  source: string;
  takes: string;
  size: string;
  exit: string;
  goal: string | null;
};

export const FAMILY_LABEL: Record<AgentFamily, string> = { faro: "Ideas de FARO", propio: "Reglas propias", referencia: "Referencia" };

const STYLE_LABEL: Record<KamikazeDef["style"], string> = { impulso: "Impulso", rupturas: "Rupturas", rebotes: "Rebotes", selectivo: "Selectivo" };
const nf = (v: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(v);

export function kamikazeSpec(k: KamikazeDef): AgentSpec {
  const chase = k.maxChasePct ?? MAX_CHASE_PCT;
  const what =
    k.style === "impulso"
      ? "Ideas de impulso: monedas que ya suben con fuerza y volumen."
      : k.style === "rupturas"
        ? "Ideas de ruptura o de noticia: monedas que rompen su máximo reciente o tienen una noticia que las puede disparar."
        : k.style === "selectivo"
          ? `Cualquier tipo de idea, pero solo con convicción alta (${k.minConviction ?? 4} o más de 5).`
          : "Ideas de rebote: monedas que han caído mucho.";
  const stop =
    k.stopMode === "idea" ? "el stop, justo donde la idea deja de ser válida" : "el stop, donde la idea deja de ser válida (entre un 5 % y un 40 % por debajo)";
  return {
    family: "faro",
    style: STYLE_LABEL[k.style],
    source: "Las ideas que publica FARO y deja pasar FARO-2. No decide con IA: solo aplica sus reglas.",
    takes: `${what} La de más convicción, si el precio no se ha escapado más de un ${nf(chase)} % desde la idea.`,
    size: k.sizePct && k.sizePct < 100 ? `El ${nf(k.sizePct)} % de su capital por operación.` : `Todo su capital (${nf(k.capital)} €) en una sola operación; una a la vez.`,
    exit:
      k.exitMode === "trail"
        ? `Sin objetivo fijo: deja correr con un stop que sube con el precio. Sale por ${stop}.`
        : `Vende en el objetivo de la idea (al menos +10 %) o en ${stop}. Desde +30 %, el stop sube a la entrada. Tras una pérdida, media hora de pausa.`,
    goal: `Rondas: intenta multiplicar su capital por ${k.multiple}. Si lo consigue o se queda sin dinero, empieza otra ronda con ${nf(k.capital)} €.`,
  };
}

export function chipSpec(c: ChipDef): AgentSpec {
  return {
    family: "propio",
    style: "Fase",
    source: "Sus propias reglas sobre el mercado (el detector de fase), sin FARO y sin IA.",
    takes: "Solo con el mercado en modo ataque: hasta 3 criptomonedas que cierran por encima de su máximo de 20 días, las más fuertes primero.",
    size: `Reparte su capital (${nf(c.capital)} €) a partes iguales entre ellas.`,
    exit: "Vende una moneda si cierra por debajo de su mínimo de 10 días, y todo si el mercado pasa a defensa (se queda en efectivo).",
    goal: null,
  };
}

export function dcaSpec(d: DcaDef): AgentSpec {
  return {
    family: "referencia",
    style: "DCA",
    source: "Ninguna: no mira el mercado ni a FARO.",
    takes: `${d.symbol.replace(/-EUR$/, "") === "BTC" ? "Bitcoin" : d.symbol}, siempre.`,
    size: `${nf(d.amount)} € cada semana (los lunes) hasta gastar sus ${nf(d.capital)} €.`,
    exit: "No vende nunca.",
    goal: "Ser la vara de medir: un agente que no le gane no está aportando nada.",
  };
}
