import type { Decision, WritePlan } from "@/lib/knowledge/intake/writer/plan";
import type { WriteResult } from "@/lib/knowledge/intake/writer/commit";

const TIPO: Record<string, string> = {
  company: "Empresa", invoice: "Factura", invoice_line: "Línea de factura", invoice_tax_line: "Impuesto", supply_point: "Punto de suministro",
  telecom_line: "Línea de teléfono", contracted_power: "Potencia", energy_consumption: "Consumo", meter_reading: "Lectura de contador",
};
const OPCION: Record<Decision, string> = { unir: "Unir a la sugerida", tal_cual: "Guardar tal cual", omitir: "No guardar" };
const name = (r: WritePlan["registros"][number]) =>
  String(r.valores.legal_name ?? r.valores.invoice_number ?? r.valores.supply_point_id ?? r.valores.number ?? r.valores.description ?? r.valores.period ?? r.ref);

const suggestedName = (plan: WritePlan, ref: string) => {
  const r = plan.registros.find(x => x.ref === ref);
  return r ? `${String(r.valores.legal_name ?? "")}${r.claveExterna ? ` (${r.claveExterna})` : ""}`.trim() || ref : ref;
};

/** What will be saved, what needs a decision, and what could not be converted. Nothing is saved until "Guardar". */
export function WritePlanView({ plan, decisions, onDecide }: { plan: WritePlan; decisions: Record<string, Decision>; onDecide: (ref: string, d: Decision) => void }) {
  const r = plan.resumen;
  const pending = plan.registros.filter(x => x.bloqueo);
  const byType = new Map<string, number>();
  for (const x of plan.registros.filter(x => x.accion === "crear" || x.accion === "bloqueado")) byType.set(x.tipo, (byType.get(x.tipo) ?? 0) + 1);
  return <section aria-label="Guardar en mis datos" className="space-y-3 rounded border p-4 text-sm">
    <h3 className="font-medium">Guardar en mis datos</h3>
    <p>Se crearán {r.crear} registros{r.reutilizar ? `, se reutilizarán ${r.reutilizar} existentes` : ""} y {r.relaciones} relaciones
      {r.omitidos ? ` · ${r.omitidos} no se guardan` : ""}{r.unidos ? ` · ${r.unidos} unidos` : ""}.</p>
    <p className="text-muted-foreground">{[...byType].map(([t, n]) => `${n} ${TIPO[t] ?? t}`).join(" · ")}</p>
    {pending.length > 0 && <div className="space-y-2">
      <h4 className="font-medium">Necesita tu decisión ({pending.length})</h4>
      {pending.map(x => <fieldset key={x.ref} className="rounded border p-2">
        <legend className="px-1 font-medium">{TIPO[x.tipo] ?? x.tipo} {name(x)}</legend>
        <p className="text-amber-700 dark:text-amber-400">{x.bloqueo!.motivo}{x.bloqueo!.sugerencia ? ` · sugerida: ${suggestedName(plan, x.bloqueo!.sugerencia)}` : ""}</p>
        {x.avisos.map((a, i) => <p key={i} className="text-muted-foreground">{a}</p>)}
        <div className="flex flex-wrap gap-3">{x.bloqueo!.opciones.map(o => <label key={o} className="flex items-center gap-1">
          <input type="radio" name={x.ref} checked={decisions[x.ref] === o} onChange={() => onDecide(x.ref, o)} /> {OPCION[o]}</label>)}</div>
      </fieldset>)}
    </div>}
    {r.noConvertidos > 0 && <details><summary>Valores que no se pudieron convertir ({r.noConvertidos}): se guarda el campo vacío</summary>
      <ul className="list-disc pl-5">{plan.registros.flatMap(x => x.noConvertidos.map((n, i) => <li key={x.ref + i}>{TIPO[x.tipo] ?? x.tipo} · {n.campo}: «{n.impreso}» ({n.motivo})</li>))}</ul>
    </details>}
    <details><summary>Detalle de los registros</summary>
      <ul className="list-disc pl-5">{plan.registros.map(x => <li key={x.ref}>
        <span className="font-medium">{TIPO[x.tipo] ?? x.tipo}</span> {name(x)} → {x.accion}
        <span className="text-muted-foreground"> · {Object.entries(x.valores).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</span>
      </li>)}</ul>
    </details>
  </section>;
}

export function WriteResultView({ result }: { result: WriteResult }) {
  const r = result.resumen;
  return <section aria-label="Guardado" className="space-y-1 rounded border p-4 text-sm">
    <h3 className="font-medium">Guardado en tus datos</h3>
    <p>{r.creados} registros creados, {r.reutilizados} reutilizados, {r.relaciones} relaciones y {r.evidencias} evidencias del documento{r.omitidos ? ` · ${r.omitidos} no guardados` : ""}.</p>
  </section>;
}
