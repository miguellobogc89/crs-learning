"use client";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, FileText, GitMerge, History, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import type { CellValue, Column, Table } from "@/lib/analytics/compute";
import { activeColumnFilter, queryRows, type ColumnFilter } from "@/lib/analytics/table-query";
import { groupEdits, rowCapabilities, type PendingEdit } from "@/lib/analytics/table-rows";
import { groupRows, PAGE_SIZES } from "@/lib/analytics/table-view";
import { useTableView } from "./table-view-context";
import { addTableRowAction, deleteTableRowsAction, mergeCompaniesAction, restoreTableRowsAction, saveTableChangesAction, setInvoicePartyAction, setTableLinkAction } from "@/app/(app)/analytics/actions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ColumnMenu, describeFilter } from "./column-menu";
import { RecordForm, formValues } from "./record-form";
import { RecordHistory } from "./record-history";
import { Combobox } from "@/components/ui/combobox";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import { fmtDate, fmtMoney, fmtNumber } from "./format";

type Row = Record<string, CellValue>;
/** A correction typed in a cell, not saved yet: shown in yellow until «Guardar». */
type Edit = PendingEdit & { label: string; rowTitle: string; before: CellValue; kind?: Column["kind"]; text: string; error?: string };
type Company = { id: string; nombre: string; nif: string | null };

const right = (c: Column) => c.kind === "money" || c.kind === "number";
/** A value as the cell editor shows it: "12,5", "31/12/2026". */
const editText = (v: CellValue, c: Column) => v === null || v === undefined ? "" : c.edit?.type === "date" && typeof v === "string" ? fmtDate(v)
  : typeof v === "number" ? String(v).replace(".", ",") : String(v);
const show = (v: CellValue, kind?: Column["kind"]) => {
  if (v === null || v === "") return <span className="text-slate-300">—</span>;
  if (kind === "money" && typeof v === "number") return fmtMoney(v);
  if (kind === "number" && typeof v === "number") return fmtNumber(v);
  if (kind === "date" && typeof v === "string") return fmtDate(v);
  return String(v);
};

/**
 * A readable table with search, filters, sorting and pages; a link to the original document of each row; and a few
 * cells that can be corrected in place (company name, "Mi empresa", invoice type, category, issuer and customer).
 * Each change is a new revision of the record. Which columns show, the grouping, the order and the rows per page come
 * from the person's saved view (header «Ajustes»); grouped, each group shows its rows count and its totals.
 */
export function DataTable({ table, canEdit = false, canManage = false, companies = [], initialFilters = {} }: { table: Table; canEdit?: boolean; canManage?: boolean; companies?: Company[]; initialFilters?: Record<string, string> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Filters chosen in the column headers (a link like «?pendiente=col» opens with the empty ones of that column).
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>(
    () => Object.fromEntries(Object.entries(initialFilters).filter(([, v]) => v).map(([k, v]) => [k, { values: [v] }])));
  const [edits, setEdits] = useState<Map<string, Edit>>(new Map());
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ title: string; initial: Record<string, string | boolean> } | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [undo, setUndo] = useState<{ ids: string[]; text: string } | null>(null);
  const caps = rowCapabilities(table.key);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { view, update } = useTableView(table.columns);
  const { sort, pageSize, groupBy } = view;
  const groupColumn = groupBy ? table.columns.find(c => c.key === groupBy) : undefined;
  // Grouped, the grouping column goes first (each group row then reads «Producto · cantidades · precios…»).
  const columns = useMemo(() => {
    const hidden = new Set(view.hidden);
    let c = table.columns.filter(x => !hidden.has(x.key));
    if (!c.length) c = table.columns;
    return groupColumn ? [groupColumn, ...c.filter(x => x.key !== groupColumn.key)] : c;
  }, [table.columns, view.hidden, groupColumn]);

  // Search looks in every column, also the hidden ones.
  const result = useMemo(() => queryRows(table.rows, table.columns, { search, filters: {}, columnFilters, sort, page: groupColumn ? 1 : page, pageSize: groupColumn ? Number.MAX_SAFE_INTEGER : pageSize }),
    [table, search, columnFilters, sort, page, pageSize, groupColumn]);
  const groups = useMemo(() => groupColumn ? groupRows(result.rows, table.columns, groupColumn.key) : null, [result.rows, table.columns, groupColumn]);
  const groupPages = groups ? Math.max(1, Math.ceil(groups.length / pageSize)) : 1;
  const groupPage = Math.min(page, groupPages);
  const shownGroups = groups?.slice((groupPage - 1) * pageSize, groupPage * pageSize) ?? [];
  const activeFilters = Object.entries(columnFilters).filter(([, f]) => activeColumnFilter(f));
  const active = activeFilters.length + (search ? 1 : 0);
  const mergeable = canManage && table.key === "empresas";
  const titleOf = (r: Row) => { const t = table.title ? r[table.title] : columns.map(c => r[c.key]).find(v => typeof v === "string" && v); return typeof t === "string" && t ? t : "Fila sin nombre"; };
  const recordRows = canEdit && table.rows.some(r => typeof r._id === "string" && typeof r._rev === "number");
  const setFilter = (key: string, f: ColumnFilter | undefined) => { setColumnFilters(old => { const n = { ...old }; if (f) n[key] = f; else delete n[key]; return n; }); setPage(1); };

  // Leaving the page with corrections not saved asks first.
  useEffect(() => {
    if (!edits.size) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edits.size]);

  const setSort = (key: string, dir: "asc" | "desc" | null) => update({ sort: dir ? { key, dir } : null });
  const toggleGroup = (key: string) => setOpen(o => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const refresh = () => startTransition(() => router.refresh());

  async function merge(sourceId: string, targetId: string) {
    setBusy(`${sourceId}:merge`); setError(null); setNotice(null);
    const r = await mergeCompaniesAction({ sourceId, targetId });
    setBusy(null);
    if (!r.ok) { setError(r.error); return false; }
    setNotice(`Empresas unidas: ${r.movidas} ${r.movidas === 1 ? "relación pasada" : "relaciones pasadas"} a la que se queda; la otra queda archivada.`);
    refresh(); return true;
  }
  async function saveParty(row: Row, column: Column, choice: { companyId: string | null; nueva?: { nombre: string; nif?: string } }) {
    if (typeof row._id !== "string" || !column.edit) return false;
    setBusy(`${row._id}:${column.key}`); setError(null);
    const r = await setInvoicePartyAction({ invoiceId: row._id, role: column.edit.field === "issuer" ? "issuer" : "customer", ...choice });
    setBusy(null);
    if (!r.ok) { setError(r.error); return false; }
    refresh(); return true;
  }
  async function saveLink(row: Row, column: Column, targetId: string | null) {
    if (typeof row._id !== "string") return;
    setBusy(`${row._id}:${column.key}`); setError(null);
    const r = await setTableLinkAction({ recordId: row._id, columna: column.key, targetId });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    refresh();
  }
  /** A cell changed: kept as a pending correction (or dropped if it is back to the saved value). */
  async function save(row: Row, column: Column, value: unknown) {
    if (!column.edit || typeof row._id !== "string" || typeof row._rev !== "number") return;
    // A column can be backed by a different field per row (e.g. the price «with tax» when that is what was read).
    const field = typeof row[`_src_${column.key}`] === "string" ? row[`_src_${column.key}`] as string : column.edit.field;
    const key = `${row._id}:${column.key}`;
    const text = typeof value === "boolean" ? (value ? "Sí" : "No") : column.edit.type === "select" ? column.edit.options?.find(o => o.value === value)?.label ?? String(value ?? "") : String(value ?? "");
    const same = column.edit.type === "select" ? text === (row[column.key] ?? "") : typeof value === "boolean" ? value === (row[column.key] === true)
      : text.trim() === editText(row[column.key] ?? null, column);
    setEdits(old => {
      const n = new Map(old);
      if (same) n.delete(key);
      else n.set(key, { recordId: row._id as string, revision: row._rev as number, columnKey: column.key, field, value, label: column.label,
        rowTitle: titleOf(row), before: row[column.key] ?? null, kind: column.kind, text });
      return n;
    });
  }
  async function saveAll() {
    setSaving(true); setError(null); setNotice(null);
    const list = [...edits.values()];
    const r = await saveTableChangesAction({ changes: groupEdits(list) });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    const failed = new Map(r.results.filter(x => !x.ok).map(x => [x.recordId, (x as { error: string }).error]));
    setEdits(new Map([...edits].filter(([, e]) => failed.has(e.recordId)).map(([k, e]) => [k, { ...e, error: failed.get(e.recordId) }])));
    const saved = list.filter(e => !failed.has(e.recordId)).length;
    if (saved) setNotice(`${saved} ${saved === 1 ? "cambio guardado" : "cambios guardados"}. Puedes verlos en el historial de cada fila.`);
    if (failed.size) { setError(`${failed.size} ${failed.size === 1 ? "fila no se pudo guardar" : "filas no se pudieron guardar"}: revisa los cambios marcados en rojo.`); setReviewing(true); }
    else setReviewing(false);
    refresh();
  }
  async function addRow(values: Record<string, string | boolean>) {
    const r = await addTableRowAction({ tableKey: table.key, values });
    if (!r.ok) return r.error;
    setForm(null); setNotice("Registro añadido."); refresh();
    return null;
  }
  async function removeRow(row: Row) {
    setBusy(`${row._id}:remove`); setError(null);
    const r = await deleteTableRowsAction({ tableKey: table.key, records: [{ id: row._id, revision: row._rev }] });
    setBusy(null); setRemoving(null);
    if (!r.ok) { setError(r.error); return; }
    setEdits(old => new Map([...old].filter(([, e]) => e.recordId !== row._id)));
    setUndo({ ids: r.ids, text: `«${titleOf(row)}» eliminado.` }); refresh();
  }
  async function undoRemove() {
    if (!undo) return;
    setBusy("undo");
    const r = await restoreTableRowsAction({ tableKey: table.key, ids: undo.ids });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    setUndo(null); setNotice("Fila recuperada."); refresh();
  }

  const pages = groups ? groupPages : result.pages, current = groups ? groupPage : result.page, count = groups ? groups.length : result.total;
  const from = count ? (current - 1) * pageSize + 1 : 0, to = Math.min(count, current * pageSize);
  const allOpen = !!groups && shownGroups.every(g => open.has(g.key));

  const cells = (r: Row) => columns.map(c => {
            const editable = canEdit && !!c.edit && typeof r._id === "string" && typeof r._rev === "number";
            const cellBusy = busy === `${r._id}:${c.key}`;
            const p = edits.get(`${r._id}:${c.key}`);
            const missing = !p && c.completar && (r[c.key] === null || r[c.key] === undefined || r[c.key] === "");
            const staged = p ? <span className="font-medium text-slate-900">{p.text || <span className="italic text-slate-400">vacío</span>}</span> : undefined;
            return <td key={c.key} title={p ? (p.error ?? `Antes: ${editText(p.before, c) || "vacío"} · sin guardar`) : undefined}
              className={cn("px-4 py-1.5 text-slate-700", right(c) ? "whitespace-nowrap text-right tabular-nums" : c.kind === "date" && "whitespace-nowrap", missing && "bg-amber-50/70",
                p && (p.error ? "bg-rose-100/70" : "bg-amber-100/80"))}>
              {c.kind === "document" ? (typeof r[c.key] === "string"
                  ? <a href={`/api/knowledge/intake/files/${r[c.key]}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[#0A58FF] hover:underline"><FileText className="size-3.5" />Ver</a>
                  : <span className="text-slate-300">—</span>)
                : c.kind === "boolean" ? (editable
                  ? <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" className="size-4 accent-[#0A58FF]" checked={p ? p.value === true : r[c.key] === true} onChange={e => void save(r, c, e.target.checked)} /></label>
                  : r[c.key] === true ? <Check className="size-4 text-emerald-600" /> : <span className="text-slate-300">—</span>)
                : editable && c.edit!.type === "select"
                  ? <Combobox variant="ghost" className="-ml-2.5 h-7" ariaLabel={c.label}
                      value={p ? String(p.value) : c.edit!.options!.find(o => o.label === r[c.key])?.value ?? null} options={c.edit!.options!} onChange={v => void save(r, c, v)} />
                : canEdit && c.edit?.type === "link" && typeof r._id === "string"
                  ? <span className="inline-flex items-center gap-1">
                      <Combobox variant="ghost" className="-ml-2.5 h-7 max-w-[280px]" searchable searchPlaceholder={`Buscar en ${c.label.toLowerCase()}…`} ariaLabel={c.label} disabled={cellBusy}
                        value={(r[`_link_${c.key}`] as string | null) ?? "__none"} limit={40}
                        options={[{ value: "__none", label: "— Sin enlazar" }, ...(c.edit.options ?? [])]}
                        renderValue={o => !o || o.value === "__none" ? <span className={c.completar ? "font-medium text-amber-700" : "text-slate-400"}>{c.completar ? "Por completar" : "Sin enlazar"}</span> : o.label}
                        onChange={v => { if (v !== ((r[`_link_${c.key}`] as string | null) ?? "__none")) void saveLink(r, c, v === "__none" ? null : v); }} />
                      {cellBusy && <Loader2 className="size-3 animate-spin text-slate-400" />}</span>
                : editable && (c.edit!.type === "number" || c.edit!.type === "date")
                  ? <EditableText value={p ? p.text : editText(r[c.key] ?? null, c)}
                      display={staged ?? (missing ? <span className="font-medium text-amber-700">Por completar</span> : show(r[c.key] ?? null, c.kind))} allowEmpty busy={false} onSave={v => save(r, c, v)} />
                : canEdit && c.edit?.type === "party" && typeof r._id === "string"
                  ? <PartyCell current={(c.edit.field === "issuer" ? r._issuer : r._customer) as string | null} label={c.label} companies={companies} busy={cellBusy}
                      onSave={choice => saveParty(r, c, choice)} />
                : editable && c.edit!.type === "text" ? <EditableText value={p ? p.text : String(r[c.key] ?? "")} allowEmpty={!!c.completar || table.key.startsWith("tabla:") || table.key.startsWith("plantilla:")}
                    display={staged ?? (missing ? <span className="font-medium text-amber-700">Por completar</span> : undefined)} busy={false} onSave={v => save(r, c, v)} />
                : missing ? <span className="font-medium text-amber-700">Por completar</span>
                : show(r[c.key] ?? null, c.kind)}
            </td>;
          });
  // A row that needs the person (`_attention`: why) stands out in light yellow.
  const row = (r: Row, key: string) => <tr key={key} title={typeof r._attention === "string" ? r._attention : undefined}
    className={cn("border-t border-slate-100", typeof r._attention === "string" ? "bg-amber-50/60 hover:bg-amber-50" : "hover:bg-slate-50/60")}>
    {cells(r)}
    {mergeable && <td className="whitespace-nowrap px-4 py-1.5 text-right">{typeof r._id === "string" &&
      <MergeControl row={r} rows={table.rows} busy={busy === `${r._id}:merge`} onMerge={target => merge(r._id as string, target)} />}</td>}
    {recordRows && <td className="w-10 px-2 py-1.5 text-right">{typeof r._id === "string" && typeof r._rev === "number" &&
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Acciones de ${titleOf(r)}`} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            {busy === `${r._id}:remove` ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setHistory(r)}><History className="size-4" />Historial</DropdownMenuItem>
          {caps.add && <DropdownMenuItem onSelect={() => setForm({ title: "Duplicar registro", initial: formValues(table.columns, r) })}><Copy className="size-4" />Duplicar</DropdownMenuItem>}
          {caps.remove && <><DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(r)}><Trash2 className="size-4" />Eliminar</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>}</td>}
  </tr>;

  return <section className="overflow-clip rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="border-b border-slate-200 px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:w-72" placeholder="Buscar en la tabla…" value={search} onChange={v => { setSearch(v); setPage(1); }} />
        {active > 0 && <button type="button" onClick={() => { setSearch(""); setColumnFilters({}); setPage(1); }}
          className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900"><X className="size-3.5" />Limpiar</button>}
        {canEdit && caps.add && <button type="button" onClick={() => setForm({ title: "Añadir registro", initial: {} })}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0A58FF] px-3.5 text-sm font-medium text-white hover:bg-[#0848d6]"><Plus className="size-4" />Añadir registro</button>}
        <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-slate-500">{pending && <Loader2 className="size-3.5 animate-spin" />}
          {groupColumn && <span className="rounded-full bg-[#0A58FF]/10 px-2 py-0.5 font-medium text-[#0A58FF]">Agrupado por {groupColumn.label.toLowerCase()}</span>}
          {result.total === table.rows.length ? `${table.rows.length.toLocaleString("es-ES")} filas` : `${result.total.toLocaleString("es-ES")} de ${table.rows.length.toLocaleString("es-ES")} filas`}</span>
      </div>
      {activeFilters.length > 0 && <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {activeFilters.map(([key, f]) => { const c = table.columns.find(x => x.key === key); if (!c) return null;
          return <span key={key} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#0A58FF]/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-[#0A58FF]">
            <span className="truncate">{describeFilter(c, f, table.rows)}</span>
            <button type="button" aria-label={`Quitar filtro de ${c.label}`} onClick={() => setFilter(key, undefined)} className="rounded-full p-0.5 hover:bg-[#0A58FF]/15"><X className="size-3" /></button>
          </span>; })}
      </div>}
    </div>
    {undo && <p className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2 text-sm text-slate-700">{undo.text}
      <button type="button" onClick={() => void undoRemove()} disabled={busy === "undo"} className="inline-flex items-center gap-1 font-medium text-[#0A58FF] hover:underline">
        {busy === "undo" ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}Deshacer</button>
      <button type="button" aria-label="Cerrar" onClick={() => setUndo(null)} className="ml-auto rounded p-0.5 text-slate-400 hover:bg-slate-200"><X className="size-3.5" /></button></p>}
    {error && <p className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm text-rose-700">{error}</p>}
    {notice && <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-sm text-emerald-800">{notice}</p>}
    {table.rows.length ? <>
      <div className="max-h-[65vh] overflow-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500"><tr>
          {columns.map(c => <th key={c.key} className={cn("whitespace-nowrap px-4 py-2.5 font-semibold", right(c) && "text-right")}
            aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
            {c.kind === "document" ? c.label : <ColumnMenu column={c} rows={table.rows} sort={sort} filter={columnFilters[c.key]} alignRight={right(c)}
              onSort={dir => setSort(c.key, dir)} onFilter={f => setFilter(c.key, f)}
              onHide={columns.length > 1 ? () => update({ hidden: [...view.hidden, c.key] }) : undefined} />}
          </th>)}
          {mergeable && <th className="px-4 py-2.5" />}
          {recordRows && <th className="w-10 px-2 py-2.5" />}
        </tr></thead>
        <tbody>{groups ? shownGroups.map(g => {
          const expanded = open.has(g.key);
          // The group row reads like one summarised row: shared values shown, amounts added, prices as a range.
          const summary = (c: Column) => {
            if (c.key === groupColumn!.key) return <span className={cn("font-semibold", g.key === "__empty" ? "text-slate-400" : "text-slate-900")}>{g.label}</span>;
            const cell = g.cells[c.key];
            if (!cell || cell.type === "empty") return null;
            if (cell.type === "same") return show(cell.value, c.kind);
            if (cell.type === "sum") return <span className="font-semibold text-slate-900">{c.kind === "money" ? fmtMoney(cell.value) : fmtNumber(cell.value)}</span>;
            if (cell.type === "range") return <span>{c.kind === "money" ? `${fmtMoney(cell.min)} – ${fmtMoney(cell.max)}` : `${fmtNumber(cell.min)} – ${fmtNumber(cell.max)}`}</span>;
            return <span className="text-xs italic text-slate-400">{cell.count} distintos</span>;
          };
          return [<tr key={`g:${g.key}`} className="border-t border-slate-200 bg-slate-50/70 hover:bg-slate-100/70">
            {columns.map((c, ci) => <td key={c.key} className={cn("px-4 py-2 text-slate-700", right(c) ? "whitespace-nowrap text-right tabular-nums" : c.kind === "date" && "whitespace-nowrap")}>
              {ci === 0 ? <button type="button" onClick={() => toggleGroup(g.key)} aria-expanded={expanded} className="flex w-full items-center gap-2 text-left">
                <ChevronDown className={cn("size-4 shrink-0 text-slate-400 transition-transform", !expanded && "-rotate-90")} />
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500 ring-1 ring-slate-200" title="Filas en el grupo">{g.rows.length.toLocaleString("es-ES")}</span>
                <span className="min-w-0 truncate">{summary(c)}</span>
              </button> : summary(c)}
            </td>)}
            {mergeable && <td />}
            {recordRows && <td />}
          </tr>, ...(expanded ? g.rows.map((r, i) => row(r, typeof r._id === "string" ? r._id : `${g.key}-${i}`)) : [])];
        }) : result.rows.map((r, i) => row(r, typeof r._id === "string" ? r._id : `${result.page}-${i}`))}
        {!result.rows.length && <tr><td colSpan={columns.length + (mergeable ? 1 : 0) + (recordRows ? 1 : 0)} className="px-4 py-10 text-center text-sm text-slate-500">Ninguna fila coincide con la búsqueda o los filtros.</td></tr>}</tbody>
      </table></div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
        <span className="flex items-center gap-2">{groups ? "Grupos" : "Filas"} por página
          <Combobox className="h-7 w-[72px]" ariaLabel="Por página" value={String(pageSize)} options={PAGE_SIZES.map(n => ({ value: String(n), label: String(n) }))}
            onChange={v => { update({ pageSize: Number(v) }); setPage(1); }} />
          {groups && <button type="button" onClick={() => setOpen(o => { const n = new Set(o); for (const g of shownGroups) { if (allOpen) n.delete(g.key); else n.add(g.key); } return n; })}
            className="ml-2 rounded-lg px-2 py-1 font-medium text-[#0A58FF] hover:bg-[#0A58FF]/5">{allOpen ? "Contraer todo" : "Desplegar todo"}</button>}</span>
        <span className="flex items-center gap-1">
          <span className="mr-2 tabular-nums">{from.toLocaleString("es-ES")}–{to.toLocaleString("es-ES")} de {count.toLocaleString("es-ES")}{groups ? (count === 1 ? " grupo" : " grupos") : ""}</span>
          <button type="button" aria-label="Página anterior" disabled={current <= 1} onClick={() => setPage(current - 1)}
            className="inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white hover:border-slate-300 disabled:opacity-40"><ChevronLeft className="size-3.5" /></button>
          {pageNumbers(current, pages).map((n, i) => n === null ? <span key={`gap${i}`} className="px-1">…</span>
            : <button key={n} type="button" onClick={() => setPage(n)} aria-current={n === current ? "page" : undefined}
                className={cn("inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-2 tabular-nums", n === current ? "bg-[#0A58FF] font-medium text-white" : "hover:bg-slate-100")}>{n}</button>)}
          <button type="button" aria-label="Página siguiente" disabled={current >= pages} onClick={() => setPage(current + 1)}
            className="inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white hover:border-slate-300 disabled:opacity-40"><ChevronRight className="size-3.5" /></button>
        </span>
      </div>
    </> : <p className="px-5 py-10 text-center text-sm text-slate-500">{caps.add && canEdit ? "La tabla está vacía. Usa «Añadir registro» para empezar." : "Todavía no hay datos. Importa documentos desde Conocimiento o desde Drive."}</p>}

    {edits.size > 0 && <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-sm">
      <span className="font-medium text-amber-900">{edits.size} {edits.size === 1 ? "cambio sin guardar" : "cambios sin guardar"}</span>
      <button type="button" onClick={() => setReviewing(true)} className="font-medium text-[#0A58FF] hover:underline">Revisar</button>
      <span className="ml-auto flex gap-2">
        <button type="button" disabled={saving} onClick={() => setEdits(new Map())} className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-amber-100">Descartar</button>
        <button type="button" disabled={saving} onClick={() => setReviewing(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A58FF] px-3.5 py-1.5 font-medium text-white hover:bg-[#0848d6] disabled:opacity-50">
          {saving && <Loader2 className="size-3.5 animate-spin" />}Guardar cambios</button>
      </span>
    </div>}

    <Dialog open={reviewing && edits.size > 0} onOpenChange={o => { if (!o && !saving) setReviewing(false); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>¿Guardar estos cambios?</DialogTitle>
          <DialogDescription>Cada fila guarda una versión nueva; la anterior queda en su historial y se puede restaurar.</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>
              <th className="px-3 py-2 font-medium">Fila</th><th className="px-3 py-2 font-medium">Columna</th>
              <th className="px-3 py-2 font-medium">Antes</th><th className="px-3 py-2 font-medium">Después</th><th className="w-8" />
            </tr></thead>
            <tbody>{[...edits].map(([key, e]) => <tr key={key} className={cn("border-t border-slate-100 align-top", e.error && "bg-rose-50")}>
              <td className="max-w-[180px] truncate px-3 py-2 font-medium text-slate-800" title={e.rowTitle}>{e.rowTitle}</td>
              <td className="px-3 py-2 text-slate-600">{e.label}</td>
              <td className="px-3 py-2 text-slate-400 line-through">{show(e.before, e.kind)}</td>
              <td className="px-3 py-2 text-slate-900">{e.text || <span className="italic text-slate-400">vacío</span>}
                {e.error && <p className="mt-0.5 text-xs text-rose-700">{e.error}</p>}</td>
              <td className="px-1 py-1.5"><button type="button" aria-label="Quitar este cambio" disabled={saving}
                onClick={() => setEdits(old => { const n = new Map(old); n.delete(key); return n; })} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="size-3.5" /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={() => setReviewing(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Seguir editando</button>
          <button type="button" disabled={saving} onClick={() => void saveAll()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0A58FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0848d6] disabled:opacity-50">
            {saving && <Loader2 className="size-4 animate-spin" />}Guardar {edits.size} {edits.size === 1 ? "cambio" : "cambios"}</button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!removing} onOpenChange={o => { if (!o) setRemoving(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Eliminar esta fila?</DialogTitle>
          <DialogDescription>«{removing ? titleOf(removing) : ""}» sale de la tabla. Su historial se conserva y podrás deshacerlo justo después.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setRemoving(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button type="button" disabled={!!busy} onClick={() => removing && void removeRow(removing)}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
            {busy?.endsWith(":remove") && <Loader2 className="size-4 animate-spin" />}Eliminar</button>
        </div>
      </DialogContent>
    </Dialog>

    {form && <RecordForm key={form.title + JSON.stringify(form.initial)} open title={form.title} columns={table.columns} initial={form.initial}
      onClose={() => setForm(null)} onSubmit={addRow} />}
    {history && typeof history._id === "string" && typeof history._rev === "number" &&
      <RecordHistory recordId={history._id} title={titleOf(history)} columns={table.columns} currentRevision={history._rev}
        onClose={() => setHistory(null)} onRestored={() => { setHistory(null); setNotice("Versión restaurada."); refresh(); }} />}
  </section>;
}

/** 1 … 4 5 6 … 12 */
function pageNumbers(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = [...new Set([1, pages, page - 1, page, page + 1].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
  return set.flatMap((n, i) => i && n - set[i - 1] > 1 ? [null, n] : [n]);
}

function EditableText({ value, busy, onSave, display, allowEmpty = false }: { value: string; busy: boolean; onSave: (v: string) => Promise<void>; display?: ReactNode; allowEmpty?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const done = useRef(false);
  const start = () => { done.current = false; setDraft(value); setEditing(true); };
  const cancel = () => { done.current = true; setEditing(false); };
  // Double click on the value (or the pencil) to correct it; Enter saves, Esc cancels.
  if (!editing) return <span className="group inline-flex cursor-text items-center gap-1.5 rounded px-0.5 -mx-0.5 hover:bg-[#0A58FF]/5" onDoubleClick={start} title="Doble clic para editar">{display ?? (value || <span className="text-slate-300">—</span>)}
    <button type="button" aria-label="Corregir" onClick={start} className="rounded p-0.5 text-slate-300 opacity-0 hover:text-[#0A58FF] group-hover:opacity-100 focus:opacity-100"><Pencil className="size-3.5" /></button>
    {busy && <Loader2 className="size-3 animate-spin text-slate-400" />}</span>;
  // Saved once: Enter, the tick, or leaving the field (unless cancelled with Esc or the cross).
  const commit = async () => { if (done.current) return; done.current = true; if ((draft.trim() || allowEmpty) && draft.trim() !== value) await onSave(draft); setEditing(false); };
  return <span className="inline-flex items-center gap-1">
    <input autoFocus onFocus={e => e.target.select()} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void commit(); if (e.key === "Escape") cancel(); }} onBlur={() => void commit()}
      className="h-7 w-56 rounded-lg border border-[#0A58FF] px-2 text-sm outline-none" />
    <button type="button" aria-label="Guardar" onMouseDown={e => e.preventDefault()} onClick={() => void commit()} className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check className="size-3.5" /></button>
    <button type="button" aria-label="Cancelar" onMouseDown={e => e.preventDefault()} onClick={cancel} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="size-3.5" /></button>
  </span>;
}

const companyOption = (r: Row) => ({ value: r._id as string, label: String(r.empresa ?? "Sin nombre"), hint: typeof r.nif === "string" ? r.nif : null });

/** "Unir con…": choose the company this one really is, confirm, done. */
function MergeControl({ row, rows, busy, onMerge }: { row: Row; rows: Row[]; busy: boolean; onMerge: (target: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const others = rows.filter(r => typeof r._id === "string" && r._id !== row._id).map(companyOption);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-[#0A58FF]">
    <GitMerge className="size-3.5" />Unir con…</button>;
  const chosen = others.find(o => o.value === target);
  return <div className="flex w-[320px] flex-col items-end gap-1.5 whitespace-normal text-left">
    <Combobox className="h-8 w-full" searchable searchPlaceholder="Buscar empresa…" placeholder="Es la misma que…" value={target} options={others} onChange={setTarget} />
    {chosen && <p className="text-[11px] text-slate-600">«{row.empresa}» se une a «{chosen.label}»: sus facturas y relaciones pasan a «{chosen.label}», se completan los datos que le falten y «{row.empresa}» queda archivada.</p>}
    <div className="flex gap-1">
      <button type="button" disabled={!target || busy} onClick={() => void onMerge(target!).then(ok => { if (ok) setOpen(false); })}
        className="inline-flex items-center gap-1 rounded-lg bg-[#0A58FF] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40">{busy && <Loader2 className="size-3 animate-spin" />}Unir</button>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); setTarget(null); }} className="rounded-lg px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100">Cancelar</button>
    </div>
  </div>;
}

/** Issuer or customer of an invoice: a saved company (with search), none, or a new one (name and, if known, NIF/CIF). */
function PartyCell({ current, label, companies, busy, onSave }: { current: string | null; label: string; companies: Company[]; busy: boolean;
  onSave: (choice: { companyId: string | null; nueva?: { nombre: string; nif?: string } }) => Promise<boolean> }) {
  const [creating, setCreating] = useState(false);
  const [nombre, setNombre] = useState("");
  const [nif, setNif] = useState("");
  if (creating) return <span className="flex min-w-[260px] flex-col gap-1">
    <input autoFocus placeholder="Nombre de la empresa" value={nombre} onChange={e => setNombre(e.target.value)} className="h-7 rounded-lg border border-[#0A58FF] px-2 text-sm outline-none" />
    <span className="flex items-center gap-1">
      <input placeholder="NIF/CIF (opcional)" value={nif} onChange={e => setNif(e.target.value)} className="h-7 w-36 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-[#0A58FF]" />
      <button type="button" disabled={!nombre.trim() || busy} onClick={() => void onSave({ companyId: null, nueva: { nombre, nif } }).then(ok => { if (ok) { setCreating(false); setNombre(""); setNif(""); } })}
        className="inline-flex items-center gap-1 rounded-lg bg-[#0A58FF] px-2 py-1 text-xs font-medium text-white disabled:opacity-40">{busy && <Loader2 className="size-3 animate-spin" />}Crear</button>
      <button type="button" onClick={() => setCreating(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="size-3.5" /></button>
    </span>
  </span>;
  return <span className="inline-flex items-center gap-1">
    <Combobox variant="ghost" className="-ml-2.5 h-7 max-w-[240px]" searchable searchPlaceholder="Buscar empresa o NIF…" ariaLabel={label} disabled={busy}
      placeholder="Sin empresa" value={current ?? "__none"} limit={30}
      options={[{ value: "__none", label: "— Ninguna" }, ...companies.map(c => ({ value: c.id, label: c.nombre, hint: c.nif }))]}
      actions={[{ label: "Nueva empresa…", icon: <Plus className="size-3.5" />, onSelect: () => setCreating(true) }]}
      renderValue={o => !o || o.value === "__none" ? <span className="text-slate-400">Sin empresa</span> : o.label}
      onChange={v => { if (v !== (current ?? "__none")) void onSave({ companyId: v === "__none" ? null : v }); }} />
    {busy && <Loader2 className="size-3 animate-spin text-slate-400" />}
  </span>;
}
