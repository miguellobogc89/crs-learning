import type { Table } from "@/lib/analytics/compute";
import { fmtDate, fmtMoney, fmtNumber } from "./format";

const cell = (v: string | number | null, kind?: string) => {
  if (v === null || v === "") return <span className="text-slate-300">—</span>;
  if (kind === "money" && typeof v === "number") return fmtMoney(v);
  if (kind === "number" && typeof v === "number") return fmtNumber(v);
  if (kind === "date" && typeof v === "string") return fmtDate(v);
  return String(v);
};

/** A read-only table with readable column names; numbers right-aligned. */
export function DataTable({ table, limit = 500 }: { table: Table; limit?: number }) {
  const rows = table.rows.slice(0, limit);
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
      <div><h2 className="text-base font-semibold text-slate-900">{table.label}</h2><p className="mt-0.5 text-xs text-slate-500">{table.description}</p></div>
      <span className="text-xs text-slate-500">{table.rows.length > limit ? `${limit} de ${table.rows.length}` : table.rows.length} filas</span>
    </div>
    {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[540px] border-collapse text-left text-sm">
      <thead className="bg-slate-50 text-xs text-slate-500"><tr>{table.columns.map(c =>
        <th key={c.key} className={"whitespace-nowrap px-4 py-3 font-semibold " + (c.kind === "money" || c.kind === "number" ? "text-right" : "")}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/60">{table.columns.map(c =>
        <td key={c.key} className={"px-4 py-2.5 text-slate-700 " + (c.kind === "money" || c.kind === "number" ? "whitespace-nowrap text-right tabular-nums" : c.kind === "date" ? "whitespace-nowrap" : "")}>
          {cell(r[c.key] ?? null, c.kind)}</td>)}</tr>)}</tbody>
    </table></div> : <p className="px-5 py-10 text-center text-sm text-slate-500">Todavía no hay datos. Importa documentos desde Conocimiento.</p>}
  </section>;
}
