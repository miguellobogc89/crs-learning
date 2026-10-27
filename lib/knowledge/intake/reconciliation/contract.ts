import type { TargetedFile, TargetedResult } from "../targeted/contract";

/**
 * Reconciliation: which entities of a targeted extraction already exist in the workspace's Engine records.
 * Deterministic (no AI), read-only (nothing is created, merged or linked here). Identity comes only from
 * identifiers printed in the document (tax id, invoice number, supply point, telecom line), never from names.
 * Entities without an identifier, or with conflicting candidates, are left for a person to review.
 */
export const RECONCILIATION_REVISION = 3;

/** Entity kinds reconciled on their own; other extracted entities (lines, charges, tax rows…) are details of their invoice. */
export const RECONCILED_TYPES = ["company", "invoice", "supply_point", "telecom_line"] as const;
export type ReconciledType = (typeof RECONCILED_TYPES)[number];

/** Field keys that may hold each identifier in existing Engine records (records created before this pipeline). */
export const IDENTIFIER_KEYS: Record<ReconciledType, string[]> = {
  company: ["tax_id", "nif", "cif", "vat_number", "tax_identifier", "fiscal_id", "identificacion_fiscal"],
  invoice: ["invoice_number", "numero_factura", "number", "numero"],
  supply_point: ["supply_point_id", "cups", "supply_point"],
  telecom_line: ["number", "phone_number", "line_number", "telefono"],
};

/** Which role holds which kind of entity, and which of its fields identifies it. */
const ROLE_KINDS: Record<string, { type: ReconciledType; field: string }> = {
  issuer: { type: "company", field: "tax_id" },
  recipient: { type: "company", field: "tax_id" },
  invoice: { type: "invoice", field: "invoice_number" },
  supply: { type: "supply_point", field: "supply_point_id" },
  lines_service: { type: "telecom_line", field: "number" },
};

export type Mention = { archivoId: string; archivo: string; parteId: string; rol: string; nombre: string | null; valorImpreso: string | null };
export type EntityState = "nueva" | "existente" | "ambigua" | "sin_identificador" | "tipo_no_definido" | "no_comprobada";
export type ReconciledEntity = {
  ref: string; tipo: ReconciledType; clave: string | null; nombres: string[]; menciones: Mention[];
  estado: EntityState; registros: { id: string; externalKey: string | null }[]; avisos: string[];
};
export type PlannedRelation = { desde: string; relacion: string; hacia: string };
export type InvoiceDetail = { factura: string; rol: string; filas: number };
export type ReconciliationResult = {
  module: "reconciliation"; version: typeof RECONCILIATION_REVISION; loteId: string; soloLectura: true;
  resumen: { entidades: number; nuevas: number; existentes: number; ambiguas: number; sinIdentificador: number; noComprobadas: number; avisos: number };
  entidades: ReconciledEntity[]; relaciones: PlannedRelation[]; detalles: InvoiceDetail[]; avisos: string[];
};
export type ReconciliationState = { status: "running" | "completed" | "error"; revision: number; lease: string; resultado?: ReconciliationResult; error?: string };

// ---------- identifiers ----------

const CIF_LETTERS = "JABCDEFGHI";
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Spanish tax ids: DNI/NIF, NIE and CIF check characters. Foreign ids are not validated (null). */
export function spanishTaxIdValid(id: string): boolean | null {
  if (/^\d{8}[A-Z]$/.test(id)) return DNI_LETTERS[Number(id.slice(0, 8)) % 23] === id[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(id)) return DNI_LETTERS[Number("XYZ".indexOf(id[0]) + id.slice(1, 8)) % 23] === id[8];
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(id)) {
    const digits = id.slice(1, 8).split("").map(Number);
    const sum = digits.reduce((total, d, i) => total + (i % 2 === 0 ? Math.floor(d * 2 / 10) + (d * 2) % 10 : d), 0);
    const control = (10 - (sum % 10)) % 10;
    return id[8] === String(control) || id[8] === CIF_LETTERS[control];
  }
  return null;
}

/** Comparable form of an identifier. Tax ids drop spaces, dots, dashes and an "ES" VAT prefix; lines keep digits. */
export function normalizeIdentifier(type: ReconciledType, raw: string): string {
  const compact = raw.normalize("NFKC").toUpperCase().replace(/\s+/g, "");
  if (type === "company") {
    const id = compact.replace(/[.\-/]/g, "");
    return /^ES/.test(id) && spanishTaxIdValid(id.slice(2)) !== null ? id.slice(2) : id;
  }
  if (type === "telecom_line") return compact.replace(/\D/g, "");
  return compact;
}

// ---------- grouping (pure) ----------

const value = (record: Record<string, { valor: string | null }> | undefined, key: string) => {
  const v = record?.[key]?.valor;
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const asRecords = (data: unknown) => (Array.isArray(data) ? data : data ? [data] : []) as Record<string, { valor: string | null }>[];

type Found = { type: ReconciledType; clave: string | null; mention: Mention; aviso?: string };

/**
 * Groups the mentions of every reconciled entity of the batch by identifier (the same supplier in two invoices is
 * one entity) and plans the relations between them. Invoice identity is issuer + number: two suppliers may use
 * the same number.
 */
export function groupEntities(result: TargetedResult) {
  const found: Found[] = [];
  const relaciones: PlannedRelation[] = [];
  const detalles: InvoiceDetail[] = [];
  const avisos: string[] = [];
  let anonymous = 0;
  const refOf = (f: Found) => f.clave !== null ? `${f.type}:${f.clave}` : `${f.type}:sin-identificador-${++anonymous}`;
  const refs = new Map<Found, string>();

  for (const file of result.archivos as TargetedFile[]) {
    for (const part of file.partes) {
      if (part.modo !== "dirigida" || !part.entidades) continue;
      const entities = part.entidades as Record<string, unknown>;
      const issuerRaw = value(asRecords(entities.issuer)[0], "tax_id");
      const issuerKey = issuerRaw ? normalizeIdentifier("company", issuerRaw) : null;
      const partFound: Found[] = [];
      for (const [rol, data] of Object.entries(entities)) {
        const kind = ROLE_KINDS[rol];
        const records = asRecords(data);
        if (!kind) {
          // Details of the invoice: kept with it, never reconciled on their own.
          const filas = records.filter(r => Object.values(r).some(v => v?.valor !== null)).length;
          if (filas) detalles.push({ factura: "", rol, filas });
          continue;
        }
        for (const record of records) {
          const printed = value(record, kind.field);
          const nombre = value(record, "legal_name") ?? value(record, "service") ?? value(record, "plan");
          if (!printed && !nombre && !Object.values(record).some(v => v?.valor !== null)) continue;
          let clave = printed ? normalizeIdentifier(kind.type, printed) : null;
          if (kind.type === "invoice" && clave) clave = `${issuerKey ?? "sin-emisor"}/${clave}`;
          const f: Found = { type: kind.type, clave, mention: { archivoId: file.archivoId, archivo: file.archivo, parteId: part.parteId, rol, nombre, valorImpreso: printed } };
          if (kind.type === "company" && printed) {
            const valid = spanishTaxIdValid(normalizeIdentifier("company", printed));
            if (valid === false) f.aviso = `${file.archivo}: el NIF/CIF «${printed}» (${rol}) no supera el dígito de control; probable error de lectura`;
          }
          if (kind.type === "invoice" && printed && !issuerKey) f.aviso = `${file.archivo}: factura sin NIF del emisor; su identidad solo se apoya en el número`;
          found.push(f); partFound.push(f);
        }
      }
      // Relations of this part: invoice → issuer, recipient, supply point, telecom lines; details belong to the invoice.
      const invoice = partFound.find(f => f.type === "invoice");
      for (const f of partFound) refs.set(f, refOf(f));
      if (invoice) {
        for (const f of partFound) if (f !== invoice) relaciones.push({ desde: refs.get(invoice)!, relacion: f.mention.rol, hacia: refs.get(f)! });
        for (const d of detalles) if (!d.factura) d.factura = refs.get(invoice)!;
      } else {
        avisos.push(`${file.archivo} (${part.parteId}): sin datos de factura; sus entidades no se relacionan`);
        for (const d of detalles) if (!d.factura) d.factura = `${file.archivo}:${part.parteId}`;
      }
    }
  }
  // Same type + identifier = one entity, whatever document or role mentions it.
  const groups = new Map<string, ReconciledEntity>();
  for (const f of found) {
    const ref = refs.get(f)!;
    const entity = groups.get(ref) ?? { ref, tipo: f.type, clave: f.clave, nombres: [], menciones: [], estado: f.clave ? "no_comprobada" as const : "sin_identificador" as const, registros: [], avisos: [] };
    entity.menciones.push(f.mention);
    if (f.mention.nombre && !entity.nombres.includes(f.mention.nombre)) entity.nombres.push(f.mention.nombre);
    if (f.aviso && !entity.avisos.includes(f.aviso)) entity.avisos.push(f.aviso);
    groups.set(ref, entity);
  }
  flagMisreadTaxIds([...groups.values()]);
  // A relation listed twice (same supplier on both sides of one document) is kept once.
  const unique = [...new Map(relaciones.map(r => [`${r.desde}|${r.relacion}|${r.hacia}`, r])).values()];
  return { entidades: [...groups.values()], relaciones: unique, detalles, avisos };
}

// Characters OCR and vision models confuse at the start of a tax id ("B72378581" read as "872378581").
const LOOKALIKES: Record<string, string[]> = { "8": ["B"], "B": ["8"], "0": ["O", "D", "Q"], "O": ["0"], "D": ["0"], "5": ["S"], "S": ["5"],
  "1": ["I", "L"], "I": ["1"], "2": ["Z"], "Z": ["2"], "6": ["G"], "G": ["6"], "4": ["A"], "A": ["4"], "7": ["T"], "T": ["7"] };

/** Valid Spanish tax ids one look-alike character away from an id that is not a valid one. */
export function taxIdLookalikes(id: string): string[] {
  if (spanishTaxIdValid(id) === true || id.length !== 9) return [];
  const out = new Set<string>();
  for (let i = 0; i < id.length; i++) for (const alt of LOOKALIKES[id[i]] ?? []) {
    const candidate = id.slice(0, i) + alt + id.slice(i + 1);
    if (spanishTaxIdValid(candidate) === true) out.add(candidate);
  }
  return [...out];
}

/**
 * A tax id that is not valid but is one look-alike character away from a company of the batch is almost surely
 * that company misread. It is NOT merged (a person confirms): it gets a notice naming the probable company.
 */
function flagMisreadTaxIds(entidades: ReconciledEntity[]) {
  const keys = new Map(entidades.filter(e => e.tipo === "company" && e.clave && spanishTaxIdValid(e.clave)).map(e => [e.clave!, e]));
  for (const entity of entidades) {
    if (entity.tipo !== "company" || !entity.clave || spanishTaxIdValid(entity.clave) === true) continue;
    const match = taxIdLookalikes(entity.clave).find(k => keys.has(k));
    if (match) entity.avisos.push(`«${entity.clave}» no es un NIF/CIF válido; probablemente es ${match} (${keys.get(match)!.nombres[0] ?? "otra empresa del lote"}) mal leído. No se ha unido: confírmalo`);
    else if (spanishTaxIdValid(entity.clave) === null && /^\d{9}$/.test(entity.clave)) entity.avisos.push(`«${entity.clave}» no tiene formato de NIF/CIF (9 cifras): probable letra leída como número`);
  }
}

/** Candidate Engine records per identifier, or why they could not be checked. */
export type Lookup = { tipoDefinido: boolean; completo: boolean; candidatos: Map<string, { id: string; externalKey: string | null }[]> };

export function applyLookups(loteId: string, grouped: ReturnType<typeof groupEntities>, lookups: Map<ReconciledType, Lookup>): ReconciliationResult {
  const entidades = grouped.entidades.map(entity => {
    if (entity.clave === null) return entity;
    const lookup = lookups.get(entity.tipo);
    if (!lookup?.tipoDefinido) return { ...entity, estado: "tipo_no_definido" as const };
    // Invoices are stored by number; the issuer part of the key is checked through the relation later.
    const key = entity.tipo === "invoice" ? entity.clave.split("/").slice(1).join("/") : entity.clave;
    const registros = lookup.candidatos.get(key) ?? [];
    const estado: EntityState = registros.length > 1 ? "ambigua" : registros.length === 1 ? "existente" : lookup.completo ? "nueva" : "no_comprobada";
    const avisos = entity.tipo === "invoice" && registros.length ? [...entity.avisos, "Ya existe una factura con este número: posible documento repetido"] : entity.avisos;
    return { ...entity, estado, registros, avisos };
  });
  // The same tax id on different printed names is the same company; a different tax id is never merged by name.
  const count = (s: EntityState) => entidades.filter(e => e.estado === s).length;
  const avisos = [...grouped.avisos];
  return { module: "reconciliation", version: RECONCILIATION_REVISION, loteId, soloLectura: true,
    resumen: { entidades: entidades.length, nuevas: count("nueva"), existentes: count("existente"), ambiguas: count("ambigua"),
      sinIdentificador: count("sin_identificador"), noComprobadas: count("no_comprobada") + count("tipo_no_definido"),
      avisos: avisos.length + entidades.reduce((n, e) => n + e.avisos.length, 0) },
    entidades, relaciones: grouped.relaciones, detalles: grouped.detalles, avisos };
}
