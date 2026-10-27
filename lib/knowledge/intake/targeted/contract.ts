import type { Page } from "../extractor/contract";
import type { ClassifiedFile, Part } from "../classifier/contract";
import { resolveFieldSet, type EntityDef } from "../targets/field-sets";

/**
 * Targeted extraction: for each classified part, extract only the reviewed fields of its field set, with the
 * page each value comes from. Values are strings exactly as printed (or null when absent). Knowledge parts are
 * not sent to the vision model (their text is in the base reading). Parts without a field set, or classified
 * with low confidence, get the full visual reading as before. The model never assigns record ids.
 */
export const TARGETED_REVISION = 1;

export type ExtractedValue = { valor: string | null; pagina: number | null };
export type ExtractedRecord = Record<string, ExtractedValue>;
export type Proposal = { entidad: string; campo: string; nombre: string; valor: string; pagina: number; motivo: string };
export type PartMode = "dirigida" | "knowledge" | "lectura_completa";
export type PartPlan = { parte: Part; modo: PartMode; paginas: number[]; conjunto: string[]; entidades: EntityDef[]; motivo: string };
export type PartExtraction = {
  parteId: string; modo: PartMode; tipo: string; subtipo: string | null; paginas: number[];
  conjunto: string[];
  /** dirigida: one record per "one" entity, a list per "many" entity. */
  entidades?: Record<string, ExtractedRecord | ExtractedRecord[]>;
  /** Required fields not found in the document (role.key, or role[index].key). A notice, not an error. */
  faltan?: string[];
  propuestas?: Proposal[];
  /** lectura_completa: the visual reading of this part's pages. */
  lectura?: Page[];
  motivo: string;
};
export type TargetedFile = { archivoId: string; archivo: string; partes: PartExtraction[]; incidencias: string[] };
export type TargetedResult = { module: "targeted_extraction"; version: typeof TARGETED_REVISION; loteId: string; archivos: TargetedFile[] };

export function targetedResult(loteId: string, archivos: TargetedFile[]): TargetedResult {
  return { module: "targeted_extraction", version: TARGETED_REVISION, loteId, archivos };
}

/** What to do with each classified part. Pure: decided from the classification and the reviewed field sets. */
export function planParts(file: ClassifiedFile): PartPlan[] {
  return file.partes.map(parte => {
    const paginas = [...new Set(parte.bloques.map(b => b.pagina))].sort((a, b) => a - b);
    const base = { parte, paginas, conjunto: [] as string[], entidades: [] as EntityDef[] };
    if (parte.destino === "knowledge" || parte.familia === "texto") return { ...base, modo: "knowledge" as const, motivo: "Contenido para consulta: se conserva el texto de la lectura base, sin extracción visual" };
    const set = parte.confianza === "baja" ? null : resolveFieldSet(parte.familia, parte.tipo, parte.subtipo);
    if (!set) return { ...base, modo: "lectura_completa" as const, motivo: parte.confianza === "baja"
      ? "Clasificación con confianza baja: lectura visual completa por seguridad" : "Tipo sin conjunto de campos revisado: lectura visual completa" };
    return { ...base, modo: "dirigida" as const, conjunto: set.ids, entidades: set.entities, motivo: `Extracción dirigida con ${set.ids.join(" + ")}` };
  });
}

const VALUE_SCHEMA = { type: "object", additionalProperties: false, required: ["valor", "pagina"],
  properties: { valor: { type: ["string", "null"] }, pagina: { type: ["integer", "null"] } } };
const recordSchema = (entity: EntityDef) => ({ type: "object", additionalProperties: false, required: entity.fields.map(f => f.key),
  properties: Object.fromEntries(entity.fields.map(f => [f.key, VALUE_SCHEMA])) });

/** Strict JSON schema for one file: one object per targeted part (keyed by part id), generated from its field set. */
export function fileSchema(plans: PartPlan[]) {
  const targeted = plans.filter(p => p.modo === "dirigida");
  return {
    type: "object", additionalProperties: false, required: ["partes", "propuestas", "incidencias"],
    properties: {
      partes: { type: "object", additionalProperties: false, required: targeted.map(p => p.parte.id),
        properties: Object.fromEntries(targeted.map(p => [p.parte.id, { type: "object", additionalProperties: false, required: p.entidades.map(e => e.role),
          properties: Object.fromEntries(p.entidades.map(e => [e.role, e.cardinality === "many" ? { type: "array", items: recordSchema(e) } : recordSchema(e)])) }])) },
      propuestas: { type: "array", items: { type: "object", additionalProperties: false, required: ["parte", "entidad", "campo", "nombre", "valor", "pagina", "motivo"],
        properties: { parte: { type: "string" }, entidad: { type: "string" }, campo: { type: "string" }, nombre: { type: "string" }, valor: { type: "string" }, pagina: { type: "integer" }, motivo: { type: "string" } } } },
      incidencias: { type: "array", items: { type: "string" } },
    },
  };
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const clean = (v: unknown, pages: number[], where: string, notes: string[]): ExtractedValue => {
  if (!object(v)) throw new Error(`${where}: valor inválido`);
  const valor = typeof v.valor === "string" && v.valor.trim() ? v.valor.trim() : null;
  let pagina = Number.isInteger(v.pagina) ? v.pagina as number : null;
  if (valor !== null && pagina !== null && !pages.includes(pagina)) { notes.push(`${where}: la página ${pagina} no pertenece a la parte; se descarta la referencia`); pagina = null; }
  return { valor, pagina: valor === null ? null : pagina };
};

/**
 * Validates the model output against the plan. Shape errors fail; recoverable slips (page outside the part,
 * proposals that duplicate a listed field) are corrected and recorded. Missing required fields are reported in
 * `faltan`, never invented.
 */
export function validateTargeted(raw: unknown, plans: PartPlan[], archivo: string): { partes: Map<string, Pick<PartExtraction, "entidades" | "faltan" | "propuestas">>; incidencias: string[] } {
  if (!object(raw) || !object(raw.partes) || !Array.isArray(raw.propuestas) || !Array.isArray(raw.incidencias)) throw new Error(`${archivo}: extracción con formato inválido`);
  const incidencias = raw.incidencias.filter((i): i is string => typeof i === "string");
  const partes = new Map<string, Pick<PartExtraction, "entidades" | "faltan" | "propuestas">>();
  for (const plan of plans.filter(p => p.modo === "dirigida")) {
    const data = raw.partes[plan.parte.id];
    if (!object(data)) throw new Error(`${archivo}: falta la extracción de la parte ${plan.parte.id}`);
    const entidades: Record<string, ExtractedRecord | ExtractedRecord[]> = {};
    const faltan: string[] = [];
    for (const entity of plan.entidades) {
      const value = data[entity.role];
      const toRecord = (r: unknown, label: string): ExtractedRecord => {
        if (!object(r)) throw new Error(`${archivo} ${plan.parte.id}: ${label} inválido`);
        return Object.fromEntries(entity.fields.map(f => [f.key, clean(r[f.key], plan.paginas, `${plan.parte.id} ${label}.${f.key}`, incidencias)]));
      };
      const missing = (record: ExtractedRecord, label: string) => {
        for (const f of entity.fields) if (f.required && record[f.key].valor === null) faltan.push(`${label}.${f.key}`);
      };
      const present = (record: ExtractedRecord) => Object.values(record).some(v => v.valor !== null);
      if (entity.cardinality === "many") {
        if (!Array.isArray(value)) throw new Error(`${archivo} ${plan.parte.id}: ${entity.role} debe ser una lista`);
        // Empty (template) rows are dropped before anything else: they are not lines with missing fields.
        const rows = value.map((r, i) => toRecord(r, `${entity.role}[${i + 1}]`)).filter(present);
        rows.forEach((row, i) => missing(row, `${entity.role}[${i + 1}]`));
        if (entity.required && !rows.length) faltan.push(entity.role);
        entidades[entity.role] = rows;
      } else {
        const record = toRecord(value, entity.role);
        // Required fields of an entity are only "missing" when the entity itself is present or required.
        if (present(record) || entity.required) missing(record, entity.role);
        entidades[entity.role] = record;
      }
    }
    const known = new Map(plan.entidades.map(e => [e.role, new Set(e.fields.map(f => f.key))]));
    const propuestas = (raw.propuestas as unknown[]).filter(object).filter(p => p.parte === plan.parte.id).flatMap((p): Proposal[] => {
      const entidad = String(p.entidad), campo = String(p.campo), valor = typeof p.valor === "string" ? p.valor.trim() : "";
      if (!/^[a-z][a-z0-9_]*$/.test(campo) || !valor || !Number.isInteger(p.pagina) || !plan.paginas.includes(p.pagina as number)) return [];
      if (known.get(entidad)?.has(campo)) { incidencias.push(`${plan.parte.id}: la propuesta «${campo}» ya es un campo de ${entidad}; se descarta`); return []; }
      return [{ entidad, campo, nombre: String(p.nombre ?? campo), valor, pagina: p.pagina as number, motivo: String(p.motivo ?? "") }];
    });
    partes.set(plan.parte.id, { entidades, faltan, propuestas });
  }
  return { partes, incidencias };
}
