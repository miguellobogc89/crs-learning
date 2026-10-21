"use client";

import { useState } from "react";

type FileOption = { id: string; name: string };
type ImportOutcome = {
  status: string; typesCreated: number; fieldsCreated: number;
  recordsCreated: number; recordsReused: number; recordsPending: number;
  relationDefinitionsCreated?: number; relationsProposed?: number;
  issues?: string[]; writesPerformed: boolean;
};
export function EngineControlledImport({ files }: { files: FileOption[] }) {
  const [fileId, setFileId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<{ fileName: string; result: ImportOutcome } | null>(null);
  async function run() {
    if (!fileId || !confirmed || running) return;
    setRunning(true); setError(""); setOutcome(null);
    try {
      const response = await fetch("/api/engine/controlled-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeFileId: fileId, confirmation: "IMPORTAR_EN_TABLAS_ACTUALES" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Error al importar.");
      setOutcome(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Error inesperado."); }
    finally { setRunning(false); }
  }
  return <section className="rounded-xl border border-amber-200 bg-white p-5 space-y-3">
    <div>
      <h2 className="font-semibold text-slate-900">Laboratorio · Importación controlada</h2>
      <p className="text-xs text-slate-600">Utiliza las tablas existentes del espacio de trabajo. Crea tipos, campos y registros borrador; reutiliza coincidencias y deja los vínculos como propuestas pendientes. No borra datos ni aprueba relaciones automáticamente.</p>
    </div>
    <label className="block text-sm font-medium text-slate-800" htmlFor="engine-import-file">Documento de Knowledge</label>
    <select id="engine-import-file" value={fileId} onChange={e => { setFileId(e.target.value); setConfirmed(false); setOutcome(null); }}
      className="w-full rounded-lg border border-slate-300 p-2 text-sm">
      <option value="">Selecciona un documento</option>
      {files.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}
    </select>
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />
      Confirmo que quiero escribir datos de prueba en las tablas actuales de este espacio de trabajo.
    </label>
    <button type="button" disabled={!fileId || !confirmed || running} onClick={run}
      className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
      {running ? "Importando..." : "Importar documento seleccionado"}
    </button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {outcome && <div className="space-y-2 text-sm" aria-live="polite">
      <p className="font-semibold">{outcome.fileName} · {outcome.result.status}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <p>Tipos creados: {outcome.result.typesCreated}</p>
        <p>Campos creados: {outcome.result.fieldsCreated}</p>
        <p>Registros creados: {outcome.result.recordsCreated}</p>
        <p>Registros reutilizados: {outcome.result.recordsReused}</p>
        <p>Registros pendientes: {outcome.result.recordsPending}</p>
        <p>Vínculos propuestos: {outcome.result.relationsProposed ?? 0}</p>
      </div>
      <p className="text-xs text-slate-500">{outcome.result.writesPerformed ? "Se han realizado escrituras." : "Sin escrituras de datos."} Las relaciones siguen pendientes de revisión.</p>
      {!!outcome.result.issues?.length && <details><summary>Incidencias ({outcome.result.issues.length})</summary>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(outcome.result.issues, null, 2)}</pre>
      </details>}
      <button type="button" onClick={() => window.location.reload()} className="text-sm font-medium text-blue-700 underline">
        Actualizar tablas
      </button>
    </div>}
  </section>;
}
