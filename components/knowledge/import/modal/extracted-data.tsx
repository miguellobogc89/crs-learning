import type { ExtractedRecord, TargetedResult } from "@/lib/knowledge/intake/targeted/contract";

const MODE: Record<string, string> = { dirigida: "extracción dirigida", knowledge: "texto para consulta (sin extracción visual)", lectura_completa: "lectura visual completa" };
const label = (value: string) => value.replaceAll("_", " ");
const filled = (record: ExtractedRecord) => Object.entries(record).filter(([, v]) => v.valor !== null);

/** Plain view of a targeted extraction: values exactly as printed, per part and entity. */
export function ExtractedData({ result }: { result: TargetedResult }) {
  return <section aria-label="Datos extraídos" className="space-y-3 rounded border p-4 text-sm">
    <h3 className="font-medium">Datos extraídos</h3>
    {result.archivos.map(file => <div key={file.archivoId} className="space-y-2">
      <h4 className="font-medium">{file.archivo}</h4>
      {file.partes.map(part => <div key={part.parteId} className="space-y-1 pl-2">
        <p className="text-muted-foreground">{part.parteId} · {label(part.tipo)}{part.subtipo ? ` · ${label(part.subtipo)}` : ""} · {MODE[part.modo]}</p>
        {part.modo === "dirigida" && part.entidades && Object.entries(part.entidades).map(([role, data]) => Array.isArray(data)
          ? data.length > 0 && <div key={role} className="overflow-x-auto">
              <p className="font-medium">{label(role)} ({data.length})</p>
              <table className="text-xs"><thead><tr>{[...new Set(data.flatMap(r => filled(r).map(([k]) => k)))].map(k => <th key={k} className="px-2 text-left">{label(k)}</th>)}</tr></thead>
                <tbody>{data.map((r, i) => <tr key={i}>{[...new Set(data.flatMap(x => filled(x).map(([k]) => k)))].map(k => <td key={k} className="px-2 align-top">{r[k]?.valor ?? ""}</td>)}</tr>)}</tbody></table>
            </div>
          : filled(data).length > 0 && <p key={role}><span className="font-medium">{label(role)}:</span> {filled(data).map(([k, v]) => `${label(k)} «${v.valor}»`).join(" · ")}</p>)}
        {part.faltan && part.faltan.length > 0 && <p className="text-muted-foreground">Obligatorios no encontrados en el documento: {part.faltan.join(", ")}</p>}
        {part.propuestas && part.propuestas.length > 0 && <p className="text-muted-foreground">Propuestas de campos nuevos: {part.propuestas.map(p => `${p.entidad}.${p.campo} «${p.valor}» (${p.motivo})`).join(" · ")}</p>}
      </div>)}
      {file.incidencias.length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{file.incidencias.map((t, i) => <li key={i}>{t}</li>)}</ul>}
    </div>)}
  </section>;
}
