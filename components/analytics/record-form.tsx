"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { CellValue, Column } from "@/lib/analytics/compute";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fmtDate } from "./format";

/** Columns the form can fill: plain values (links are chosen afterwards in the table). */
export const formColumns = (columns: Column[]) =>
  columns.filter(c => c.edit && ["text", "number", "date", "boolean", "select"].includes(c.edit.type));

/** A row's values as the form shows them ("12,5", "31/12/2026"), for «Duplicar». */
export function formValues(columns: Column[], row: Record<string, CellValue> | null): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  if (!row) return out;
  for (const c of formColumns(columns)) {
    const v = row[c.key];
    if (v === null || v === undefined || v === "") continue;
    out[c.edit!.field] = typeof v === "boolean" ? v : c.edit!.type === "date" && typeof v === "string" ? fmtDate(v)
      : c.edit!.type === "select" ? c.edit!.options?.find(o => o.label === v)?.value ?? String(v) : typeof v === "number" ? String(v).replace(".", ",") : String(v);
  }
  return out;
}

/** «Añadir registro» / «Duplicar»: a side panel with one field per column, checked by the server before it is saved. */
export function RecordForm({ open, title, columns, initial, onClose, onSubmit }: {
  open: boolean; title: string; columns: Column[]; initial: Record<string, string | boolean>;
  onClose: () => void; onSubmit: (values: Record<string, string | boolean>) => Promise<string | null>;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = formColumns(columns);
  const set = (field: string, v: string | boolean) => setValues(old => ({ ...old, [field]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const problem = await onSubmit(values);
    setBusy(false);
    if (problem) setError(problem);
  }
  const input = "h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0A58FF] focus:ring-2 focus:ring-[#0A58FF]/10";
  return <Sheet open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
    <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b border-slate-100 px-5 py-4">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>Los campos vacíos se quedan sin valor. Los enlaces a otras tablas se eligen después en la propia tabla.</SheetDescription>
      </SheetHeader>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {fields.map(c => {
            const field = c.edit!.field, v = values[field];
            return <label key={c.key} className="block text-xs font-medium text-slate-600">
              {c.label}
              {c.edit!.type === "boolean" ? <span className="mt-1.5 flex items-center gap-2 text-sm font-normal text-slate-700">
                  <input type="checkbox" className="size-4 accent-[#0A58FF]" checked={v === true} onChange={e => set(field, e.target.checked)} />Sí</span>
                : c.edit!.type === "select" ? <select className={input + " mt-1"} value={typeof v === "string" ? v : ""} onChange={e => set(field, e.target.value)}>
                    <option value="">—</option>
                    {c.edit!.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                : <input className={input + " mt-1"} value={typeof v === "string" ? v : ""} onChange={e => set(field, e.target.value)}
                    inputMode={c.edit!.type === "number" ? "decimal" : undefined}
                    placeholder={c.edit!.type === "date" ? "DD/MM/AAAA" : c.edit!.type === "number" ? "0,00" : undefined} />}
            </label>;
          })}
          {!fields.length && <p className="text-sm text-slate-500">Esta tabla no tiene columnas que se puedan rellenar a mano.</p>}
        </div>
        {error && <p role="alert" className="mx-5 mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button type="submit" disabled={busy || !fields.length} className="inline-flex items-center gap-2 rounded-lg bg-[#0A58FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0848d6] disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" />}Guardar registro</button>
        </div>
      </form>
    </SheetContent>
  </Sheet>;
}
