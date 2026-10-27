import { copiedHalf } from "./duplicates";
import { expenseCategory, FIELD_SET_MAPPING, STANDARD_TYPES } from "@/lib/engine/catalog/standard-catalog";
import type { TargetedFile, TargetedResult } from "../targeted/contract";
import type { ReconciliationResult, ReconciledEntity } from "../reconciliation/contract";
import { toDate, toDecimal, toInteger, usesCommaDecimals, type Conversion } from "./convert";

/**
 * Write plan (pure): which records will be created or reused, with typed values, the printed evidence of every
 * value, and the relations between them. Built from the targeted extraction and the reconciliation; nothing is
 * written here. Entities that need a person (misread tax id, ambiguous match, no identifier) are blocked until a
 * decision is given: join them to the suggested entity, save them as they are, or leave them out.
 */
export const WRITER_REVISION = 1;

export type Decision = "unir" | "tal_cual" | "omitir";
/** A decision, or "unir:<record id>": the person says which saved company it is (when no suggestion fits). */
export type DecisionValue = Decision | `unir:${string}`;
export const MANUAL_JOIN = /^unir:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export type Evidence = { campo: string; impreso: string; archivo: string; archivoId: string; pagina: number | null; origen: string; inferido?: string };
export type PlannedRecord = {
  ref: string; tipo: string;
  accion: "crear" | "reutilizar" | "omitir" | "unir" | "bloqueado";
  registroId?: string; claveExterna: string | null; padre?: string;
  valores: Record<string, unknown>; evidencias: Evidence[];
  noConvertidos: { campo: string; impreso: string; motivo: string; origen: string }[];
  avisos: string[];
  bloqueo?: { motivo: string; opciones: Decision[]; sugerencia?: string };
  /** Entity this one is joined to (decision "unir"). */
  unidoA?: string;
};
export type PlannedLink = { relacion: string; desde: string; hacia: string };
export type WritePlan = {
  module: "record_writer_plan"; version: typeof WRITER_REVISION; loteId: string;
  resumen: { crear: number; reutilizar: number; bloqueados: number; omitidos: number; unidos: number; relaciones: number; noConvertidos: number };
  registros: PlannedRecord[]; relaciones: PlannedLink[]; avisos: string[];
};

type Field = { valor: string | null; pagina: number | null };
type Row = Record<string, Field>;

/** Role → catalog relation joining it to the invoice of its part (owner → owned, as the catalog defines it). */
const INVOICE_RELATIONS: Record<string, { relacion: string; invoiceIs: "desde" | "hacia" }> = {
  issuer: { relacion: "invoice_issuer", invoiceIs: "hacia" }, recipient: { relacion: "invoice_customer", invoiceIs: "hacia" },
  supply: { relacion: "invoice_supply_point", invoiceIs: "hacia" }, lines_service: { relacion: "invoice_telecom_lines", invoiceIs: "hacia" },
  lines: { relacion: "invoice_lines", invoiceIs: "desde" }, charges: { relacion: "invoice_lines", invoiceIs: "desde" },
  tax_breakdown: { relacion: "invoice_tax_lines", invoiceIs: "desde" }, power: { relacion: "invoice_contracted_power", invoiceIs: "desde" },
  consumption: { relacion: "invoice_energy_consumption", invoiceIs: "desde" }, meter_readings: { relacion: "invoice_meter_readings", invoiceIs: "desde" },
};
/** Roles reconciled as entities of their own; any other role is a detail row of the invoice. */
const MASTER_ROLES = new Set(["invoice", "issuer", "recipient", "supply", "lines_service"]);
const IDENTIFIER_FIELD: Record<string, string> = { company: "tax_identifier", supply_point: "supply_point_id", telecom_line: "number" };
const SUPPLY_TYPE: Record<string, string> = { suministro_electricidad: "electricidad", suministro_gas: "gas", suministro_agua: "agua", telecomunicaciones: "telecomunicaciones" };

const fieldType = (type: string, field: string) => STANDARD_TYPES.find(t => t.key === type)?.fields.find(f => f.key === field)?.type ?? "text";

function convert(type: string, printed: string, ctx: { commaDecimals: boolean; reference: string | null }): Conversion<unknown> {
  switch (type) {
    case "decimal": return toDecimal(printed, { commaDecimals: ctx.commaDecimals });
    case "integer": return toInteger(printed);
    case "date": return toDate(printed, ctx.reference);
    case "boolean": return { ok: false, reason: "no se deduce un sí/no de un texto impreso" };
    default: return { ok: true, value: printed.trim() };
  }
}

export function buildWritePlan(extraction: TargetedResult, reconciliation: ReconciliationResult, decisions: Record<string, DecisionValue> = {}): WritePlan {
  // Mention (file, part, role, row) → reconciled entity.
  const entityOf = new Map<string, ReconciledEntity>();
  for (const e of reconciliation.entidades) for (const m of e.menciones) entityOf.set(`${m.archivoId}|${m.parteId}|${m.rol}|${m.indice ?? 0}`, e);
  const records = new Map<string, PlannedRecord>();
  const links: PlannedLink[] = [];
  const avisos: string[] = [...reconciliation.avisos];

  const recordFor = (ref: string, tipo: string, init: Partial<PlannedRecord> = {}) => {
    let r = records.get(ref);
    if (!r) { r = { ref, tipo, accion: "crear", claveExterna: null, valores: {}, evidencias: [], noConvertidos: [], avisos: [], ...init }; records.set(ref, r); }
    return r;
  };
  const put = (record: PlannedRecord, campo: string, field: Field, file: TargetedFile, origen: string, ctx: { commaDecimals: boolean; reference: string | null }) => {
    const printed = field.valor?.trim();
    if (!printed || record.valores[campo] !== undefined) return;   // first printed value wins; later mentions are evidence only
    const result = convert(fieldType(record.tipo, campo), printed, ctx);
    if (!result.ok) { record.noConvertidos.push({ campo, impreso: printed, motivo: result.reason, origen }); return; }
    record.valores[campo] = result.value;
    record.evidencias.push({ campo, impreso: printed, archivo: file.archivo, archivoId: file.archivoId, pagina: field.pagina, origen, ...(result.inferred ? { inferido: result.inferred } : {}) });
  };

  for (const file of extraction.archivos as TargetedFile[]) {
    const printedNumbers = file.partes.flatMap(p => Object.values(p.entidades ?? {}).flatMap(d => (Array.isArray(d) ? d : [d]) as Row[]))
      .flatMap(r => Object.values(r).map(f => f?.valor ?? "")).filter(v => /\d[.,]\d/.test(v));
    const commaDecimals = usesCommaDecimals(printedNumbers);
    for (const part of file.partes) {
      if (part.modo !== "dirigida" || !part.entidades) continue;
      const entities = part.entidades as Record<string, Row | Row[]>;
      const mention = (rol: string, indice: number) => entityOf.get(`${file.archivoId}|${part.parteId}|${rol}|${indice}`);
      const invoiceEntity = mention("invoice", 0);
      const invoiceRef = invoiceEntity?.ref ?? null;
      if (!invoiceRef) { avisos.push(`${file.archivo} (${part.parteId}): sin factura identificada; sus datos no se guardan`); continue; }
      const invoiceRow = entities.invoice as Row | undefined;
      const issued = invoiceRow?.issue_date?.valor ? toDate(invoiceRow.issue_date.valor) : null;
      const ctx = { commaDecimals, reference: issued?.ok ? issued.value : null };
      const invoice = recordFor(invoiceRef, "invoice", { claveExterna: invoiceEntity!.clave });
      // Expense category from the classification (not printed): what analytics groups by (supplies, purchases…).
      if (invoice.valores.expense_category === undefined) {
        const { category, subcategory } = expenseCategory(part.subtipo);
        invoice.valores.expense_category = category; invoice.valores.expense_subcategory = subcategory;
        invoice.evidencias.push({ campo: "expense_category", impreso: `${part.tipo}${part.subtipo ? ` / ${part.subtipo}` : ""}`, archivo: file.archivo, archivoId: file.archivoId, pagina: null, origen: "clasificación" });
      }

      for (const [rol, data] of Object.entries(entities)) {
        const rows = (Array.isArray(data) ? data : [data]) as Row[];
        const mapping = FIELD_SET_MAPPING[rol] ?? {};
        // Detail lines read twice (original + copy in the same PDF): the repeated half is not saved.
        const lineAmount = Object.entries(mapping).find(([, t]) => t.type === "invoice_line" && t.field === "line_total")?.[0];
        const subtotalKey = Object.entries(FIELD_SET_MAPPING.invoice ?? {}).find(([, t]) => t.field === "net_amount")?.[0];
        const subtotal = subtotalKey && invoiceRow?.[subtotalKey]?.valor ? toDecimal(invoiceRow[subtotalKey].valor!, { commaDecimals }) : null;
        const skip = new Set(Array.isArray(data) && lineAmount ? copiedHalf(rows.map(r => Object.fromEntries(Object.entries(r).map(([k, f]) => [k, f?.valor ?? null]))),
          subtotal?.ok ? Number(subtotal.value) : null, r => { const d = r[lineAmount] ? toDecimal(r[lineAmount]!, { commaDecimals }) : null; return d?.ok ? Number(d.value) : null; }) : []);
        if (skip.size) avisos.push(`${file.archivo} (${part.parteId}): las ${skip.size} líneas de «${rol}» estaban repetidas (original y copia en el mismo documento); se guardan una vez`);
        rows.forEach((row, indice) => {
          if (skip.has(indice)) return;
          if (!Object.values(row).some(f => f?.valor)) return;
          const origen = Array.isArray(data) ? `${rol}[${indice + 1}]` : rol;
          let own: PlannedRecord;
          if (MASTER_ROLES.has(rol)) {
            const entity = mention(rol, indice);
            if (!entity) return;
            own = rol === "invoice" ? invoice : recordFor(entity.ref, entity.tipo, { claveExterna: entity.clave });
          } else {
            const target = Object.values(mapping)[0]?.type;
            if (!target) { avisos.push(`${file.archivo}: «${rol}» no tiene sitio en el catálogo; no se guarda`); return; }
            own = recordFor(`${invoiceRef}#${part.parteId}.${rol}[${indice + 1}]`, target, { padre: invoiceRef });
          }
          for (const [key, field] of Object.entries(row)) {
            const target = mapping[key];
            if (!target || !field) continue;
            // A field may belong to another entity of the part (the billed period printed with the supply → invoice).
            const into = target.type === own.tipo ? own : target.type === "invoice" ? invoice : null;
            if (into) put(into, target.field, field, file, `${origen}.${key}`, ctx);
          }
          if (rol === "supply" && part.subtipo && SUPPLY_TYPE[part.subtipo] && own.valores.supply_type === undefined) {
            own.valores.supply_type = SUPPLY_TYPE[part.subtipo];
            own.evidencias.push({ campo: "supply_type", impreso: part.subtipo, archivo: file.archivo, archivoId: file.archivoId, pagina: null, origen: "clasificación" });
          }
          const rel = INVOICE_RELATIONS[rol];
          if (rel) links.push(rel.invoiceIs === "hacia" ? { relacion: rel.relacion, desde: own.ref, hacia: invoiceRef } : { relacion: rel.relacion, desde: invoiceRef, hacia: own.ref });
        });
      }
      // The recipient holds the supply and the lines billed to it.
      const recipient = mention("recipient", 0)?.ref;
      if (recipient) {
        const supply = mention("supply", 0)?.ref;
        if (supply) links.push({ relacion: "supply_point_holder", desde: recipient, hacia: supply });
        (Array.isArray(entities.lines_service) ? entities.lines_service : []).forEach((_, i) => {
          const line = mention("lines_service", i)?.ref;
          if (line) links.push({ relacion: "telecom_line_holder", desde: recipient, hacia: line });
        });
      }
    }
  }

  // Actions from the reconciliation, then the person's decisions.
  for (const e of reconciliation.entidades) {
    const r = records.get(e.ref);
    if (!r) continue;
    // Identifiers are stored in their comparable form ("B 84818442" → "B84818442"); the printed one stays as evidence.
    const idField = IDENTIFIER_FIELD[e.tipo];
    if (idField && e.clave && r.valores[idField] !== undefined) r.valores[idField] = e.clave;
    r.avisos.push(...e.avisos);
    // A company printed without tax id whose name matches an existing record: that record can take its place.
    if (e.sugerenciaRegistro && !records.has(`company:registro:${e.sugerenciaRegistro.id}`))
      records.set(`company:registro:${e.sugerenciaRegistro.id}`, { ref: `company:registro:${e.sugerenciaRegistro.id}`, tipo: "company", accion: "reutilizar",
        registroId: e.sugerenciaRegistro.id, claveExterna: e.sugerenciaRegistro.clave, valores: { legal_name: e.sugerenciaRegistro.nombre }, evidencias: [], noConvertidos: [], avisos: [] });
    const suggested = e.sugerencia && records.has(e.sugerencia) ? e.sugerencia : e.sugerenciaRegistro ? `company:registro:${e.sugerenciaRegistro.id}` : undefined;
    if (e.estado === "existente") { r.accion = "reutilizar"; r.registroId = e.registros[0].id; }
    else if (e.estado === "ambigua") r.bloqueo = { motivo: "Varios registros tienen este identificador", opciones: ["tal_cual", "omitir"] };
    else if (e.estado === "sin_identificador") r.bloqueo = suggested
      ? { motivo: "Sin identificador; por el nombre parece una empresa conocida", opciones: ["unir", "tal_cual", "omitir"], sugerencia: suggested }
      : { motivo: "Sin identificador con el que reconocerlo después", opciones: ["tal_cual", "omitir"] };
    else if (e.estado === "tipo_no_definido" || e.estado === "no_comprobada") r.bloqueo = { motivo: "No se pudo comprobar si ya existe", opciones: ["omitir"] };
    else if (e.sugerencia && records.has(e.sugerencia)) r.bloqueo = { motivo: "Identificador probablemente mal leído", opciones: ["unir", "tal_cual", "omitir"], sugerencia: e.sugerencia };
    else if (e.tipo === "company" && e.avisos.some(a => /NIF\/CIF/.test(a))) r.bloqueo = { motivo: "NIF/CIF no válido", opciones: ["tal_cual", "omitir"] };
    if (r.bloqueo) {
      const decision = decisions[e.ref];
      const manual = e.tipo === "company" && r.bloqueo.opciones.includes("tal_cual") && typeof decision === "string" ? MANUAL_JOIN.exec(decision)?.[1] : undefined;
      if (manual) {
        // The person chose the saved company it is: that record takes its place (checked to exist when saving).
        const ref = `company:registro:${manual}`;
        if (!records.has(ref)) records.set(ref, { ref, tipo: "company", accion: "reutilizar", registroId: manual, claveExterna: null, valores: {}, evidencias: [], noConvertidos: [], avisos: [] });
        r.accion = "unir"; r.unidoA = ref;
      } else if (decision && r.bloqueo.opciones.includes(decision as Decision)) {
        r.accion = decision === "tal_cual" ? "crear" : decision as "unir" | "omitir";
        if (decision === "unir") r.unidoA = r.bloqueo.sugerencia;
      } else r.accion = "bloqueado";
    }
  }
  // A repeated invoice is reused as it is: its lines are not added a second time. Details follow their invoice.
  for (const r of records.values()) {
    if (!r.padre) continue;
    const parent = records.get(r.padre)!;
    if (parent.accion !== "crear") r.accion = parent.accion === "bloqueado" ? "bloqueado" : "omitir";
  }
  for (const r of records.values()) if (r.tipo === "invoice" && r.accion === "reutilizar") r.avisos.push("Factura ya guardada: no se añaden sus líneas otra vez");

  // Relations: joined entities are replaced by the one they join; relations to left-out entities are dropped.
  const resolve = (ref: string) => { const r = records.get(ref); return r?.accion === "unir" && r.unidoA ? r.unidoA : ref; };
  const writable = (ref: string) => { const a = records.get(ref)?.accion; return a === "crear" || a === "reutilizar" || a === "bloqueado"; };
  const relaciones = [...new Map(links.map(l => ({ ...l, desde: resolve(l.desde), hacia: resolve(l.hacia) }))
    .filter(l => l.desde !== l.hacia && writable(l.desde) && writable(l.hacia)).map(l => [`${l.relacion}|${l.desde}|${l.hacia}`, l])).values()];

  const registros = [...records.values()];
  const count = (a: PlannedRecord["accion"]) => registros.filter(r => r.accion === a).length;
  return { module: "record_writer_plan", version: WRITER_REVISION, loteId: reconciliation.loteId, registros, relaciones, avisos,
    resumen: { crear: count("crear"), reutilizar: count("reutilizar"), bloqueados: count("bloqueado"), omitidos: count("omitir"), unidos: count("unir"),
      relaciones: relaciones.length, noConvertidos: registros.reduce((n, r) => n + r.noConvertidos.length, 0) } };
}
