/**
 * "Resolver dudas": the pending decisions of many import batches, grouped so the same question is answered once
 * (e.g. "D'PLOCIA without tax id — is it D'PLOCIA B12345678?" in 23 documents). Pure: plans in, decisions out.
 */
export type Decision = "unir" | "tal_cual" | "omitir";
/** A decision, or "unir:<id>": the person picked the saved company it is. */
export type Answer = Decision | `unir:${string}`;
/** Companies the person can name ("es la misma que…") when the importer has no suggestion, or a different one. */
export const canPick = (d: { tipo: string; opciones: Decision[] }) => d.tipo === "company" && d.opciones.includes("tal_cual");
export const validAnswer = (d: { tipo: string; opciones: Decision[] }, a: Answer | undefined): a is Answer =>
  !!a && (a.startsWith("unir:") ? canPick(d) : d.opciones.includes(a as Decision));

/** What each question means, in words for the person. */
export const EXPLICACION: Record<string, string> = {
  "Sin identificador; por el nombre parece una empresa conocida": "El documento no trae NIF/CIF, pero el nombre se parece al de una empresa que ya tienes.",
  "Sin identificador con el que reconocerlo después": "El documento no trae NIF/CIF y el nombre no coincide con ninguna empresa guardada (puede estar mal leído). Si sabes cuál es, elígela en «Es la misma que…»; si es nueva, guárdala igualmente.",
  "NIF/CIF no válido": "El NIF/CIF leído no cumple su letra o dígito de control: casi seguro hay una cifra mal leída. Si sabes qué empresa es, elígela en «Es la misma que…»; si no, guárdala igualmente (con ese NIF) o no la guardes.",
  "Identificador probablemente mal leído": "El NIF/CIF se diferencia en un carácter del de otra empresa de los mismos documentos: casi seguro es la misma, mal leída.",
  "Varios registros tienen este identificador": "Ya hay más de una empresa guardada con este NIF/CIF; elige cuál es o guárdala aparte.",
  "No se pudo comprobar si ya existe": "No se pudo comprobar si ya existía (su tabla no está lista). Solo se puede dejar sin guardar.",
};
type Planned = {
  ref: string; tipo: string; accion: string; claveExterna: string | null; registroId?: string;
  valores: Record<string, unknown>; evidencias?: { archivo: string }[]; avisos?: string[];
  bloqueo?: { motivo: string; opciones: Decision[]; sugerencia?: string };
};
export type PlanLike = { registros: Planned[] };
export type Doubt = {
  key: string; tipo: string; nombre: string; clave: string | null; motivo: string; opciones: Decision[];
  destino: { nombre: string; clave: string | null; existente: boolean } | null;
  ocurrencias: { loteId: string; ref: string }[]; archivos: string[];
};

export const TIPO: Record<string, string> = {
  company: "Empresa", invoice: "Factura", invoice_line: "Línea de factura", invoice_tax_line: "Impuesto", supply_point: "Punto de suministro",
  telecom_line: "Línea de teléfono", contracted_power: "Potencia", energy_consumption: "Consumo", meter_reading: "Lectura de contador",
};
export const OPCION: Record<Decision, string> = { unir: "Es la misma: unir", tal_cual: "Es otra: guardar aparte", omitir: "No guardar" };

const display = (r: Planned) => String(r.valores.legal_name ?? r.valores.trade_name ?? r.valores.invoice_number ?? r.valores.supply_point_id ?? r.valores.number ?? r.valores.description ?? r.ref);
/** Same name whatever the accents, punctuation or case ("D'PLOCIA" = "D´Plocia" = "d plocia"). */
export const sameName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export function collectDoubts(plans: { loteId: string; plan: PlanLike }[]): Doubt[] {
  const groups = new Map<string, Doubt>();
  for (const { loteId, plan } of plans) {
    const byRef = new Map(plan.registros.map(r => [r.ref, r]));
    for (const r of plan.registros) {
      if (r.accion !== "bloqueado" || !r.bloqueo) continue;
      const target = r.bloqueo.sugerencia ? byRef.get(r.bloqueo.sugerencia) : undefined;
      const destino = target ? { nombre: display(target), clave: target.claveExterna, existente: !!target.registroId } : null;
      // The question is the same when the record, the reason and the suggested match are the same.
      const key = [r.tipo, sameName(display(r)), r.claveExterna ?? "", r.bloqueo.motivo,
        destino ? `${sameName(destino.nombre)}|${destino.clave ?? ""}` : "", [...r.bloqueo.opciones].sort().join(",")].join("·");
      const g = groups.get(key) ?? { key, tipo: r.tipo, nombre: display(r), clave: r.claveExterna, motivo: r.bloqueo.motivo,
        opciones: r.bloqueo.opciones, destino, ocurrencias: [], archivos: [] };
      g.ocurrencias.push({ loteId, ref: r.ref });
      for (const e of r.evidencias ?? []) if (!g.archivos.includes(e.archivo)) g.archivos.push(e.archivo);
      groups.set(key, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.ocurrencias.length - a.ocurrencias.length || a.nombre.localeCompare(b.nombre));
}

/** One answer per group → the decisions of every batch (only answers the group allows). */
export function decisionsByBatch(doubts: Doubt[], answers: Record<string, Answer>): Record<string, Record<string, Answer>> {
  const out: Record<string, Record<string, Answer>> = {};
  for (const d of doubts) {
    const answer = answers[d.key];
    if (!validAnswer(d, answer)) continue;
    for (const o of d.ocurrencias) (out[o.loteId] ??= {})[o.ref] = answer;
  }
  return out;
}

/** Batches that would have no pending question left with these answers. */
export function resolvedBatches(doubts: Doubt[], answers: Record<string, Answer>, batches: string[]): string[] {
  const open = new Set(doubts.filter(d => !validAnswer(d, answers[d.key])).flatMap(d => d.ocurrencias.map(o => o.loteId)));
  return batches.filter(b => !open.has(b));
}
