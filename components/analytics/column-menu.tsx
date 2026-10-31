"use client";
import { useMemo, useState } from "react";
import { Popover } from "radix-ui";
import { ArrowDown, ArrowDownUp, ArrowUp, ChevronDown, EyeOff, Filter, X } from "lucide-react";
import type { CellValue, Column } from "@/lib/analytics/compute";
import { activeColumnFilter, filterOptions, type ColumnFilter, type Sort } from "@/lib/analytics/table-query";
import { cn } from "@/lib/utils";

const ranged = (c: Column) => c.kind === "money" || c.kind === "number" || c.kind === "date";

/**
 * The menu of a column header, like a spreadsheet's: sort, keep only some values (with how many rows have each),
 * a range for amounts and dates, and hide the column. Changes apply at once.
 */
export function ColumnMenu({ column, rows, sort, filter, onSort, onFilter, onHide, alignRight }: {
  column: Column; rows: Record<string, CellValue>[]; sort: Sort; filter: ColumnFilter | undefined;
  onSort: (dir: "asc" | "desc" | null) => void; onFilter: (f: ColumnFilter | undefined) => void; onHide?: () => void; alignRight?: boolean;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => filterOptions(rows, column), [rows, column]);
  const sorted = sort?.key === column.key ? sort.dir : null;
  const filtered = activeColumnFilter(filter);
  const chosen = new Set(filter?.values ?? options.map(o => o.value));
  const shown = options.filter(o => !query || o.label.toLowerCase().includes(query.toLowerCase()));
  const setValues = (values: string[] | undefined) => {
    const next = { ...filter, values: values && values.length === options.length ? undefined : values };
    onFilter(activeColumnFilter(next) ? next : undefined);
  };
  const setBound = (key: "min" | "max", v: string) => {
    const next = { ...filter, [key]: v };
    onFilter(activeColumnFilter(next) ? next : undefined);
  };
  const toggle = (value: string) => {
    const next = new Set(chosen);
    if (next.has(value)) next.delete(value); else next.add(value);
    setValues([...next]);
  };
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100";

  return <Popover.Root onOpenChange={o => { if (!o) setQuery(""); }}>
    <span className={cn("inline-flex items-center gap-0.5", alignRight && "flex-row-reverse")}>
      <button type="button" onClick={() => onSort(sorted === "asc" ? "desc" : sorted === "desc" ? null : "asc")}
        className={cn("inline-flex items-center gap-1 rounded px-1 -mx-1 hover:text-slate-900", (sorted || filtered) && "text-slate-900")}>
        {column.label}
        {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : null}
      </button>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`Opciones de ${column.label}`}
          className={cn("rounded p-0.5 hover:bg-slate-200/70 hover:text-slate-900", filtered ? "text-[#0A58FF]" : "text-slate-400")}>
          {filtered ? <Filter className="size-3.5 fill-current" /> : <ChevronDown className="size-3.5" />}
        </button>
      </Popover.Trigger>
    </span>
    <Popover.Portal>
      <Popover.Content align={alignRight ? "end" : "start"} sideOffset={6}
        className="z-50 w-64 rounded-xl border border-slate-200 bg-white p-1.5 text-sm font-normal normal-case text-slate-700 shadow-lg outline-none">
        <button type="button" className={item} onClick={() => onSort("asc")}><ArrowUp className="size-3.5 text-slate-400" />
          {ranged(column) ? "De menor a mayor" : "De la A a la Z"}{sorted === "asc" && <span className="ml-auto text-[#0A58FF]">●</span>}</button>
        <button type="button" className={item} onClick={() => onSort("desc")}><ArrowDown className="size-3.5 text-slate-400" />
          {ranged(column) ? "De mayor a menor" : "De la Z a la A"}{sorted === "desc" && <span className="ml-auto text-[#0A58FF]">●</span>}</button>
        {sorted && <button type="button" className={item} onClick={() => onSort(null)}><ArrowDownUp className="size-3.5 text-slate-400" />Quitar orden</button>}

        <div className="my-1.5 border-t border-slate-100" />
        {ranged(column) && <div className="space-y-1.5 px-2 pb-2 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Entre</p>
          <div className="flex items-center gap-1.5">
            <input aria-label="Desde" type={column.kind === "date" ? "date" : "text"} inputMode={column.kind === "date" ? undefined : "decimal"} placeholder="Desde"
              value={filter?.min ?? ""} onChange={e => setBound("min", e.target.value)}
              className="h-8 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-[13px] outline-none focus:border-[#0A58FF]" />
            <span className="text-slate-400">–</span>
            <input aria-label="Hasta" type={column.kind === "date" ? "date" : "text"} inputMode={column.kind === "date" ? undefined : "decimal"} placeholder="Hasta"
              value={filter?.max ?? ""} onChange={e => setBound("max", e.target.value)}
              className="h-8 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-[13px] outline-none focus:border-[#0A58FF]" />
          </div>
        </div>}

        {(!ranged(column) || options.length <= 30) && <>
          <div className="flex items-center justify-between px-2 pb-1 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Valores</p>
            <span className="flex gap-2 text-[11px]">
              <button type="button" className="text-[#0A58FF] hover:underline" onClick={() => setValues(undefined)}>Todos</button>
              <button type="button" className="text-[#0A58FF] hover:underline" onClick={() => setValues([])}>Ninguno</button>
            </span>
          </div>
          {options.length > 8 && <input autoFocus placeholder="Buscar valor…" value={query} onChange={e => setQuery(e.target.value)}
            className="mx-1 mb-1 h-8 w-[calc(100%-0.5rem)] rounded-lg border border-slate-200 px-2 text-[13px] outline-none focus:border-[#0A58FF]" />}
          <div className="max-h-56 overflow-y-auto">
            {shown.map(o => <label key={o.value} className={cn(item, "cursor-pointer")}>
              <input type="checkbox" className="size-3.5 accent-[#0A58FF]" checked={chosen.has(o.value)} onChange={() => toggle(o.value)} />
              <span className={cn("min-w-0 flex-1 truncate", o.value === "__empty" && "italic text-slate-400")}>{o.label}</span>
              <span className="text-[11px] tabular-nums text-slate-400">{o.count}</span>
            </label>)}
            {!shown.length && <p className="px-2 py-2 text-xs text-slate-400">Ningún valor coincide.</p>}
          </div>
        </>}

        {(filtered || onHide) && <div className="my-1.5 border-t border-slate-100" />}
        {filtered && <button type="button" className={item} onClick={() => onFilter(undefined)}><X className="size-3.5 text-slate-400" />Quitar filtro</button>}
        {onHide && <button type="button" className={item} onClick={onHide}><EyeOff className="size-3.5 text-slate-400" />Ocultar columna</button>}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

/** «Proveedor: Mercadona, Makro» / «Precio: 2 – 5» for the chips of active filters. */
export function describeFilter(column: Column, filter: ColumnFilter, rows: Record<string, CellValue>[]) {
  const parts: string[] = [];
  if (filter.values) {
    const labels = filterOptions(rows, column).filter(o => filter.values!.includes(o.value)).map(o => o.label);
    parts.push(labels.length === 0 ? "ninguno" : labels.length <= 2 ? labels.join(", ") : `${labels.slice(0, 2).join(", ")} y ${labels.length - 2} más`);
  }
  const fmt = (v?: string) => column.kind === "date" && v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v;
  if (filter.min?.trim() || filter.max?.trim()) parts.push(filter.min?.trim() && filter.max?.trim() ? `${fmt(filter.min)} – ${fmt(filter.max)}` : filter.min?.trim() ? `desde ${fmt(filter.min)}` : `hasta ${fmt(filter.max)}`);
  return `${column.label}: ${parts.join(" · ")}`;
}
