import { Prisma } from "@prisma/client";

type VerifiedInvoice = {
  values: Record<string, string | number>;
  evidence: Record<string, string>;
  calculations?: Record<string, { operation: "sum"; operands: number[] }>;
};
export type InvoicePreviewField = { field: string; value: string | number | boolean; evidence: string };
export type InvoicePreviewConflict = {
  field: string; current: string | number | boolean; extracted: string | number | boolean;
};
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const norm = (s: string) =>
  s.normalize("NFKC").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();

/** PostgreSQL jsonb may reorder object keys; equality and hashes must not depend on key order. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    isObject(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      : nested,
  );
}
/** Existing trusted values always win; reanalysis only fills genuinely blank fields. */
export function invoiceMissingFields(
  existing: unknown, incoming: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const before = isObject(existing) ? existing : {};
  return Object.fromEntries(Object.entries(incoming).filter(([key]) =>
    before[key] === undefined || before[key] === null || before[key] === ""));
}

/** Exact proposal delta: only absent fields can change; other discrepancies are not overwritten. */
export function previewInvoiceFieldDelta(
  existing: unknown, row: { values: Record<string,string|number|boolean>; evidence: Record<string,string> },
): { addedFields: InvoicePreviewField[]; conflictingFields: InvoicePreviewConflict[] } {
  if (!isObject(existing)) return { addedFields: [], conflictingFields: [] };
  const additions = invoiceMissingFields(existing, row.values);
  const addedFields = Object.entries(additions).map(([field, value]) => ({
    field, value, evidence: row.evidence[field] ?? "",
  }));
  const conflictingFields: InvoicePreviewConflict[] = [];
  for (const [field, extracted] of Object.entries(row.values)) {
    const current = existing[field];
    if (current === undefined || current === null || current === "") continue;
    if ((typeof current === "string" || typeof current === "number" || typeof current === "boolean") &&
        stableJson(current) !== stableJson(extracted)) {
      conflictingFields.push({ field, current, extracted });
    }
  }
  return { addedFields, conflictingFields };
}
/**
 * The DB may already capture a revision via its trigger when engine_records
 * changes. Reuse and verify that snapshot instead of inserting it twice.
 * For databases without that trigger, create it once (idempotently).
 */
export async function ensureInvoiceRevisionSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    recordId: string;
    objectTypeId: string;
    revision: number;
    schemaVersion: number;
    status: string;
    values: Record<string, unknown>;
    userId: string;
  },
) {
  const where = {
    workspace_id: input.workspaceId,
    record_id: input.recordId,
    revision: input.revision,
  };
  let snapshot = await tx.engine_record_revisions.findFirst({
    where,
    select: { values_json: true, schema_version: true, status: true },
  });
  if (!snapshot) {
    // Only write if no revision exists; skipDuplicates covers concurrent
    // trigger/insert scenarios without swallowing a mismatched snapshot.
    await tx.engine_record_revisions.createMany({
      data: [{
        workspace_id: input.workspaceId,
        record_id: input.recordId,
        object_type_id: input.objectTypeId,
        revision: input.revision,
        schema_version: input.schemaVersion,
        status: input.status,
        values_json: input.values as Prisma.InputJsonObject,
        changed_by_user_id: input.userId,
      }],
      skipDuplicates: true,
    });
    snapshot = await tx.engine_record_revisions.findFirst({
      where,
      select: { values_json: true, schema_version: true, status: true },
    });
  }
  if (!snapshot || snapshot.schema_version !== input.schemaVersion ||
      snapshot.status !== input.status ||
      stableJson(snapshot.values_json) !== stableJson(input.values)) {
    throw new Error("La revisión de Engine no coincide con el registro. Operación cancelada.");
  }
}

function decimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/[\s€$]/g, "");
  if (!/^-?\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1)
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastComma > -1) s = s.replace(",", ".");
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function supportedDecimal(value: number, quote: string) {
  return (quote.match(/-?\d[\d.,]*/g) ?? []).some(token => {
    const n = decimal(token);
    return n !== null && Math.abs(n - value) < 0.005;
  });
}
function validDate(value: string, quote: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const [y, m, d] = value.split("-");
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const monthName = monthNames[Number(m) - 1];
  const alternatives = [value, d + "-" + m + "-" + y,
    d + "/" + m + "/" + y, d + "." + m + "." + y,
    String(Number(d)) + "/" + m + "/" + y,
    d + " de " + monthName + " de " + y,
    String(Number(d)) + " de " + monthName + " de " + y];
  return alternatives.some(candidate => norm(quote).includes(norm(candidate)));
}
function checkedSum(
  field: string, amount: number, quote: string, calculation: unknown,
) {
  if ((field !== "net_amount" && field !== "tax_amount") ||
      !isObject(calculation) || calculation.operation !== "sum" ||
      !Array.isArray(calculation.operands) || calculation.operands.length < 2 ||
      calculation.operands.length > 8 ||
      !/(IVA|BASE|CUOTA|IMPUEST|DETALLE|SUBTOTAL)/i.test(quote)) return false;
  const operands = calculation.operands.map(decimal);
  if (operands.some(x => x === null)) return false;
  const sum = (operands as number[]).reduce((x, y) => x + Math.round(y * 100), 0);
  if (Math.abs(sum - Math.round(amount * 100)) > 1) return false;
  // Count each quoted operand only once; repeating one number in calculations
  // cannot be used to fabricate an amount.
  const tokens = (quote.match(/-?\d[\d.,]*/g) ?? []).map(decimal);
  const unused = [...tokens];
  return operands.every(operand => {
    const index = unused.findIndex(n => n !== null && Math.abs(n - operand!) < 0.005);
    if (index < 0) return false;
    unused.splice(index, 1);
    return true;
  });
}
/**
 * Validates each extracted value against verbatim source evidence.
 * Partial mode validates individual fields in a relational batch.
 * Final plans and new inserts must still have a verifiable invoice identity.
 */
export function checkedInvoice(
  raw: unknown, text: string, fields: Map<string, string>,
  options: { allowPartial?: boolean } = {},
) {
  if (!isObject(raw) || !isObject(raw.values) || !isObject(raw.evidence))
    throw new Error("La extracción de factura no contiene un JSON verificable.");
  const values: VerifiedInvoice["values"] = {};
  const evidence: VerifiedInvoice["evidence"] = {};
  const calculations: NonNullable<VerifiedInvoice["calculations"]> = {};
  const normalizedText = norm(text);
  // Field keys are schema identities. Accept only mechanically equivalent
  // formatting (camelCase, snake_case, hyphens); never guess different meanings.
  const canonicalByShape = new Map([...fields.keys()].map(key =>
    [key.replace(/[^a-z0-9]/gi, "").toLowerCase(), key]));
  for (const [rawKey, value] of Object.entries(raw.values)) {
    const key = fields.has(rawKey) ? rawKey :
      canonicalByShape.get(rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase());
    if (!key || values[key] !== undefined) continue;
    const fieldType = fields.get(key);
    const quote = raw.evidence[rawKey] ?? raw.evidence[key];
    if (!fieldType || typeof quote !== "string" || !quote.trim() ||
      quote.length > 500 || !normalizedText.includes(norm(quote))) continue;
    if (fieldType === "decimal") {
      const parsed = decimal(value);
      if (parsed === null) continue;
      const calculation = isObject(raw.calculations) ? raw.calculations[key] : undefined;
      const direct = supportedDecimal(parsed, quote);
      if (!direct && !checkedSum(key, parsed, quote, calculation)) continue;
      if (!direct && isObject(calculation) && Array.isArray(calculation.operands)) {
        calculations[key] = { operation: "sum", operands: calculation.operands as number[] };
      }
      values[key] = parsed;
    } else if (fieldType === "date") {
      if (typeof value !== "string" || !validDate(value, quote)) continue;
      values[key] = value;
    } else if ((fieldType === "text" || fieldType === "long_text") &&
        typeof value === "string" && value.trim().length > 0 && value.length <= 1000) {
      if (key === "invoice_number" && !norm(quote).includes(norm(value))) continue;
      values[key] = value.trim();
    } else continue;
    evidence[key] = quote;
  }
  if (!options.allowPartial &&
      (typeof values.invoice_number !== "string" || typeof values.total_amount !== "number"))
    throw new Error("No se pudo verificar el número y el importe total de la factura.");
  return { values, evidence, ...(Object.keys(calculations).length ? { calculations } : {}) };
}
