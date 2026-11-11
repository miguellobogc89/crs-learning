"use client";
// Piezas comunes de las tablas del módulo (estilo de Oportunidades): cabecera fija, filas con líneas
// suaves, pie con paginación y «Ver N por página», e importes con los decimales más pequeños.
import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { eur, FULL_H, ghost, panel, th } from "./format";

export const TH = `${th} sticky top-0 z-10 bg-white whitespace-normal px-2 leading-tight shadow-[inset_0_-1px_0_rgb(241,245,249)]`;
export const TD = "px-2 py-3";
export const PAGE_SIZES = [10, 15, 25, 50];

/** Tarjeta a todo el alto disponible: el contenido desplaza por dentro y el pie queda abajo. */
export function TablePanel({ children, footer, header, height = FULL_H }: { children: ReactNode; footer?: ReactNode; header?: ReactNode; height?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false, headerHeight: 0 });
  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const next = {
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
      headerHeight: el.querySelector("thead")?.getBoundingClientRect().height ?? 0,
    };
    setEdges((prev) =>
      prev.top === next.top && prev.bottom === next.bottom && prev.headerHeight === next.headerHeight ? prev : next,
    );
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(checkScroll) : null;
    observer?.observe(el);
    const table = el.querySelector("table");
    if (table) observer?.observe(table);
    checkScroll();
    return () => observer?.disconnect();
  }, [children]);

  return (
    <section className={`${panel} flex ${height} ${height === FULL_H ? "min-h-[320px]" : "min-h-0"} flex-col`}>
      {header && <div className="shrink-0 border-b border-slate-100 px-4 py-3">{header}</div>}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={checkScroll} className="h-full overflow-auto overscroll-contain">
          {children}
        </div>
        {edges.top && (
          <div className="pointer-events-none absolute inset-x-0 z-[5] h-5 bg-gradient-to-b from-white via-white/85 to-transparent" style={{ top: edges.headerHeight }} aria-hidden="true" />
        )}
        {edges.bottom && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-6 bg-gradient-to-t from-white via-white/85 to-transparent" aria-hidden="true" />
        )}
      </div>
      {footer}
    </section>
  );
}

export function Pager({ total, page, perPage, onPage, onPerPage, label = "registros" }: { total: number; page: number; perPage: number; onPage: (p: number) => void; onPerPage: (n: number) => void; label?: string }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(page, pages - 1);
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
      <span className="tabular-nums">{total ? `${current * perPage + 1}–${Math.min(total, (current + 1) * perPage)} de ${total}` : `0 ${label}`}</span>
      <span className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          Ver
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
            value={perPage}
            onChange={(e) => {
              onPerPage(Number(e.target.value));
              onPage(0);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          por página
        </label>
        <span className="flex items-center gap-1">
          <button type="button" className={`${ghost} !px-2 !py-1.5`} disabled={current === 0} onClick={() => onPage(current - 1)} aria-label="Página anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 tabular-nums">
            {current + 1} / {pages}
          </span>
          <button type="button" className={`${ghost} !px-2 !py-1.5`} disabled={current >= pages - 1} onClick={() => onPage(current + 1)} aria-label="Página siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </span>
      </span>
    </footer>
  );
}

/** Página actual de una lista. */
export const pageOf = <T,>(list: T[], page: number, perPage: number) => {
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const current = Math.min(page, pages - 1);
  return list.slice(current * perPage, current * perPage + perPage);
};

/** Importe con la parte decimal más pequeña: 1.234,56 € → «1.234» + «,56 €». */
export function Money({ v, digits, sign = false, className = "" }: { v: number | null | undefined; digits?: number; sign?: boolean; className?: string }) {
  const text = eur(v, digits);
  if (text === "—") return <span className={className}>—</span>;
  const at = text.lastIndexOf(",");
  const head = at >= 0 ? text.slice(0, at) : text.replace(/ €$/, "");
  const tail = at >= 0 ? text.slice(at) : " €";
  return (
    <span className={`whitespace-nowrap tabular-nums ${className}`}>
      {sign && (v ?? 0) > 0 ? "+" : ""}
      {head}
      <span className="text-[0.8em] opacity-80">{tail}</span>
    </span>
  );
}

/** Pestañas segmentadas (como «Vivas / Historial»). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-lg px-3 py-1.5 font-medium ${value === o.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** «hace 2 horas», «hace 1 día», «hace una semana»… */
export function sinceText(iso: string | null | undefined) {
  if (!iso) return "—";
  const min = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000);
  const n = (v: number, one: string, many: string) => `hace ${v === 1 ? (one === "semana" ? "una" : "1") : v} ${v === 1 ? one : many}`;
  if (min < 60) return n(Math.max(1, Math.round(min)), "minuto", "minutos");
  const h = min / 60;
  if (h < 24) return n(Math.round(h), "hora", "horas");
  const d = h / 24;
  if (d < 7) return n(Math.floor(d), "día", "días");
  if (d < 30) return n(Math.floor(d / 7), "semana", "semanas");
  if (d < 365) return n(Math.floor(d / 30), "mes", "meses");
  return n(Math.floor(d / 365), "año", "años");
}

// ---------------------------------------------------------------------------
// Tabla estándar del módulo: cabeceras centradas, orden al pulsar la cabecera (alterna ascendente /
// descendente), ancho de columnas ajustable arrastrando el borde (se recuerda por tabla), filas
// desplegables y paginación opcional.
// ---------------------------------------------------------------------------
export type Col<T> = {
  key: string;
  label: ReactNode;
  /** Ancho inicial en % del total. */
  width?: number;
  align?: "left" | "center" | "right";
  /** Valor para ordenar; sin él, la columna no se ordena. */
  sort?: (r: T) => string | number | null | undefined;
  cell: (r: T) => ReactNode;
  className?: string;
};

type Sort = { key: string; dir: 1 | -1 } | null;
const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;
const readWidths = (id: string): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(`crs-table:${id}`) ?? "{}") ?? {};
  } catch {
    return {};
  }
};

export function DataTable<T>({
  id,
  columns,
  rows,
  rowKey,
  header,
  empty,
  paginate = false,
  label = "registros",
  expand,
  onRowClick,
  height,
}: {
  id: string;
  columns: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  header?: ReactNode;
  empty?: ReactNode;
  paginate?: boolean;
  label?: string;
  expand?: (r: T) => ReactNode;
  onRowClick?: (r: T) => void;
  /** Clase de alto si encima de la tabla hay más cosas (por defecto, todo el alto disponible). */
  height?: string;
}) {
  const [sort, setSort] = useState<Sort>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(15);
  const [open, setOpen] = useState<string | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const tableRef = useRef<HTMLTableElement>(null);
  useEffect(() => setWidths(readWidths(id)), [id]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const val = col.sort;
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const c = typeof x === "string" && typeof y === "string" ? x.localeCompare(y, "es", { sensitivity: "base", numeric: true }) : x < y ? -1 : 1;
      return c * sort.dir;
    });
  }, [rows, sort, columns]);
  const visible = paginate ? pageOf(sorted, page, perPage) : sorted;

  const pick = (c: Col<T>) => {
    if (!c.sort) return;
    const sample = rows.map(c.sort).find((v) => v !== null && v !== undefined);
    const first: 1 | -1 = typeof sample === "string" ? 1 : -1; // texto A→Z; números de mayor a menor
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: first }));
    setPage(0);
  };

  // Arrastrar el borde derecho de una cabecera: fija todos los anchos en píxeles y ajusta ese.
  const startResize = (e: ReactMouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const ths = [...(tableRef.current?.querySelectorAll("thead th") ?? [])] as HTMLElement[];
    const base: Record<string, number> = {};
    columns.forEach((c, i) => (base[c.key] = widths[c.key] ?? ths[i]?.getBoundingClientRect().width ?? 100));
    const x0 = e.clientX;
    const w0 = base[key];
    let latest = base;
    const move = (ev: MouseEvent) => {
      latest = { ...base, [key]: Math.max(48, Math.round(w0 + ev.clientX - x0)) };
      setWidths(latest);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      try {
        localStorage.setItem(`crs-table:${id}`, JSON.stringify(latest));
      } catch {
        // Sin almacenamiento: el ancho vale para esta visita.
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const fixed = columns.every((c) => widths[c.key]);
  const total = fixed ? columns.reduce((s, c) => s + widths[c.key], 0) : null;

  return (
    <TablePanel
      height={height}
      header={header}
      footer={paginate ? <Pager total={rows.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} label={label} /> : undefined}
    >
      {rows.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-slate-500">{empty ?? "Sin registros."}</div>
      ) : (
        <table ref={tableRef} className="w-full table-fixed text-sm" style={total ? { width: total, minWidth: "100%" } : undefined}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={{ width: fixed ? widths[c.key] : `${c.width ?? 100 / columns.length}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={`${TH} relative select-none ${c.align === "left" ? "!text-left" : c.align === "right" ? "!text-right" : "!text-center"} ${c.sort ? "cursor-pointer hover:text-slate-800" : ""}`}
                    onClick={() => pick(c)}
                    aria-sort={c.sort && active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {c.sort && active && <span className="text-[10px] text-blue-600" aria-hidden="true">{sort!.dir === 1 ? "▲" : "▼"}</span>}
                    </span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      onMouseDown={(e) => startResize(e, c.key)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-y-1 right-0 w-1.5 cursor-col-resize rounded hover:bg-blue-200"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const k = rowKey(r);
              const extra = expand && open === k ? expand(r) : null;
              const clickable = !!expand || !!onRowClick;
              return (
                <Fragment key={k}>
                  <tr
                    className={`border-b border-slate-100 hover:bg-slate-50/60 ${clickable ? "cursor-pointer" : ""}`}
                    onClick={clickable ? () => (expand ? setOpen(open === k ? null : k) : onRowClick?.(r)) : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`${TD} ${ALIGN[c.align ?? "center"]} ${c.className ?? ""}`}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                  {extra && (
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <td colSpan={columns.length} className="px-6 py-4">
                        {extra}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </TablePanel>
  );
}
