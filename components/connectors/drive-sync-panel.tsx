"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KnowledgeImportModal } from "@/components/knowledge/import/modal";

type Summary = { loteId: string | null; libraryId: string | null; importados: number; duplicados: number; omitidos: { nombre: string; motivo: string }[]; pendientes: number; listaIncompleta: boolean };
export type LastSync = { at: string; loteId: string | null; importados: number; duplicados: number; omitidos: number };
const BATCH = 10;

const when = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "Sincronizar ahora": brings the next 10 new documents of the folder as one import and opens it, so it runs
 * through the pipeline up to "Guardar en mis datos" (which always waits for the person).
 */
export function DriveSyncPanel({ folderId, canManage, lastSync: initialLast }: { folderId: string; canManage: boolean; lastSync: LastSync | null }) {
  const [pending, setPending] = useState<{ pendientes: number; listaIncompleta: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [last, setLast] = useState(initialLast);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ id: string; libraryId: string } | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/connectors/google-drive/sync").then(async r => { const json = await r.json(); if (r.ok) setPending(json); else setError(json.error); }).catch(() => undefined);
  }, []);
  useEffect(() => { setPending(null); setSummary(null); refresh(); }, [folderId, refresh]);

  async function sync() {
    setSyncing(true); setError(null); setSummary(null);
    try {
      const r = await fetch("/api/connectors/google-drive/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: BATCH }) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "No se pudo sincronizar");
      setSummary(json);
      setPending({ pendientes: json.pendientes, listaIncompleta: json.listaIncompleta });
      setLast({ at: new Date().toISOString(), loteId: json.loteId, importados: json.importados, duplicados: json.duplicados, omitidos: json.omitidos.length });
      if (json.loteId && json.libraryId) setOpened({ id: json.loteId, libraryId: json.libraryId });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSyncing(false); }
  }

  return <div className="space-y-3 border-t border-slate-100 px-5 py-4">
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">
          {pending === null ? "Comprobando qué falta por traer…" : pending.pendientes === 0 ? "Todo traído: no hay documentos nuevos"
            : `${pending.listaIncompleta ? "Más de " : ""}${plural(pending.pendientes, "documento sin traer", "documentos sin traer")}`}
        </p>
        <p className="text-xs text-slate-500">Cada sincronización trae hasta {BATCH} documentos nuevos (los más recientes primero) y los deja listos para revisar antes de guardar. Lo repetido se salta.</p>
      </div>
      {canManage && <Button variant="brand" size="sm" disabled={syncing || pending?.pendientes === 0} onClick={sync}>
        {syncing ? <><Loader2 className="size-3.5 animate-spin" />Trayendo de Drive…</> : <><RefreshCw className="size-3.5" />Sincronizar ahora</>}</Button>}
    </div>
    {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    {summary && <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <p>{summary.importados ? `${plural(summary.importados, "documento traído", "documentos traídos")}: se están leyendo en la ventana de importación.` : "No había documentos nuevos que traer."}
        {summary.duplicados ? ` ${plural(summary.duplicados, "ya estaba importado", "ya estaban importados")} (se saltan).` : ""}</p>
      {summary.loteId && !opened && <button type="button" className="mt-1 text-xs font-medium text-[#0A58FF] hover:underline"
        onClick={() => setOpened({ id: summary.loteId!, libraryId: summary.libraryId! })}>Abrir la importación</button>}
      {summary.omitidos.length > 0 && <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">{plural(summary.omitidos.length, "archivo no se puede leer", "archivos no se pueden leer")}</summary>
        <ul className="mt-1 list-disc pl-5">{summary.omitidos.map((o, i) => <li key={i}>{o.nombre}: {o.motivo}</li>)}</ul></details>}
    </div>}
    {!summary && last && <p className="text-xs text-slate-500">Última sincronización: {when(last.at)} · {plural(last.importados, "traído", "traídos")}
      {last.duplicados ? ` · ${plural(last.duplicados, "repetido", "repetidos")}` : ""}{last.omitidos ? ` · ${plural(last.omitidos, "no legible", "no legibles")}` : ""}.
      {" "}Las importaciones están en el panel «Importaciones» de Conocimiento.</p>}
    {opened && <KnowledgeImportModal open resumeImportId={opened.id} context={{ origin: "root", libraryId: opened.libraryId }}
      onOpenChange={(next: boolean) => { if (!next) { setOpened(null); refresh(); } }} />}
  </div>;
}
