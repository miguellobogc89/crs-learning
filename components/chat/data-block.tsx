"use client";
import Link from "next/link";
import { Download, Table2 } from "lucide-react";
import type { DataBlock } from "@/lib/assistant/data/tools";
import type { CellValue } from "@/lib/analytics/compute";
import { fmtDate, fmtMoney, fmtNumber } from "@/components/analytics/format";
import { cn } from "@/lib/utils";

type Kind = DataBlock["columnas"][number]["kind"];
const right = (kind: Kind) => kind === "money" || kind === "number";

function show(value: CellValue, kind: Kind) {
  if (value === null || value === undefined || value === "") return <span className="text-slate-300">—</span>;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (kind === "money" && typeof value === "number") return fmtMoney(value);
  if (typeof value === "number") return fmtNumber(value);
  if (kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return fmtDate(value);
  return String(value);
}

function csv(block: DataBlock) {
  const cell = (v: CellValue) => { const s = v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [block.columnas.map(c => cell(c.label)).join(";"), ...block.filas.map(r => block.columnas.map(c => cell(r[c.key] ?? null)).join(";"))].join("\n");
}

/** A result the assistant chose to show: a compact table with its title, size, CSV download and a link to Analítica. */
export function DataBlockView({ block }: { block: DataBlock }) {
  const href = block.tablas.length === 1 ? `/analytics?view=tablas&table=${encodeURIComponent(block.tablas[0])}` : null;
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv(block)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${block.titulo.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "datos"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  return <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#0A58FF]/10 text-[#0A58FF]"><Table2 className="size-3.5" /></span>
      <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">{block.titulo}</p>
      <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
        {block.truncado ? `${block.filas.length.toLocaleString("es-ES")} de ${block.total.toLocaleString("es-ES")}` : `${block.total.toLocaleString("es-ES")} ${block.total === 1 ? "fila" : "filas"}`}</span>
      <button type="button" onClick={download} aria-label="Descargar CSV" title="Descargar CSV"
        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Download className="size-3.5" /></button>
    </div>
    <div className="max-h-80 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>
          {block.columnas.map(c => <th key={c.key} className={cn("whitespace-nowrap px-3 py-2 text-left font-semibold", right(c.kind) && "text-right")}>{c.label}</th>)}
        </tr></thead>
        <tbody>{block.filas.map((r, i) => <tr key={i} className="border-t border-slate-100">
          {block.columnas.map(c => <td key={c.key} className={cn("px-3 py-1.5 text-slate-700", right(c.kind) ? "whitespace-nowrap text-right tabular-nums" : c.kind === "date" && "whitespace-nowrap")}>{show(r[c.key] ?? null, c.kind)}</td>)}
        </tr>)}
        {!block.filas.length && <tr><td colSpan={block.columnas.length} className="px-3 py-6 text-center text-slate-500">Sin resultados.</td></tr>}</tbody>
      </table>
    </div>
    {href && <div className="border-t border-slate-100 px-3 py-1.5 text-right">
      <Link href={href} className="text-[11px] font-medium text-[#0A58FF] hover:underline">Abrir la tabla en Analítica →</Link></div>}
  </div>;
}
