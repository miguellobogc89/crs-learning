"use client";

import { useState } from "react";

type Preview = {
  status: string;
  valid: boolean;
  writesPerformed: false;
  proposal: {
    entities: { key: string; name: string; description: string; fields: { key: string; name: string; type: string }[] }[];
    relations: { key: string; fromEntity: string; toEntity: string; cardinality: string; description: string }[];
    warnings: string[];
  } | null;
  issues: { path: string; code: string }[];
};
export function SchemaDiscoveryPreview({ files }: {
  files: { id: string; name: string }[];
}) {
  const [id, setId] = useState(files[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  async function run() {
    setPending(true); setError(""); setPreview(null);
    try {
      const response = await fetch("/engine/tables/discovery", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeFileId: id }), cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Error de análisis.");
      setPreview(result as Preview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido analizar.");
    } finally { setPending(false); }
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-5">
    <h2 className="text-base font-semibold text-slate-900">Prueba controlada · descubrimiento</h2>
    <p className="mt-1 text-sm text-slate-500">La IA propone el modelo y muestra sus evidencias en el resultado JSON. No crea ni modifica tablas o registros.</p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <select className="min-w-0 max-w-full flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={id} onChange={event => setId(event.target.value)} disabled={pending}>
        {files.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}
      </select>
      <button type="button" onClick={run} disabled={!id || pending}
        className="rounded-lg bg-[#0A58FF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Analizando…" : "Analizar sin guardar"}
      </button>
    </div>
    {!files.length && <p className="mt-3 text-sm text-amber-700">No hay documentos procesados disponibles en Knowledge.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {preview && <div className="mt-5 space-y-4">
      <p className="text-sm font-semibold text-slate-800">Resultado: {preview.status} · {preview.proposal?.entities.length ?? 0} entidades · {preview.proposal?.relations.length ?? 0} relaciones · {preview.issues.length} incidencias</p>
      {preview.proposal?.entities.map(entity => <div key={entity.key} className="rounded-lg border border-slate-200 p-3">
        <p className="font-semibold text-slate-900">{entity.name} <span className="font-mono text-xs font-normal text-slate-500">({entity.key})</span></p>
        <p className="mt-1 text-xs text-slate-500">{entity.description}</p>
        <p className="mt-2 text-xs text-slate-700">{entity.fields.map(field => field.key + ": " + field.type).join(" · ")}</p>
      </div>)}
      {!!preview.proposal?.relations.length && <div className="text-sm text-slate-700">
        <p className="font-semibold">Relaciones propuestas</p>
        {preview.proposal.relations.map(relation => <p key={relation.key} className="mt-1">{relation.fromEntity} → {relation.toEntity} ({relation.cardinality}) · {relation.description}</p>)}
      </div>}
      {!!preview.proposal?.warnings.length && <div className="text-sm text-amber-800"><p className="font-semibold">Advertencias</p>{preview.proposal.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</div>}
      {!!preview.issues.length && <div className="text-sm text-red-700"><p className="font-semibold">Errores de validación</p>{preview.issues.map((issue, i) => <p key={i}>{issue.path}: {issue.code}</p>)}</div>}
      <details className="text-xs"><summary className="cursor-pointer font-semibold">Ver respuesta JSON completa (incluye evidencias)</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-50 p-3">{JSON.stringify(preview, null, 2)}</pre>
      </details>
    </div>}
  </section>;
}
