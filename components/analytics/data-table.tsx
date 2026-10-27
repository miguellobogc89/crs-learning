"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, Pencil, X } from "lucide-react";
import type { CellValue, Column, Table } from "@/lib/analytics/compute";
import { editAnalyticsCellAction } from "@/app/(app)/analytics/actions";
import { fmtDate, fmtMoney, fmtNumber } from "./format";

const right = (c: Column) => c.kind === "money" || c.kind === "number";
const show = (v: CellValue, kind?: Column["kind"]) => {
  if (v === null || v === "") return <span className="text-slate-300">—</span>;
  if (kind === "money" && typeof v === "number") return fmtMoney(v);
  if (kind === "number" && typeof v === "number") return fmtNumber(v);
  if (kind === "date" && typeof v === "string") return fmtDate(v);
  return String(v);
};

/**
 * A readable table: numbers right-aligned, a link to the original document of each row, and a few cells that can be
 * corrected in place (company name, "Mi empresa", invoice type and category). Each change is a new revision.
 */
export function DataTable({ table, canEdit = false, limit = 500 }: { table: Table; canEdit?: boolean; limit?: number }) {
  const rows = table.rows.slice(0, limit);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function save(row: Record<string, CellValue>, column: Column, value: unknown) {
    if (!column.edit || typeof row._id !== "string" || typeof row._rev !== "number") return;
    const cell = `${row._id}:${column.key}`;
    setBusy(cell); setError(null);
    const result = await editAnalyticsCellAction({ recordId: row._id, expectedRevision: row._rev, field: column.edit.field, value });
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    startTransition(() => router.refresh());
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
      <div><h2 className="text-base font-semibold text-slate-900">{table.label}</h2><p className="mt-0.5 text-xs text-slate-500">{table.description}</p></div>
      <span className="flex items-center gap-2 text-xs text-slate-500">{pending && <Loader2 className="size-3.5 animate-spin" />}
        {table.rows.length > limit ? `${limit} de ${table.rows.length}` : table.rows.length} filas</span>
    </div>
    {error && <p className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm text-rose-700">{error}</p>}
    {rows.length ? <div className="max-h-[70vh] overflow-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm">
      <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500"><tr>{table.columns.map(c =>
        <th key={c.key} className={"whitespace-nowrap px-4 py-3 font-semibold " + (right(c) ? "text-right" : "")}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={typeof r._id === "string" ? r._id : i} className="border-t border-slate-100 hover:bg-slate-50/60">{table.columns.map(c => {
        const editable = canEdit && !!c.edit && typeof r._id === "string" && typeof r._rev === "number";
        const cellBusy = busy === `${r._id}:${c.key}`;
        return <td key={c.key} className={"px-4 py-2 text-slate-700 " + (right(c) ? "whitespace-nowrap text-right tabular-nums" : c.kind === "date" ? "whitespace-nowrap" : "")}>
          {c.kind === "document" ? (typeof r[c.key] === "string"
              ? <a href={`/api/knowledge/intake/files/${r[c.key]}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[#0A58FF] hover:underline"><FileText className="size-3.5" />Ver</a>
              : <span className="text-slate-300">—</span>)
            : c.kind === "boolean" ? (editable
              ? <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={r[c.key] === true} disabled={cellBusy} onChange={e => void save(r, c, e.target.checked)} />{cellBusy && <Loader2 className="size-3 animate-spin" />}</label>
              : r[c.key] === true ? <Check className="size-4 text-emerald-600" /> : <span className="text-slate-300">—</span>)
            : editable && c.edit!.type === "select"
              ? <select value={c.edit!.options!.find(o => o.label === r[c.key])?.value ?? ""} disabled={cellBusy} onChange={e => void save(r, c, e.target.value)}
                  className="h-7 rounded-md border border-transparent bg-transparent px-1 text-sm hover:border-slate-200 focus:border-[#0A58FF]">
                  {c.edit!.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            : editable && c.edit!.type === "text" ? <EditableText value={String(r[c.key] ?? "")} busy={cellBusy} onSave={v => save(r, c, v)} />
            : show(r[c.key] ?? null, c.kind)}
        </td>;
      })}</tr>)}</tbody>
    </table></div> : <p className="px-5 py-10 text-center text-sm text-slate-500">Todavía no hay datos. Importa documentos desde Conocimiento o desde Drive.</p>}
  </section>;
}

function EditableText({ value, busy, onSave }: { value: string; busy: boolean; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) return <span className="group inline-flex items-center gap-1.5">{value || <span className="text-slate-300">—</span>}
    <button type="button" aria-label="Corregir" onClick={() => { setDraft(value); setEditing(true); }} className="rounded p-0.5 text-slate-300 opacity-0 hover:text-[#0A58FF] group-hover:opacity-100 focus:opacity-100"><Pencil className="size-3.5" /></button>
    {busy && <Loader2 className="size-3 animate-spin text-slate-400" />}</span>;
  const commit = async () => { if (draft.trim() && draft.trim() !== value) await onSave(draft); setEditing(false); };
  return <span className="inline-flex items-center gap-1">
    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void commit(); if (e.key === "Escape") setEditing(false); }}
      className="h-7 w-56 rounded-md border border-[#0A58FF] px-2 text-sm outline-none" />
    <button type="button" aria-label="Guardar" onClick={() => void commit()} className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check className="size-3.5" /></button>
    <button type="button" aria-label="Cancelar" onClick={() => setEditing(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="size-3.5" /></button>
  </span>;
}
