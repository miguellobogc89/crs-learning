"use client";
import { useEffect, useState } from "react";
import { History, Loader2, RotateCcw } from "lucide-react";
import type { Column } from "@/lib/analytics/compute";
import { revisionChanges, type Revision } from "@/lib/analytics/table-rows";
import { recordHistoryAction, restoreRevisionAction } from "@/app/(app)/analytics/actions";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fmtDate } from "./format";

const STATUS: Record<string, string> = { archived: "Eliminado", active: "Activo", draft: "Borrador" };

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="italic text-slate-400">vacío</span>;
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return v.toLocaleString("es-ES", { maximumFractionDigits: 4 });
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** Who changed what and when in one row, newest first, with «Restaurar» to bring an older version back. */
export function RecordHistory({ recordId, title, columns, currentRevision, onClose, onRestored }: {
  recordId: string; title: string; columns: Column[]; currentRevision: number; onClose: () => void; onRestored: () => void;
}) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void recordHistoryAction({ recordId }).then(r => {
      if (!active) return;
      if (r.ok) setRevisions(r.revisions); else setError(r.error);
    });
    return () => { active = false; };
  }, [recordId]);
  // Field keys of the record → the column names the person knows.
  const label = (field: string) => columns.find(c => c.edit?.field === field || c.key === field)?.label ?? field;
  async function restore(revision: number) {
    setBusy(revision); setError(null);
    const r = await restoreRevisionAction({ recordId, expectedRevision: currentRevision, revision });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    onRestored();
  }
  return <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
    <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b border-slate-100 px-5 py-4">
        <SheetTitle className="flex items-center gap-2"><History className="size-4 text-slate-400" />Historial</SheetTitle>
        <SheetDescription className="truncate">{title}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {!revisions && !error && <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="size-4 animate-spin" />Cargando…</p>}
        <ol className="space-y-3">
          {revisions?.map((r, i) => {
            const older = revisions[i + 1];
            const changes = revisionChanges(older ? older.values : null, r.values);
            const statusChanged = older && older.status !== r.status;
            const isCurrent = r.revision === currentRevision;
            return <li key={r.revision} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800">{older ? "Cambio" : "Creación"}{isCurrent && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Actual</span>}</p>
                  <p className="text-xs text-slate-500">{new Date(r.at).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {r.by ? ` · ${r.by}` : ""}</p>
                </div>
                {!isCurrent && r.status !== "archived" && <button type="button" disabled={busy !== null} onClick={() => void restore(r.revision)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#0A58FF] hover:bg-[#0A58FF]/5 disabled:opacity-50">
                  {busy === r.revision ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}Restaurar</button>}
              </div>
              {statusChanged && <p className="mt-2 text-xs text-slate-600">Estado: {STATUS[older.status] ?? older.status} → <b>{STATUS[r.status] ?? r.status}</b></p>}
              {older && changes.length > 0 && <ul className="mt-2 space-y-1 text-xs">
                {changes.map(c => <li key={c.field} className="grid grid-cols-[110px_1fr] gap-2">
                  <span className="truncate text-slate-400">{label(c.field)}</span>
                  <span className="min-w-0 break-words text-slate-700"><span className="text-slate-400 line-through">{show(c.before)}</span> → {show(c.after)}</span>
                </li>)}
              </ul>}
              {older && !changes.length && !statusChanged && <p className="mt-2 text-xs text-slate-400">Sin cambios en los datos.</p>}
            </li>;
          })}
        </ol>
      </div>
    </SheetContent>
  </Sheet>;
}
