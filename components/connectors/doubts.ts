/**
 * "Resolver dudas": the pending decisions of many import batches, grouped so the same question is answered once
 * (e.g. "D'PLOCIA without tax id — is it D'PLOCIA B12345678?" in 23 documents). Pure: plans in, decisions out.
 */
export type Decision = "unir" | "tal_cual" | "omitir";
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
export function decisionsByBatch(doubts: Doubt[], answers: Record<string, Decision>): Record<string, Record<string, Decision>> {
  const out: Record<string, Record<string, Decision>> = {};
  for (const d of doubts) {
    const answer = answers[d.key];
    if (!answer || !d.opciones.includes(answer)) continue;
    for (const o of d.ocurrencias) (out[o.loteId] ??= {})[o.ref] = answer;
  }
  return out;
}

/** Batches that would have no pending question left with these answers. */
export function resolvedBatches(doubts: Doubt[], answers: Record<string, Decision>, batches: string[]): string[] {
  const open = new Set(doubts.filter(d => !answers[d.key] || !d.opciones.includes(answers[d.key])).flatMap(d => d.ocurrencias.map(o => o.loteId)));
  return batches.filter(b => !open.has(b));
}
