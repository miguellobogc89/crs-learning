import { coerce, type EngineType } from "@/lib/assistant/changes/plan";

/**
 * What can be done with the rows of a table from Analítica → Tablas, and the pure checks behind it.
 * Rows can be added (and duplicated) where they are plain records the person owns: tables created with the
 * assistant and tables made from documents. Rows can be deleted there and in «Compras» (lines read twice, or wrong).
 * Invoices and companies are not deleted from here: they hold relations (lines, parties) handled elsewhere.
 */
export function rowCapabilities(tableKey: string) {
  const own = tableKey.startsWith("tabla:") || tableKey.startsWith("plantilla:");
  return { add: own, remove: own || tableKey === "compras" };
}

export type FieldDef = { key: string; name?: string | null; field_type: string; is_required?: boolean };

/** Values typed in the «Añadir registro» form, converted to each column's type. Empty values are left out. */
export function newRecordValues(fields: FieldDef[], input: Record<string, unknown>):
  { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
  const values: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const [key, raw] of Object.entries(input)) {
    const def = fields.find(f => f.key === key);
    if (!def) { errors.push(`${key}: no existe en esta tabla`); continue; }
    const value = typeof raw === "string" ? raw.trim() : raw;
    if (value === "" || value === null || value === undefined) continue;
    const c = coerce(value, def.field_type as EngineType);
    const label = def.name || def.key;
    if (!c.ok) { errors.push(`${label}: ${def.field_type === "date" ? "fecha no válida (DD/MM/AAAA)" : def.field_type === "decimal" || def.field_type === "integer" ? "número no válido" : "valor no válido"}`); continue; }
    if (typeof c.value === "string" && c.value.length > 2000) { errors.push(`${label}: máximo 2000 caracteres`); continue; }
    if (c.value !== null) values[key] = c.value;
  }
  for (const f of fields) if (f.is_required && !(f.key in values)) errors.push(`${f.name || f.key}: es obligatorio`);
  if (errors.length) return { ok: false, error: errors.join(" · ") };
  if (!Object.keys(values).length) return { ok: false, error: "Rellena al menos un campo" };
  return { ok: true, values };
}

export type Revision = { revision: number; status: string; values: Record<string, unknown>; at: string; by: string | null };
export type RevisionChange = { field: string; before: unknown; after: unknown };

/** What changed from one stored revision to the next (fields added, changed or cleared). */
export function revisionChanges(previous: Record<string, unknown> | null, next: Record<string, unknown>): RevisionChange[] {
  const keys = new Set([...Object.keys(previous ?? {}), ...Object.keys(next)]);
  const out: RevisionChange[] = [];
  for (const field of keys) {
    const before = previous?.[field] ?? null, after = next[field] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) out.push({ field, before, after });
  }
  return out.sort((a, b) => a.field.localeCompare(b.field));
}

/** Pending edits grouped by record, in the shape the batch save expects. Last edit of a field wins. */
export type PendingEdit = { recordId: string; revision: number; columnKey: string; field: string; value: unknown };
export function groupEdits(edits: PendingEdit[]) {
  const byRecord = new Map<string, { recordId: string; expectedRevision: number; edits: { field: string; value: unknown; columnKey: string }[] }>();
  for (const e of edits) {
    const r = byRecord.get(e.recordId) ?? { recordId: e.recordId, expectedRevision: e.revision, edits: [] };
    r.edits = [...r.edits.filter(x => x.field !== e.field), { field: e.field, value: e.value, columnKey: e.columnKey }];
    byRecord.set(e.recordId, r);
  }
  return [...byRecord.values()];
}
