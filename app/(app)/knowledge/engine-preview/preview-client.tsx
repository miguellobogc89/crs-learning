"use client";

import { useState } from "react";

type Preview = {
  status: string;
  discoveredEntities?: { key: string; fields: { key: string; type: string }[] }[];
  discoveredRelations?: { key: string; fromEntity: string; toEntity: string; cardinality: string }[];
  reviewPlan?: { kind: string; source: string; target?: string; reason: string }[];
  suggestions?: { kind: string; path: string }[];
  semanticIssues?: unknown[];
  issues?: unknown[];
  writesPerformed?: boolean;
  error?: string;
};

export function EnginePreviewClient({ files }: { files: { id: string; name: string }[] }) {
  const [fileId, setFileId] = useState(files[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  async function runPreview() {
    if (!fileId || pending) return;
    setPending(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch("/api/engine/preview-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeFileId: fileId }),
      });
      const result = await response.json() as Preview;
      if (!response.ok) throw new Error(result.error || "No se pudo analizar el archivo.");
      setPreview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error desconocido.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <label htmlFor="engine-file" className="block text-sm font-semibold text-slate-800">
          Documento procesado en Knowledge
        </label>
        <select id="engine-file" value={fileId} onChange={e => setFileId(e.target.value)}
          className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
          {files.length === 0 && <option value="">No hay archivos listos</option>}
          {files.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}
        </select>
        <button type="button" onClick={runPreview} disabled={!fileId || pending}
          className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Analizando documento…" : "Analizar con Engine"}
        </button>
        <p className="mt-3 text-xs text-slate-500">
          Solo lectura: esta prueba no crea registros ni modifica el esquema.
          Las equivalencias son sugerencias, no aprobaciones.
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </section>
      {preview && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Resultado del análisis</h2>
          <p className="text-sm text-slate-600">Estado: {preview.status}</p>
          <p className="text-sm text-slate-600">Escrituras en Engine: ninguna</p>
          {!!preview.discoveredEntities?.length && <div>
            <h3 className="mb-2 font-semibold text-slate-800">Entidades y campos descubiertos</h3>
            <div className="space-y-2">
              {preview.discoveredEntities.map(entity => <div key={entity.key}
                className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="font-medium text-slate-800">{entity.key}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {entity.fields.map(field => field.key + " (" + field.type + ")").join(", ") || "Sin campos"}
                </p>
              </div>)}
            </div>
          </div>}
          {!!preview.discoveredRelations?.length && <div>
            <h3 className="mb-2 font-semibold text-slate-800">Relaciones propuestas</h3>
            <div className="space-y-2">
              {preview.discoveredRelations.map(relation => <p key={relation.key}
                className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                {relation.fromEntity} → {relation.toEntity} ({relation.cardinality})
              </p>)}
            </div>
          </div>}
          {!!preview.reviewPlan?.length && <div>
            <h3 className="mb-2 font-semibold text-slate-800">Decisiones pendientes de revisión</h3>
            <div className="space-y-2">
              {preview.reviewPlan.map((item, index) => <div key={index}
                className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-800">{item.kind}</p>
                <p className="text-slate-700">{item.source}{item.target ? " → " + item.target : ""}</p>
                <p className="mt-1 text-slate-500">{item.reason}</p>
              </div>)}
            </div>
          </div>}
          {!!preview.issues?.length && <pre className="overflow-auto text-xs text-red-700">
            {JSON.stringify(preview.issues, null, 2)}
          </pre>}
          {!!preview.semanticIssues?.length && <pre className="overflow-auto text-xs text-amber-700">
            {JSON.stringify(preview.semanticIssues, null, 2)}
          </pre>}
        </section>
      )}
    </div>
  );
}
