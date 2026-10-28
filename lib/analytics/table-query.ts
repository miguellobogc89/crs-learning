import type { CellValue, Column } from "./compute";

/**
 * Search, filters, sorting and pages over a table's rows (in the browser; pure, testable).
 * Search looks in every visible text, number and date (as typed: "01/2026", "Leroy", "38,00"); filters are exact
 * values of the filterable columns; sorting compares numbers as numbers and dates as dates, empty values last.
 */
export type Sort = { key: string; dir: "asc" | "desc" } | null;
export type Query = { search: string; filters: Record<string, string>; sort: Sort; page: number; pageSize: number };
type RowT = Record<string, CellValue>;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** The text a value is searched by (and filtered by): what the person sees, plus the raw value. */
export function cellText(value: CellValue, kind?: Column["kind"]): string {
  if (value === null || value === "") return "";
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (typeof value === "number") {
    const opts = { minimumFractionDigits: kind === "money" ? 2 : 0, maximumFractionDigits: 2 };
    // As shown (es-ES: "1234,50") and as often typed ("1.234,50"), plus the raw number.
    return `${value.toLocaleString("es-ES", opts)} ${value.toLocaleString("de-DE", opts)} ${value}`;
  }
  if (kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) { const [y, m, d] = value.split("-"); return `${d}/${m}/${y} ${value}`; }
  return value;
}
export const filterValue = (value: CellValue) => value === null || value === "" ? "__empty" : typeof value === "boolean" ? (value ? "sí" : "no") : String(value);

/** Distinct values of a filterable column, most frequent first, with how many rows have each. */
export function filterOptions(rows: RowT[], column: Column): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) { const v = filterValue(r[column.key] ?? null); counts.set(v, (counts.get(v) ?? 0) + 1); }
  return [...counts].map(([value, count]) => ({ value, count, label: value === "__empty" ? "(vacío)" : value === "sí" ? "Sí" : value === "no" ? "No" : value }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

function compare(a: CellValue, b: CellValue): number {
  const empty = (v: CellValue) => v === null || v === "";
  if (empty(a) || empty(b)) return empty(a) && empty(b) ? 0 : empty(a) ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(a === true) - Number(b === true);
  return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
}

export function queryRows(rows: RowT[], columns: Column[], q: Query): { rows: RowT[]; total: number; pages: number; page: number } {
  const terms = fold(q.search.trim()).split(/\s+/).filter(Boolean);
  const visible = columns.filter(c => c.kind !== "document");
  let out = rows.filter(r => {
    for (const [key, value] of Object.entries(q.filters)) if (value && filterValue(r[key] ?? null) !== value) return false;
    if (!terms.length) return true;
    const text = fold(visible.map(c => cellText(r[c.key] ?? null, c.kind)).join(" "));
    return terms.every(t => text.includes(t));
  });
  if (q.sort) {
    const { key, dir } = q.sort;
    out = [...out].sort((a, b) => {
      const empty = (v: CellValue) => v === null || v === "";
      const c = compare(a[key] ?? null, b[key] ?? null);
      // Empty values always last, whatever the direction.
      return empty(a[key] ?? null) || empty(b[key] ?? null) ? c : dir === "asc" ? c : -c;
    });
  }
  const pages = Math.max(1, Math.ceil(out.length / q.pageSize));
  const page = Math.min(Math.max(1, q.page), pages);
  return { rows: out.slice((page - 1) * q.pageSize, page * q.pageSize), total: out.length, pages, page };
}
