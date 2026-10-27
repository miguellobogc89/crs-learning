import type { ClassificationResult } from "@/lib/knowledge/intake/classifier/contract";

const DESTINO: Record<string, string> = { engine: "Engine (datos)", knowledge: "Knowledge (consulta)", hibrido: "Híbrido" };
const label = (value: string) => value.replaceAll("_", " ");

/** Plain-language view of what each part of each document is. The classification extracts no values. */
export function DocumentClassification({ result }: { result: ClassificationResult }) {
  return <section aria-label="Clasificación de los documentos" className="space-y-3 rounded border p-4 text-sm">
    <h3 className="font-medium">Clasificación de los documentos</h3>
    {result.archivos.map(file => <div key={file.archivoId} className="space-y-1">
      <h4 className="font-medium">{file.archivo}</h4>
      <ul className="list-disc pl-5">
        {file.partes.map(part => {
          const pages = [...new Set(part.bloques.map(b => b.pagina))].join(", ");
          const kind = part.tipo === "otro" ? `otro: ${part.descripcion}` : `${label(part.tipo)}${part.subtipo ? ` · ${part.subtipo === "otro" ? `otro: ${part.descripcion}` : label(part.subtipo)}` : ""}`;
          return <li key={part.id}>
            <span className="font-medium">{kind}</span> ({label(part.familia)}) → {DESTINO[part.destino]}{part.contieneTablas ? " · con tablas" : ""} · confianza {part.confianza}
            {file.partes.length > 1 && ` · página(s) ${pages}`}
            <div className="text-muted-foreground">{part.motivo} — «{part.evidencia[0]?.texto}»</div>
          </li>;
        })}
      </ul>
      {file.incidencias.length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{file.incidencias.map((text, i) => <li key={i}>{text}</li>)}</ul>}
    </div>)}
  </section>;
}
