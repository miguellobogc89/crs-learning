import { CATEGORIES, EDITABLE } from "./compute";

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
