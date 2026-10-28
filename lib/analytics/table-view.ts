import type { CellValue, Column } from "./compute";
import { filterValue, type Sort } from "./table-query";

/**
 * How a person likes to see one table (saved per person, workspace and table): which columns are hidden, which
 * column groups the rows, the order and the rows per page. Pure: what is saved is validated against the table's
 * current columns, so a column that no longer exists is simply forgotten.
 */
export type TableView = { hidden: string[]; groupBy: string | null; sort: Sort; pageSize: number };
export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_VIEW: TableView = { hidden: [], groupBy: null, sort: null, pageSize: 25 };

/** Columns rows can be grouped by: names, categories, yes/no, dates (not amounts or links). */
export const groupable = (c: Column) => c.kind !== "document" && c.kind !== "money" && c.kind !== "number";

/** Without `columns` (when saving) only the shape is checked; with them (when showing) also that each column exists. */
export function normalizeView(raw: unknown, columns?: Column[]): TableView {
  const v = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const known = (k: unknown): k is string => typeof k === "string" && k.length > 0 && k.length <= 80 && (!columns || columns.some(c => c.key === k));
  let hidden = Array.isArray(v.hidden) ? [...new Set(v.hidden.filter(known))].slice(0, 100) : [];
  // Never every column hidden: the table would be empty.
  if (columns && hidden.length >= columns.length) hidden = [];
  const groupBy = known(v.groupBy) && (!columns || columns.some(c => c.key === v.groupBy && groupable(c))) ? v.groupBy : null;
  const s = v.sort as { key?: unknown; dir?: unknown } | null | undefined;
  const sort: Sort = s && known(s.key) && (s.dir === "asc" || s.dir === "desc") ? { key: s.key, dir: s.dir } : null;
  const pageSize = PAGE_SIZES.includes(v.pageSize as (typeof PAGE_SIZES)[number]) ? v.pageSize as number : DEFAULT_VIEW.pageSize;
  return { hidden, groupBy, sort, pageSize };
}

export type RowGroup = { key: string; label: string; rows: Record<string, CellValue>[]; totals: Record<string, number> };

/**
 * Rows grouped by the value of one column, keeping the order they come in (already filtered and sorted) inside each
 * group. Groups go biggest first (then by name); "(vacío)" last. Amount and number columns are added up per group.
 */
export function groupRows(rows: Record<string, CellValue>[], columns: Column[], groupBy: string): RowGroup[] {
  const sums = columns.filter(c => c.kind === "money" || c.kind === "number");
  const groups = new Map<string, RowGroup>();
  for (const r of rows) {
    const key = filterValue(r[groupBy] ?? null);
    let g = groups.get(key);
    if (!g) {
      const label = key === "__empty" ? "(vacío)" : key === "sí" ? "Sí" : key === "no" ? "No" : key;
      g = { key, label, rows: [], totals: Object.fromEntries(sums.map(c => [c.key, 0])) };
      groups.set(key, g);
    }
    g.rows.push(r);
    for (const c of sums) { const n = r[c.key]; if (typeof n === "number") g.totals[c.key] += n; }
  }
  return [...groups.values()].sort((a, b) => Number(a.key === "__empty") - Number(b.key === "__empty")
    || b.rows.length - a.rows.length || a.label.localeCompare(b.label, "es", { numeric: true }));
}
