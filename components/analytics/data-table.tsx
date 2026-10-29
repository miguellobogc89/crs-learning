"use client";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, FileText, GitMerge, Loader2, Pencil, Plus, X } from "lucide-react";
import type { CellValue, Column, Table } from "@/lib/analytics/compute";
import { filterOptions, queryRows } from "@/lib/analytics/table-query";
import { groupRows, PAGE_SIZES } from "@/lib/analytics/table-view";
import { useTableView } from "./table-view-context";
import { editAnalyticsCellAction, mergeCompaniesAction, setInvoicePartyAction, setTableLinkAction } from "@/app/(app)/analytics/actions";
import { Combobox } from "@/components/ui/combobox";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import { fmtDate, fmtMoney, fmtNumber } from "./format";

type Row = Record<string, CellValue>;
type Company = { id: string; nombre: string; nif: string | null };

const right = (c: Column) => c.kind === "money" || c.kind === "number";
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
export function DataTable({ table, canEdit = false, companies = [], initialFilters = {} }: { table: Table; canEdit?: boolean; companies?: Company[]; initialFilters?: Record<string, string> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
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

  const filterable = table.columns.filter(c => c.filter);
  const options = useMemo(() => Object.fromEntries(filterable.map(c => [c.key, filterOptions(table.rows, c)])), [table.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  // Search looks in every column, also the hidden ones.
  const result = useMemo(() => queryRows(table.rows, table.columns, { search, filters, sort, page: groupColumn ? 1 : page, pageSize: groupColumn ? Number.MAX_SAFE_INTEGER : pageSize }),
    [table, search, filters, sort, page, pageSize, groupColumn]);
  const groups = useMemo(() => groupColumn ? groupRows(result.rows, table.columns, groupColumn.key) : null, [result.rows, table.columns, groupColumn]);
  const groupPages = groups ? Math.max(1, Math.ceil(groups.length / pageSize)) : 1;
  const groupPage = Math.min(page, groupPages);
  const shownGroups = groups?.slice((groupPage - 1) * pageSize, groupPage * pageSize) ?? [];
  const active = Object.values(filters).filter(Boolean).length + (search ? 1 : 0);
  const mergeable = canEdit && table.key === "empresas";

  function toggleSort(key: string) {
    update({ sort: !sort || sort.key !== key ? { key, dir: "asc" } : sort.dir === "asc" ? { key, dir: "desc" } : null });
  }
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
  async function save(row: Row, column: Column, value: unknown) {
    if (!column.edit || typeof row._id !== "string" || typeof row._rev !== "number") return;
    setBusy(`${row._id}:${column.key}`); setError(null);
    // A column can be backed by a different field per row (e.g. the price «with tax» when that is what was read).
    const field = typeof row[`_src_${column.key}`] === "string" ? row[`_src_${column.key}`] as string : column.edit.field;
    const r = await editAnalyticsCellAction({ recordId: row._id, expectedRevision: row._rev, field, value });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    refresh();
  }

  const pages = groups ? groupPages : result.pages, current = groups ? groupPage : result.page, count = groups ? groups.length : result.total;
  const from = count ? (current - 1) * pageSize + 1 : 0, to = Math.min(count, current * pageSize);
  const allOpen = !!groups && shownGroups.every(g => open.has(g.key));

  const cells = (r: Row) => columns.map(c => {
            const editable = canEdit && !!c.edit && typeof r._id === "string" && typeof r._rev === "number";
            const cellBusy = busy === `${r._id}:${c.key}`;
            const missing = c.completar && (r[c.key] === null || r[c.key] === undefined || r[c.key] === "");
            return <td key={c.key} className={cn("px-4 py-1.5 text-slate-700", right(c) ? "whitespace-nowrap text-right tabular-nums" : c.kind === "date" && "whitespace-nowrap", missing && "bg-amber-50/70")}>
              {c.status ? <ReviewChip state={typeof r._review === "string" ? r._review : null} label={r[c.key] ?? null} note={typeof r._review_nota === "string" ? r._review_nota : null} />
              : c.kind === "document" ? (typeof r[c.key] === "string"
                  ? <a href={`/api/knowledge/intake/files/${r[c.key]}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[#0A58FF] hover:underline"><FileText className="size-3.5" />Ver</a>
                  : <span className="text-slate-300">—</span>)
                : c.kind === "boolean" ? (editable
                  ? <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" className="size-4 accent-[#0A58FF]" checked={r[c.key] === true} disabled={cellBusy} onChange={e => void save(r, c, e.target.checked)} />{cellBusy && <Loader2 className="size-3 animate-spin" />}</label>
                  : r[c.key] === true ? <Check className="size-4 text-emerald-600" /> : <span className="text-slate-300">—</span>)
                : editable && c.edit!.type === "select"
                  ? <span className="inline-flex items-center gap-1"><Combobox variant="ghost" className="-ml-2.5 h-7" disabled={cellBusy} ariaLabel={c.label}
                      value={c.edit!.options!.find(o => o.label === r[c.key])?.value ?? null} options={c.edit!.options!} onChange={v => void save(r, c, v)} />
                      {cellBusy && <Loader2 className="size-3 animate-spin text-slate-400" />}</span>
                : canEdit && c.edit?.type === "link" && typeof r._id === "string"
                  ? <span className="inline-flex items-center gap-1">
                      <Combobox variant="ghost" className="-ml-2.5 h-7 max-w-[280px]" searchable searchPlaceholder={`Buscar en ${c.label.toLowerCase()}…`} ariaLabel={c.label} disabled={cellBusy}
                        value={(r[`_link_${c.key}`] as string | null) ?? "__none"} limit={40}
                        options={[{ value: "__none", label: "— Sin enlazar" }, ...(c.edit.options ?? [])]}
                        renderValue={o => !o || o.value === "__none" ? <span className={missing ? "font-medium text-amber-700" : "text-slate-400"}>{missing ? "Por completar" : "Sin enlazar"}</span> : o.label}
                        onChange={v => { if (v !== ((r[`_link_${c.key}`] as string | null) ?? "__none")) void saveLink(r, c, v === "__none" ? null : v); }} />
                      {cellBusy && <Loader2 className="size-3 animate-spin text-slate-400" />}</span>
                : editable && (c.edit!.type === "number" || c.edit!.type === "date")
                  ? <EditableText value={r[c.key] === null || r[c.key] === undefined ? "" : c.edit!.type === "date" && typeof r[c.key] === "string" ? fmtDate(r[c.key] as string) : String(r[c.key]).replace(".", ",")}
                      display={missing ? <span className="font-medium text-amber-700">Por completar</span> : show(r[c.key] ?? null, c.kind)} allowEmpty busy={cellBusy} onSave={v => save(r, c, v)} />
                : canEdit && c.edit?.type === "party" && typeof r._id === "string"
                  ? <PartyCell current={(c.edit.field === "issuer" ? r._issuer : r._customer) as string | null} label={c.label} companies={companies} busy={cellBusy}
                      onSave={choice => saveParty(r, c, choice)} />
                : editable && c.edit!.type === "text" ? <EditableText value={String(r[c.key] ?? "")} allowEmpty={!!c.completar || table.key.startsWith("tabla:") || table.key.startsWith("plantilla:")}
                    display={missing ? <span className="font-medium text-amber-700">Por completar</span> : undefined} busy={cellBusy} onSave={v => save(r, c, v)} />
                : missing ? <span className="font-medium text-amber-700">Por completar</span>
                : show(r[c.key] ?? null, c.kind)}
            </td>;
          });
  // Lines the review could not explain (a doubt, missing data) stand out in light yellow.
  const row = (r: Row, key: string) => <tr key={key} className={cn("border-t border-slate-100", r._review === "duda" || r._review === "faltan" ? "bg-amber-50/60 hover:bg-amber-50" : "hover:bg-slate-50/60")}>
    {cells(r)}
    {mergeable && <td className="whitespace-nowrap px-4 py-1.5 text-right">{typeof r._id === "string" &&
      <MergeControl row={r} rows={table.rows} busy={busy === `${r._id}:merge`} onMerge={target => merge(r._id as string, target)} />}</td>}
  </tr>;

  return <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="border-b border-slate-200 px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:w-72" placeholder="Buscar en la tabla…" value={search} onChange={v => { setSearch(v); setPage(1); }} />
        {filterable.map(c => <Combobox key={c.key} ariaLabel={`Filtrar por ${c.label}`} className="h-10 max-w-[220px] rounded-xl" value={filters[c.key] ?? ""}
          searchable={(options[c.key]?.length ?? 0) > 8} searchPlaceholder={`Buscar ${c.label.toLowerCase()}…`}
          options={[{ value: "", label: "Todos" }, ...(options[c.key] ?? []).map(o => ({ value: o.value, label: o.label, hint: String(o.count) }))]}
          renderValue={o => <><span className="text-slate-500">{c.label}:</span> <span className={filters[c.key] ? "font-medium text-slate-900" : ""}>{o?.label ?? "Todos"}</span></>}
          onChange={v => { setFilters(f => ({ ...f, [c.key]: v })); setPage(1); }} />)}
        {active > 0 && <button type="button" onClick={() => { setSearch(""); setFilters({}); setPage(1); }}
          className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900"><X className="size-3.5" />Limpiar</button>}
        <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-slate-500">{pending && <Loader2 className="size-3.5 animate-spin" />}
          {groupColumn && <span className="rounded-full bg-[#0A58FF]/10 px-2 py-0.5 font-medium text-[#0A58FF]">Agrupado por {groupColumn.label.toLowerCase()}</span>}
          {result.total === table.rows.length ? `${table.rows.length.toLocaleString("es-ES")} filas` : `${result.total.toLocaleString("es-ES")} de ${table.rows.length.toLocaleString("es-ES")} filas`}</span>
      </div>
    </div>
    {error && <p className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm text-rose-700">{error}</p>}
    {notice && <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-sm text-emerald-800">{notice}</p>}
    {table.rows.length ? <>
      <div className="max-h-[65vh] overflow-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500"><tr>
          {columns.map(c => <th key={c.key} className={cn("whitespace-nowrap px-4 py-2.5 font-semibold", right(c) && "text-right")}
            aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
            {c.kind === "document" ? c.label : <button type="button" onClick={() => toggleSort(c.key)}
              className={cn("inline-flex items-center gap-1 rounded px-1 -mx-1 hover:text-slate-900", sort?.key === c.key && "text-slate-900")}>
              {c.label}{sort?.key !== c.key ? <ArrowUpDown className="size-3 opacity-40" /> : sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            </button>}
          </th>)}
          {mergeable && <th className="px-4 py-2.5" />}
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
          </tr>, ...(expanded ? g.rows.map((r, i) => row(r, typeof r._id === "string" ? r._id : `${g.key}-${i}`)) : [])];
        }) : result.rows.map((r, i) => row(r, typeof r._id === "string" ? r._id : `${result.page}-${i}`))}
        {!result.rows.length && <tr><td colSpan={columns.length + (mergeable ? 1 : 0)} className="px-4 py-10 text-center text-sm text-slate-500">Ninguna fila coincide con la búsqueda o los filtros.</td></tr>}</tbody>
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
    </> : <p className="px-5 py-10 text-center text-sm text-slate-500">Todavía no hay datos. Importa documentos desde Conocimiento o desde Drive.</p>}
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

const CHIP: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200", revisada: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  corregible: "bg-[#0A58FF]/5 text-[#0A58FF] ring-[#0A58FF]/20", regalo: "bg-violet-50 text-violet-700 ring-violet-200",
  duda: "bg-amber-100 text-amber-800 ring-amber-300", faltan: "bg-amber-100 text-amber-800 ring-amber-300",
};
/** The review state of a purchase line, with what was found on hover. */
function ReviewChip({ state, label, note }: { state: string | null; label: CellValue; note: string | null }) {
  if (!state || label === null) return <span className="text-slate-300">—</span>;
  return <span title={note ?? undefined} className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", CHIP[state] ?? "bg-slate-50 text-slate-600 ring-slate-200")}>{String(label)}</span>;
}
