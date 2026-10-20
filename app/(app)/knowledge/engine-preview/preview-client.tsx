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
  const [copyStatus, setCopyStatus] = useState("");

  async function runPreview() {
    if (!fileId || pending) return;
    setPending(true);
    setError("");
    setPreview(null);
    setCopyStatus("");
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

  async function copyJson() {
    if (!preview) return;
    try {
      // Copy the complete API response, not only the visible summary.
      await navigator.clipboard.writeText(JSON.stringify(preview, null, 2));
      setCopyStatus("JSON completo copiado");
    } catch {
      setCopyStatus("No se pudo copiar. Comprueba los permisos del navegador.");
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <section className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4">
        <label htmlFor="engine-file" className="block text-sm font-semibold text-slate-800">
          Documento procesado en Knowledge
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <select id="engine-file" value={fileId}
            onChange={event => { setFileId(event.target.value); setPreview(null); setCopyStatus(""); }}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
            {files.length === 0 && <option value="">No hay archivos listos</option>}
            {files.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}
          </select>
          <button type="button" onClick={runPreview} disabled={!fileId || pending}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Analizando…" : "Analizar con Engine"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Vista previa de solo lectura. No se crean registros ni se aprueban equivalencias.
        </p>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      </section>

      {preview && (
        <section className="flex min-h-0 max-h-[min(65vh,640px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">Resultado del análisis</h2>
              <p className="mt-1 break-words text-xs text-slate-600">{preview.status} · Sin escrituras en Engine</p>
            </div>
            <button type="button" onClick={copyJson}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
              Copiar JSON completo
            </button>
          </div>
          {copyStatus && <p role="status" className="shrink-0 px-4 pt-2 text-xs text-slate-600">{copyStatus}</p>}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xl font-semibold text-slate-900">{preview.discoveredEntities?.length ?? 0}</p>
                <p className="text-xs text-slate-500">Entidades</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xl font-semibold text-slate-900">{preview.discoveredRelations?.length ?? 0}</p>
                <p className="text-xs text-slate-500">Relaciones</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xl font-semibold text-slate-900">{preview.reviewPlan?.length ?? 0}</p>
                <p className="text-xs text-slate-500">Revisiones</p>
              </div>
            </div>
            {!!preview.discoveredEntities?.length && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Entidades descubiertas</h3>
                <div className="flex flex-wrap gap-2">
                  {preview.discoveredEntities.map(entity => (
                    <span key={entity.key} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">
                      {entity.key} <span className="text-slate-400">({entity.fields.length} campos)</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!!preview.reviewPlan?.length && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Revisión pendiente</h3>
                <div className="space-y-1.5">
                  {preview.reviewPlan.map((item, index) => (
                    <p key={index} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <span className="font-semibold">{item.kind}</span> · {item.source}
                      {item.target ? " → " + item.target : ""}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {!!preview.issues?.length && <p className="text-xs text-red-700">
              {preview.issues.length} incidencias en el descubrimiento. Copia el JSON para verlas.
            </p>}
            {!!preview.semanticIssues?.length && <p className="text-xs text-amber-700">
              {preview.semanticIssues.length} incidencias en la comparación semántica. Copia el JSON para verlas.
            </p>}
          </div>
        </section>
      )}
    </div>
  );
}
