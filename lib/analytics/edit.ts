import { CATEGORIES, EDITABLE } from "./compute";
import { coerce, type EngineType } from "@/lib/assistant/changes/plan";

/**
 * The few corrections allowed from Analítica, validated before they reach the record: a company's name and whether
 * it is "Mi empresa", and an invoice's direction (expense/income) and expense category. Pure.
 */
export function editedValues(typeKey: string, current: Record<string, unknown>, field: string, value: unknown):
  { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
  const kind = EDITABLE[typeKey]?.[field];
  if (!kind) return { ok: false, error: "Este dato no se puede cambiar desde Analítica" };
  let next: unknown;
  if (kind === "text") {
    const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    if (!text) return { ok: false, error: "El nombre no puede quedar vacío" };
    if (text.length > 200) return { ok: false, error: "Máximo 200 caracteres" };
    next = text;
  } else if (kind === "boolean") {
    if (typeof value !== "boolean") return { ok: false, error: "Valor no válido" };
    next = value;
  } else if (kind === "direction") {
    if (value !== "emitida" && value !== "recibida") return { ok: false, error: "Elige gasto o ingreso" };
    next = value;
  } else {
    if (!CATEGORIES.some(c => c.key === value)) return { ok: false, error: "Categoría no válida" };
    next = value;
  }
  return { ok: true, values: { ...current, [field]: next } };
}

/**
 * A cell of a table created with the assistant: any of its columns, the value converted to the column's type
 * ("1.234,5" → 1234.5, "31/12/2026" → 2026-12-31); an empty value clears the cell. Pure.
 */
export function editedCustomValues(fields: { key: string; field_type: string }[], current: Record<string, unknown>, field: string, value: unknown):
  { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
  const def = fields.find(f => f.key === field);
  if (!def) return { ok: false, error: "Esta columna no existe" };
  const c = coerce(typeof value === "string" ? value.trim() : value, def.field_type as EngineType);
  if (!c.ok) return { ok: false, error: def.field_type === "date" ? "Fecha no válida (DD/MM/AAAA)" : def.field_type === "decimal" || def.field_type === "integer" ? "Número no válido" : "Valor no válido" };
  if (typeof c.value === "string" && c.value.length > 2000) return { ok: false, error: "Máximo 2000 caracteres" };
  const values = { ...current };
  if (c.value === null) delete values[field]; else values[field] = c.value;
  return { ok: true, values };
}
