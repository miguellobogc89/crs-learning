"use client";
// Piezas comunes de las tablas del módulo (estilo de Oportunidades): cabecera fija, filas con líneas
// suaves, pie con paginación y «Ver N por página», e importes con los decimales más pequeños.
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { eur, FULL_H, ghost, panel, th } from "./format";

export const TH = `${th} sticky top-0 z-10 bg-white whitespace-normal px-2 leading-tight shadow-[inset_0_-1px_0_rgb(241,245,249)]`;
export const TD = "px-2 py-3";
export const PAGE_SIZES = [10, 15, 25, 50];

/** Tarjeta a todo el alto disponible: el contenido desplaza por dentro y el pie queda abajo. */
export function TablePanel({ children, footer, header }: { children: ReactNode; footer?: ReactNode; header?: ReactNode }) {
  return (
    <section className={`${panel} flex ${FULL_H} min-h-[320px] flex-col`}>
      {header && <div className="shrink-0 border-b border-slate-100 px-4 py-3">{header}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
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
