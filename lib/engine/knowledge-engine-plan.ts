import { createHash } from "node:crypto";
import { validateSchemaDiscovery, type SchemaDiscoveryProposal } from "./schema-discovery/validation";
import { validateEngineRecordValues } from "./validation";
import { checkedInvoice, stableJson } from "./invoice-evidence";
export type EngineSource = {
  id: string;
  file_name: string;
  extracted_text: string;
  content_hash: string | null;
  status: string;
};
export type EngineBatchRow = {
  id: string;
  entity: string;
  documentId: string;
  values: Record<string, string | number | boolean>;
  evidence: Record<string, string>;
  identityFields: string[];
  identityParent?: string;
  calculations?: Record<string, {
    operation: "sum";
    operands: number[];
  }>;
};
export type EngineBatchLink = {
  relationKey: string;
  from: string;
  to: string;
  documentId: string;
  evidence: string;
};
export type EngineBatchPlan = {
  kind: "knowledge_relational_import_v1";
  schema: SchemaDiscoveryProposal;
  rows: EngineBatchRow[];
  links: EngineBatchLink[];
  sourceFingerprint: string;
};
export const hashPlan = (v: unknown) => createHash("sha256").update(stableJson(v)).digest("hex");
export const sourceFingerprint = (files: EngineSource[], proposal: unknown) => hashPlan({
  files: files.map(f => ({ id: f.id, status: f.status, text: f.extracted_text, hash: f.content_hash })).sort((a, b) => a.id.localeCompare(b.id)), proposal,
});
export const normalizedIdentity = (v: string | number | boolean) => String(v).normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const canonicalRecordValue = (value: string | number | boolean) =>
  typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleUpperCase("es") : value;
export function batchRowIdentity(row: EngineBatchRow): string {
  return row.entity + ":" + hashPlan([...row.identityFields].sort().map(key => [key,
    row.entity === "company" ? normalizedIdentity(row.values[key]) : canonicalRecordValue(row.values[key])]));
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const fail = (message: string): never => { throw new Error("Engine: " + message); };
/** Reused at preview AND commit. Model quotes never authorize unsupported values or endpoints. */
export function validateEngineBatchPlan(raw: unknown, files: EngineSource[], workspaceId: string): EngineBatchPlan {
  if (!object(raw) || !object(raw.schema) || !Array.isArray(raw.rows) || !Array.isArray(raw.links) ||
    raw.rows.length > 500 || raw.links.length > 1000 || typeof raw.sourceFingerprint !== "string")
    return fail("plan relacional inválido.");
  const schema = validateSchemaDiscovery({
    workspaceId,
    documents: files.map(f => ({ id: f.id, workspaceId, extractedText: f.extracted_text })), proposal: raw.schema
  });
  if (!schema.valid || !schema.proposal)
    return fail("esquema sin evidencia válida: " + JSON.stringify(schema.issues));
  if (schema.proposal.entities.some(e => /^(supplier|customer|vendor|buyer|seller|proveedor|cliente)$/.test(e.key)))
    return fail("proveedor y cliente son roles de company, no tablas independientes.");
  const sources = new Map(files.map(f => [f.id, f]));
  const entities = new Map(schema.proposal.entities.map(e => [e.key, e]));
  const rows: EngineBatchRow[] = [];
  const ids = new Set<string>();
  for (const item of raw.rows) {
    if (!object(item) || typeof item.id !== "string" || !item.id || ids.has(item.id) ||
      typeof item.entity !== "string" || typeof item.documentId !== "string" || !object(item.values) ||
      !object(item.evidence) || !Array.isArray(item.identityFields) || !item.identityFields.length ||
      item.identityFields.length > 4 || !item.identityFields.every(k => typeof k === "string") ||
      new Set(item.identityFields).size !== item.identityFields.length)
      return fail("registro o identidad inválidos.");
    const row = item as unknown as EngineBatchRow;
    const entity = entities.get(row.entity), file = sources.get(row.documentId);
    if (!entity || !file || !Object.keys(row.values).length)
      return fail("registro sin entidad o fuente autorizada.");
    const fields = entity.fields.map(f => ({ key: f.key, field_type: f.type, is_required: f.required, status: "active" }));
    const typed = validateEngineRecordValues(row.values, fields);
    if (!typed.ok)
      return fail("valores incompatibles: " + JSON.stringify(typed.issues));
    for (const [key, value] of Object.entries(row.values)) {
      const quote = row.evidence[key];
      if (typeof quote !== "string" || !quote.trim() || quote.length > 4000 || !file.extracted_text.includes(quote))
        return fail("falta evidencia literal del campo " + key);
      if (fields.find(f => f.key === key)?.field_type === "date" || (row.entity === "invoice" && ["invoice_number", "net_amount", "tax_amount", "total_amount"].includes(key))) {
        const checked = checkedInvoice({ values: { [key]: value }, evidence: { [key]: quote }, calculations: row.calculations }, file.extracted_text, new Map(fields.map(f => [f.key, f.field_type])), { allowPartial: true });
        if (checked.values[key] === undefined)
          return fail("campo de factura no verificable: " + key);
      }
      else if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        return fail("valor no escalar.");
      }
      else if (!norm(quote).includes(norm(String(value))) &&
        !(typeof value === "number" && (quote.match(/-?\d[\d.,]*/g) ?? []).some(t => {
          const s = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
          return Number(s) === value;
        })))
        return fail("valor ajeno a su cita: " + key);
    }
    if (row.identityFields.some(k => row.values[k] === undefined || row.values[k] === "" || !normalizedIdentity(row.values[k])))
      return fail("identidad sin evidencia.");
    // Names and roles do not establish company identity. A tax identifier does.
    if (row.entity === "company" && (row.identityFields.length !== 1 ||
      !/^(tax_id|tax_identifier|fiscal_id|vat_number|tax_number|nif|cif)$/.test(row.identityFields[0]) ||
      !/^[A-Z0-9]{5,20}$/.test(normalizedIdentity(row.values[row.identityFields[0]]))))
      return fail("la empresa necesita una identificación fiscal verificable; no se fusiona por nombre.");
    if (row.entity === "company" && !["legal_name", "name", "company_name", "business_name"].some(k => typeof row.values[k] === "string" && /[a-zA-ZÀ-ÿ]/.test(String(row.values[k])) && String(row.values[k]).length >= 3))
      return fail("empresa sin razón social verificable.");
    if (row.entity === "invoice" && (typeof row.values.invoice_number !== "string" || typeof row.values.total_amount !== "number"))
      return fail("factura sin número o total verificados.");
    ids.add(row.id);
    rows.push(row);
  }
  const byId = new Map(rows.map(r => [r.id, r]));
  const relations = new Map(schema.proposal.relations.map(r => [r.key, r]));
  const links: EngineBatchLink[] = [];
  for (const item of raw.links) {
    if (!object(item) || typeof item.relationKey !== "string" || typeof item.from !== "string" ||
      typeof item.to !== "string" || typeof item.documentId !== "string" || typeof item.evidence !== "string")
      return fail("relación concreta inválida.");
    const link = item as EngineBatchLink;
    const from = byId.get(link.from), to = byId.get(link.to), definition = relations.get(link.relationKey);
    const source = sources.get(link.documentId);
    if (!from || !to || !definition || definition.fromEntity !== from.entity || definition.toEntity !== to.entity ||
      !source || !link.evidence.trim() || link.evidence.length > 12000 || !source.extracted_text.includes(link.evidence) ||
      from.documentId !== link.documentId || to.documentId !== link.documentId ||
      !from.identityFields.some(k => normalizedIdentity(link.evidence).includes(normalizedIdentity(from.values[k]))) ||
      !to.identityFields.some(k => normalizedIdentity(link.evidence).includes(normalizedIdentity(to.values[k]))))
      return fail("relación sin evidencia de ambos extremos.");
    links.push(link);
  }
  for (const row of rows) {
    if (row.identityParent !== undefined && (typeof row.identityParent !== "string" || !byId.has(row.identityParent) ||
      !links.some(l => (l.from === row.id && l.to === row.identityParent) || (l.to === row.id && l.from === row.identityParent))))
      return fail("identidad dependiente sin relación con su padre.");
    const seen = new Set<string>([row.id]);
    let parent = row.identityParent;
    while (parent) {
      if (seen.has(parent))
        return fail("ciclo en la identidad de registros.");
      seen.add(parent);
      parent = byId.get(parent)?.identityParent;
    }
    if (/(?:^|_)(line|linea|item|detail)$/.test(row.entity) && !row.identityParent)
      return fail("la identidad de un detalle debe incluir el documento padre.");
  }
  for (const row of rows.filter(r => r.entity === "invoice")) {
    for (const role of ["invoice_issuer", "invoice_customer"]) {
      const matches = links.filter(l => l.to === row.id && l.relationKey === role && byId.get(l.from)?.entity === "company" && relations.get(role)?.cardinality === "one_to_many");
      if (matches.length !== 1)
        return fail("la factura requiere una empresa verificada para " + role);
    }
    const parties = links.filter(l => l.to === row.id && ["invoice_issuer", "invoice_customer"].includes(l.relationKey));
    if (batchRowIdentity(byId.get(parties[0].from)!) === batchRowIdentity(byId.get(parties[1].from)!))
      return fail("emisor y cliente coinciden; requiere revisión.");
  }
  const metadata = normalizedIdentity([
    ...schema.proposal.entities.flatMap(entity => [
      entity.key, entity.name, entity.description,
      ...entity.fields.flatMap(field => [field.key, field.name]),
    ]),
    ...schema.proposal.relations.flatMap(relation => [relation.key, relation.description]),
  ].join(" "));
  for(const row of rows){
    for(const value of Object.values(row.values)){
      const privateValue=normalizedIdentity(value);
      const companyNameTokens = row.entity === "company" && typeof value === "string"
        ? value.normalize("NFKC").toLocaleUpperCase("es").split(/[^\p{L}\p{N}]+/u)
          .map(normalizedIdentity).filter(token => token.length >= 4)
        : [];
      if(typeof value==="string" &&
        ((privateValue.length>=8 && metadata.includes(privateValue)) ||
          companyNameTokens.some(token => metadata.includes(token))))
        return fail("las definiciones reutilizables no pueden contener nombres o identificadores privados.");
    }
  }
  return { kind: "knowledge_relational_import_v1", schema: schema.proposal, rows, links, sourceFingerprint: raw.sourceFingerprint };
}
