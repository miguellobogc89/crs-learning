import type { EntityDef, FieldType } from "../targets/field-sets";
import type { ExtractedRecord, PartPlan } from "../targeted/contract";
import type { Part } from "../classifier/contract";
import { toDate, toDecimal, toInteger, usesCommaDecimals } from "../writer/convert";

/**
 * Templates for document types without a reviewed field set (payslips, rent receipts, tax forms…): proposed from the
 * workspace's own documents, reviewed by a person, and turned into a workspace table. Pure: definition, validation,
 * the extraction plan for a part, and the records (typed values, identity key, evidence) from extracted rows.
 */
export const TEMPLATE_FIELD_TYPES = ["text", "long_text", "decimal", "date", "integer"] as const;
export type TemplateFieldType = (typeof TEMPLATE_FIELD_TYPES)[number];
export const TEMPLATE_CATEGORIES = ["personal", "impuestos", "alquiler", "suministros", "servicios", "compras", "otros"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type TemplateField = { key: string; label: string; type: TemplateFieldType; description: string; identity: boolean; required: boolean };
export type TemplateDefinition = {
  nombre: string; descripcion: string;
  appliesTo: { familia: string; tipo: string; subtipo: string | null };
  /** Several records in one part (e.g. one row per employee in a payroll summary). */
  varios: boolean;
  campos: TemplateField[];
  /** How the table adds up in analytics: a cost of a category, by a date and an amount field. */
  analitica: { sumar: boolean; categoria: TemplateCategory; importe: string | null; fecha: string | null; tercero: string | null };
};

export const keyFromLabel = (label: string) => label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "c_$1").slice(0, 48) || "campo";
/** Workspace table key of a template (stable: from its name, unique among the workspace's tables). */
export const objectTypeKey = (nombre: string) => `doc_${keyFromLabel(nombre)}`.slice(0, 60);

/** Checks and normalizes a definition (as edited by the person). */
export function validateTemplate(input: unknown): { ok: true; template: TemplateDefinition } | { ok: false; error: string } {
  const t = input as Partial<TemplateDefinition> | null;
  if (!t || typeof t !== "object") return { ok: false, error: "Plantilla no válida" };
  const nombre = String(t.nombre ?? "").replace(/\s+/g, " ").trim();
  if (!nombre || nombre.length > 80) return { ok: false, error: "La tabla necesita un nombre (máximo 80 caracteres)" };
  const a = t.appliesTo;
  if (!a || typeof a.familia !== "string" || typeof a.tipo !== "string" || !a.familia || !a.tipo) return { ok: false, error: "Falta el tipo de documento" };
  if (!Array.isArray(t.campos) || !t.campos.length) return { ok: false, error: "La tabla necesita al menos una columna" };
  if (t.campos.length > 40) return { ok: false, error: "Máximo 40 columnas" };
  const campos: TemplateField[] = [];
  const keys = new Set<string>();
  for (const c of t.campos) {
    const label = String(c?.label ?? "").replace(/\s+/g, " ").trim();
    if (!label) return { ok: false, error: "Todas las columnas necesitan nombre" };
    let key = keyFromLabel(String(c?.key || label));
    for (let n = 2; keys.has(key); n++) key = `${keyFromLabel(label)}_${n}`;
    keys.add(key);
    const type = TEMPLATE_FIELD_TYPES.includes(c?.type as TemplateFieldType) ? c.type as TemplateFieldType : "text";
    campos.push({ key, label: label.slice(0, 80), type, description: String(c?.description ?? "").trim().slice(0, 300) || label, identity: c?.identity === true, required: c?.required === true });
  }
  const an = t.analitica ?? ({} as TemplateDefinition["analitica"]);
  const field = (k: unknown, types: TemplateFieldType[]) => { const f = campos.find(c => c.key === k); return f && types.includes(f.type) ? f.key : null; };
  const analitica = {
    sumar: an.sumar === true,
    categoria: TEMPLATE_CATEGORIES.includes(an.categoria as TemplateCategory) ? an.categoria as TemplateCategory : "otros",
    importe: field(an.importe, ["decimal"]), fecha: field(an.fecha, ["date"]), tercero: field(an.tercero, ["text", "long_text"]),
  };
  if (analitica.sumar && (!analitica.importe || !analitica.fecha)) return { ok: false, error: "Para sumarla como gasto elige la columna del importe y la de la fecha" };
  return { ok: true, template: { nombre, descripcion: String(t.descripcion ?? "").trim().slice(0, 300), appliesTo: { familia: a.familia, tipo: a.tipo, subtipo: a.subtipo ?? null },
    varios: t.varios === true, campos, analitica } };
}

/** The template as an entity of the extraction (always a list: a part may hold one record or several). */
export function templateEntity(t: TemplateDefinition): EntityDef {
  return { role: "registros", name: t.nombre, catalogType: objectTypeKey(t.nombre), catalogo: "propuesto", cardinality: "many", required: true,
    fields: t.campos.map(c => ({ key: c.key, name: c.label, type: c.type as FieldType, required: c.required, description: c.description,
      ...(c.identity ? { identifier: true as const } : {}) })) };
}

export const matches = (t: TemplateDefinition, p: Pick<Part, "familia" | "tipo" | "subtipo">) =>
  p.familia === t.appliesTo.familia && p.tipo === t.appliesTo.tipo && (p.subtipo ?? null) === t.appliesTo.subtipo;

/** Extraction plans for the parts of a file this template applies to. */
export function templatePlans(t: TemplateDefinition, templateId: string, partes: Part[]): PartPlan[] {
  const entity = templateEntity(t);
  return partes.filter(p => matches(t, p)).map(parte => ({ parte, modo: "dirigida" as const, conjunto: [`plantilla:${templateId}`], entidades: [entity],
    paginas: [...new Set(parte.bloques.map(b => b.pagina))].sort((a, b) => a - b), motivo: `Plantilla «${t.nombre}»` }));
}

export type TemplateRecord = {
  values: Record<string, string | number>; externalKey: string;
  evidencias: { campo: string; impreso: string; pagina: number | null }[];
  noConvertidos: { campo: string; impreso: string; motivo: string }[];
};

/**
 * Records from the rows extracted in a part: typed values (exact decimal strings, ISO dates), the printed evidence of
 * each one, and an identity key: the template's identity fields when all are present (so the same payslip in two PDFs
 * is one record), otherwise the document, part and row (so processing again never duplicates).
 */
export function templateRecords(t: TemplateDefinition, rows: ExtractedRecord[], source: { fileHash: string; parteId: string }): TemplateRecord[] {
  const printed = rows.flatMap(r => Object.values(r).map(v => v.valor)).filter((v): v is string => !!v);
  const commaDecimals = usesCommaDecimals(printed);
  const reference = rows.flatMap(r => t.campos.filter(c => c.type === "date").map(c => r[c.key]?.valor)).map(v => v ? toDate(v) : null).find((d): d is { ok: true; value: string } => !!d?.ok)?.value ?? null;
  return rows.map((row, i) => {
    const values: Record<string, string | number> = {};
    const evidencias: TemplateRecord["evidencias"] = [], noConvertidos: TemplateRecord["noConvertidos"] = [];
    for (const c of t.campos) {
      const v = row[c.key];
      if (!v?.valor) continue;
      const result = c.type === "decimal" ? toDecimal(v.valor, { commaDecimals }) : c.type === "date" ? toDate(v.valor, reference) : c.type === "integer" ? toInteger(v.valor)
        : { ok: true as const, value: v.valor.replace(/\s+/g, " ").trim() };
      if (!result.ok) { noConvertidos.push({ campo: c.key, impreso: v.valor, motivo: result.reason }); continue; }
      values[c.key] = result.value as string | number;
      evidencias.push({ campo: c.key, impreso: v.valor, pagina: v.pagina });
    }
    const identity = t.campos.filter(c => c.identity);
    const idValues = identity.map(c => values[c.key]);
    const externalKey = identity.length && idValues.every(v => v !== undefined && v !== "")
      ? `id:${idValues.map(v => String(v).normalize("NFKC").toUpperCase().replace(/\s+/g, "")).join("|")}`
      : `doc:${source.fileHash.slice(0, 32)}:${source.parteId}:${i + 1}`;
    return { values, externalKey, evidencias, noConvertidos };
  }).filter(r => Object.keys(r.values).length > 0);
}
