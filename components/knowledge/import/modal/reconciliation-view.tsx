import type { ReconciliationResult } from "@/lib/knowledge/intake/reconciliation/contract";

const TIPO: Record<string, string> = { company: "Empresa", invoice: "Factura", supply_point: "Punto de suministro", telecom_line: "Línea" };
const ESTADO: Record<string, string> = {
  nueva: "nueva", existente: "ya existe", ambigua: "varias coincidencias: revisar", sin_identificador: "sin identificador: revisar",
  tipo_no_definido: "tipo aún no definido en el espacio", no_comprobada: "no comprobada",
};
const ROL: Record<string, string> = { issuer: "emisor", recipient: "receptor", invoice: "factura", supply: "suministro", lines_service: "línea" };

/** Plain-language view of which extracted entities already exist. Read-only: nothing is created or linked here. */
export function ReconciliationView({ result }: { result: ReconciliationResult }) {
  const r = result.resumen;
  const byRef = new Map(result.entidades.map(e => [e.ref, e]));
  const name = (ref: string) => { const e = byRef.get(ref); return e ? `${TIPO[e.tipo]} ${e.nombres[0] ?? e.clave ?? ""}`.trim() : ref; };
  return <section aria-label="Conciliación" className="space-y-3 rounded border p-4 text-sm">
    <h3 className="font-medium">Conciliación con tus datos</h3>
    <p>{r.entidades} entidades: {r.nuevas} nuevas, {r.existentes} ya existentes, {r.ambiguas} con varias coincidencias, {r.sinIdentificador} sin identificador, {r.noComprobadas} sin comprobar. Nada se ha guardado todavía.</p>
    <ul className="list-disc pl-5">
      {result.entidades.map(e => <li key={e.ref}>
        <span className="font-medium">{TIPO[e.tipo]}</span> {e.nombres.join(" / ") || "—"}{e.clave ? ` · ${e.clave}` : ""} → {ESTADO[e.estado]}
        <span className="text-muted-foreground"> · {e.menciones.map(m => `${m.archivo} (${ROL[m.rol] ?? m.rol})`).join(", ")}</span>
        {e.avisos.map((a, i) => <div key={i} className="text-amber-700 dark:text-amber-400">{a}</div>)}
      </li>)}
    </ul>
    {result.relaciones.length > 0 && <details><summary>Relaciones previstas ({result.relaciones.length})</summary>
      <ul className="list-disc pl-5">{result.relaciones.map((rel, i) => <li key={i}>{name(rel.desde)} → {ROL[rel.relacion] ?? rel.relacion} → {name(rel.hacia)}</li>)}</ul>
    </details>}
    {result.avisos.length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{result.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
  </section>;
}
