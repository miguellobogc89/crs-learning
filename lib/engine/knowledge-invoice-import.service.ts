import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getKnowledgeImportModel, getOpenAIClient } from "@/lib/ai/openai";
import { prisma } from "@/lib/prisma";
import { validateEngineRecordValues } from "@/lib/engine/validation";
import type { KnowledgeImportProposal, KnowledgeImportCreatedDocumentLog, KnowledgeImportSkippedDocumentLog, KnowledgeImportExecutionLog } from "@/lib/knowledge/import/types";

export type InvoiceImportRow = {
  fileId: string;
  fileName: string;
  externalKey: string;
  action: "insert" | "update" | "reuse";
  values: Record<string, string | number>;
  evidence: Record<string, string>;
  calculations?: Record<string, { operation: "sum"; operands: number[] }>;
};
export type InvoicePreviewField = { field: string; value: string | number; evidence: string };
export type InvoicePreviewConflict = {
  field: string; current: string | number | boolean; extracted: string | number;
};
export type InvoiceImportFailure = { fileId: string; fileName: string; reason: string };
export type InvoiceImportPreview = {
  status: "ready" | "not_applicable";
  planId: string | null;
  recordsToInsert: number;
  recordsToUpdate: number;
  recordsToReuse: number;
  failures: InvoiceImportFailure[];
  invoices: Array<Pick<InvoiceImportRow, "fileId" | "fileName" | "action" | "values"> & {
    addedFields: InvoicePreviewField[];
    conflictingFields: InvoicePreviewConflict[];
  }>;
  otherStructuredCandidates: number;
};
type InvoicePlan = {
  kind: "catalog_invoice_import_v1";
  catalogTypeId: string;
  catalogVersion: number;
  documents: InvoiceImportRow[];
  failedFiles?: InvoiceImportFailure[];
};
type StagingFile = {
  id: string; file_name: string; status: string;
  content_hash: string | null; extracted_text: string;
};
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const norm = (s: string) =>
  s.normalize("NFKC").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

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
  existing: unknown, incoming: Record<string, string | number>,
): Record<string, string | number> {
  const before = isObject(existing) ? existing : {};
  return Object.fromEntries(Object.entries(incoming).filter(([key]) =>
    before[key] === undefined || before[key] === null || before[key] === ""));
}

/** Exact proposal delta: only absent fields can change; other discrepancies are not overwritten. */
export function previewInvoiceFieldDelta(
  existing: unknown, row: Pick<InvoiceImportRow, "values" | "evidence">,
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

const externalKeyForFile = (f: StagingFile) =>
  "invoice:" + sha256(f.content_hash || f.extracted_text);

/** Only a single independently classified commercial invoice per PDF. */
export function invoiceFileIds(proposal: KnowledgeImportProposal, files: StagingFile[]) {
  return files.filter(file => {
    const route = proposal.documentRoutes?.[file.id];
    const docs = proposal.globalImportMap?.documents.filter(doc => doc.fileId === file.id) ?? [];
    return !!route && !route.articleCandidate && route.structuredCandidate &&
      docs.length === 1 &&
      /\bfactur(?:a|as|ación|acion)\b/i.test(docs[0].type + " " + docs[0].title + " " + docs[0].category) &&
      /\bfactura\b/i.test(file.extracted_text);
  }).map(file => file.id);
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
const INVOICE_FIELDS = new Map<string, string>([
  ["invoice_number", "text"], ["issue_date", "date"], ["due_date", "date"],
  ["currency", "text"], ["net_amount", "decimal"], ["tax_amount", "decimal"],
  ["total_amount", "decimal"], ["payment_method", "text"], ["payment_terms", "text"],
  ["reference", "text"],
  ["notes", "long_text"],
]);
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
 * Partial mode is used during extraction, before an independent recovery pass.
 * Final plans and new inserts must still have a verifiable invoice identity.
 */
export function checkedInvoice(
  raw: unknown, text: string, fields: Map<string, string>,
  options: { allowPartial?: boolean } = {},
) {
  if (!isObject(raw) || !isObject(raw.values) || !isObject(raw.evidence))
    throw new Error("La extracción de factura no contiene un JSON verificable.");
  const values: InvoiceImportRow["values"] = {};
  const evidence: InvoiceImportRow["evidence"] = {};
  const calculations: NonNullable<InvoiceImportRow["calculations"]> = {};
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
type PriorInvoiceIdentity = {
  values: unknown;
  evidence: Record<string, string>;
};

/**
 * An identical file (same SHA-derived external key) already has a confirmed
 * identity in Engine. Reuse the two original, source-backed identity fields
 * rather than treating a model omission on re-analysis as a new defect.
 * Re-check all historical quotes against the uploaded text: no blind copying.
 */
export function recoverInvoiceIdentity(
  partial: ReturnType<typeof checkedInvoice>,
  previous: PriorInvoiceIdentity | null,
  text: string,
  fields: Map<string, string>,
) {
  if (!previous || !isObject(previous.values)) return partial;
  const values: Record<string, string | number> = { ...partial.values };
  const evidence: Record<string, string> = { ...partial.evidence };
  for (const key of ["invoice_number", "total_amount"]) {
    if (values[key] !== undefined || typeof previous.evidence[key] !== "string") continue;
    const stored = previous.values[key];
    if (typeof stored !== "number" && typeof stored !== "string") continue;
    values[key] = stored;
    evidence[key] = previous.evidence[key];
  }
  return checkedInvoice({
    values, evidence, calculations: partial.calculations,
  }, text, fields, { allowPartial: true });
}

/**
 * Last-resort source-backed anchor recovery for invariant document identity.
 * Uses field labels rather than supplier-specific templates or LLM inferences.
 * Only exact excerpts returned from the original text can be accepted.
 */
export function recoverDocumentInvoiceAnchors(
  partial: ReturnType<typeof checkedInvoice>,
  text: string,
  fields: Map<string, string>,
) {
  const values = { ...partial.values };
  const evidence = { ...partial.evidence };
  const lines = text.split(/\r?\n/);
  const identityLabel = /(?:n[º°]\s*factura|n[uú]mero\s*(?:de\s*)?factura|factura\s*(?:n[º°]|n[uú]m(?:ero)?\.?|n[uú]mero)|invoice\s*(?:number|no\.?|#))\s*:?/i;
  const totalLabel = /(?:total\s*(?:de\s*)?factura|total\s*a\s*pagar|importe\s*total|invoice\s*total)\s*:?/i;
  const candidates: Array<{key: "invoice_number" | "total_amount"; value: string | number; quote: string}> = [];
  for (const line of lines) {
    // Fragments longer than the evidence cap are unsafe: never truncate
    // the source quote without checking where its evidence is located.
    const numberLabel = line.match(identityLabel);
    if (numberLabel && fields.has("invoice_number")) {
      const suffix = line.slice(numberLabel.index! + numberLabel[0].length).trim();
      const tokens = suffix.match(/^([A-Z0-9][\w./-]*)(?:\s+([A-Z0-9][\w./-]*))?/i);
      if (tokens) {
        let number = tokens[1].replace(/[.,;:]$/, "");
        if (!/\d/.test(number) && tokens[2] && /\d/.test(tokens[2]))
          number += " " + tokens[2].replace(/[.,;:]$/, "");
        if (/\d/.test(number) && number.length >= 3) {
          const quote = line.slice(Math.max(0, numberLabel.index! - 10),
            numberLabel.index! + 450).trim();
          candidates.push({ key: "invoice_number", value: number, quote });
        }
      }
    }
    const totalMatch = line.match(totalLabel);
    if (totalMatch && fields.has("total_amount")) {
      const suffix = line.slice(totalMatch.index! + totalMatch[0].length);
      const amount = suffix.match(/^\s*[:=-]?\s*(\d[\d., ]{0,20})\s*€?/);
      if (amount) {
        const parsed = decimal(amount[1]);
        if (parsed !== null && parsed >= 0) {
          const quote = line.slice(Math.max(0, totalMatch.index! - 10),
            totalMatch.index! + 450).trim();
          candidates.push({ key: "total_amount", value: parsed, quote });
        }
      }
    }
  }
  for (const key of ["invoice_number", "total_amount"] as const) {
    if (values[key] !== undefined) continue;
    const options = candidates.filter(c => c.key === key);
    // Conflicting totals or identifiers must not be guessed away.
    const distinct = new Set(options.map(c => stableJson(c.value)));
    if (distinct.size !== 1) continue;
    values[key] = options[0].value;
    evidence[key] = options[0].quote;
  }
  return checkedInvoice({ values, evidence, calculations: partial.calculations },
    text, fields, { allowPartial: true });
}

type CatalogInvoiceField = {
  key: string; name: string; field_type: string;
  description: string | null; is_required: boolean;
};

async function extract(
  file: StagingFile,
  fields: Map<string, string>,
  catalogFields: CatalogInvoiceField[],
  previous: PriorInvoiceIdentity | null,
) {
  if (!file.extracted_text || file.extracted_text.length > 50000)
    throw new Error("Texto de factura ausente o demasiado grande: " + file.file_name);
  let first = checkedInvoice({ values: {}, evidence: {} },
    file.extracted_text, fields, { allowPartial: true });
  try {
    const response = await getOpenAIClient().responses.create({
    model: getKnowledgeImportModel(),
    instructions: [
      "Devuelve solo un objeto JSON con values, evidence y opcionalmente calculations (diccionarios).",
      "Extrae UNA factura comercial. Usa solo las claves del catálogo incluido en el input.",
      "Cada valor debe tener una cita breve LITERAL del documento en evidence con la misma clave.",
      "Extrae número, fecha de emisión, base imponible, cuota de IVA y total, si constan.",
      "Usa el nombre y la descripción de cada campo del catálogo para decidir su significado.",
      "No confundas dos campos diferentes por compartir palabras ni por la posición de su etiqueta.",
      "Un medio de pago y un plazo de pago son conceptos distintos; asocia cada uno al campo descrito en el catálogo.",
      "La fecha puede estar escrita en español, por ejemplo 04 de Agosto de 2026; conviértela a YYYY-MM-DD.",
      "Base imponible puede aparecer como subtotal o base sujeta; cuota IVA como impuesto o cuota tributaria.",
      "Si la factura muestra bases o cuotas desglosadas por varios tipos de IVA sin suma explícita, puedes sumar únicamente esos componentes.",
      "Para esas sumas, values tendrá el total numérico, evidence una cita LITERAL de las filas del desglose y calculations el campo con {operation: 'sum', operands: [cantidades originales]}.",
      "No confundas totales de líneas con bases globales. Comprueba que base más IVA cuadra con el total.",
      "Importes como número decimal; fechas como YYYY-MM-DD; nunca inventes cifras ni calcules sin desglose acreditado.",
      "No uses el nombre del archivo como evidencia.",
      "El número de factura y total deben estar presentes con citas verificables.",
      "Devuelve solo JSON válido, sin markdown."
    ].join("\n"),
    input: JSON.stringify({
      task: "Extract invoice fields to JSON values and evidence.",
      fields: catalogFields, text: file.extracted_text,
    }),
    text: { format: { type: "json_object" } },
  }, { timeout: 60000, maxRetries: 0 });
    if (response.status !== "completed" || !response.output_text ||
        response.output_text.length > 18000)
      throw new Error("La lectura inicial de IA fue incompleta.");
    first = checkedInvoice(JSON.parse(response.output_text), file.extracted_text,
      fields, { allowPartial: true });
  } catch (error) {
    // The source PDF still contains evidence: a model failure cannot prevent
    // using the independently verifiable anchors or a targeted second pass.
    console.warn("[engine-invoices] Initial extraction incomplete; attempting source recovery", {
      file: file.file_name,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
  let verified = recoverInvoiceIdentity(first, previous, file.extracted_text, fields);
  verified = recoverDocumentInvoiceAnchors(verified, file.extracted_text, fields);
  const core = ["invoice_number", "total_amount"];
  const missing = [...new Set([...core, "issue_date", "net_amount", "tax_amount", "payment_method"])]
    .filter(key => fields.has(key) && verified.values[key] === undefined);
  if (!missing.length) return checkedInvoice({
    values: verified.values, evidence: verified.evidence, calculations: verified.calculations,
  }, file.extracted_text, fields);
  // Bounded second pass: models often overlook a date written in words or
  // VAT bases split across table rows. No change may bypass source validation.
  try {
    const second = await getOpenAIClient().responses.create({
      model: getKnowledgeImportModel(),
      instructions: [
        "Devuelve exclusivamente JSON con values, evidence y opcionalmente calculations.",
        "Busca SOLO los campos ausentes indicados. No cambies los datos ya verificados.",
        "Cita literalmente un único fragmento contiguo del texto original por campo.",
        "Para fecha en palabras usa YYYY-MM-DD y la fecha original en evidence.",
        "Si base imponible o IVA son suma de varios conceptos de la tabla tributaria,",
        "usa calculations: {nombre_campo: {operation: 'sum', operands: [n1, n2]}}.",
        "Los operandos deben aparecer exactamente en la cita literal de evidence.",
        "Distingue total de factura y totales parciales de tickets o líneas.",
        "Cada campo tiene un significado propio definido en su nombre y descripción de catálogo.",
        "No deduzcas un plazo de pago a partir de un medio de pago, ni al revés.",
        "Omite valores sin evidencia suficiente; no inventes ni estimes."
      ].join("\n"),
      input: JSON.stringify({
        task: "Complete missing verified fields only.",
        missing, verified: verified.values,
        fields: catalogFields.filter(field => missing.includes(field.key)),
        text: file.extracted_text,
      }),
      text: { format: { type: "json_object" } },
    }, { timeout: 45000, maxRetries: 0 });
    if (second.status !== "completed" || !second.output_text || second.output_text.length > 18000)
      throw new Error("La segunda lectura no devolvió un resultado completo.");
    const raw: unknown = JSON.parse(second.output_text);
    if (!isObject(raw) || !isObject(raw.values) || !isObject(raw.evidence))
      throw new Error("La segunda lectura no devolvió valores y evidencias válidos.");
    const retryValues = raw.values;
    const retryEvidence = raw.evidence;
    const retryCalculations = isObject(raw.calculations) ? raw.calculations : {};
    const additions = Object.fromEntries(missing
      .filter(key => key in retryValues && key in retryEvidence)
      .map(key => [key, retryValues[key]]));
    const quotes = Object.fromEntries(missing
      .filter(key => key in additions).map(key => [key, retryEvidence[key]]));
    const calculations = Object.fromEntries(missing
      .filter(key => key in additions && key in retryCalculations)
      .map(key => [key, retryCalculations[key]]));
    const enriched = checkedInvoice({
      values: { ...verified.values, ...additions },
      evidence: { ...verified.evidence, ...quotes },
      calculations: { ...verified.calculations, ...calculations },
    }, file.extracted_text, fields, { allowPartial: true });
    verified = recoverInvoiceIdentity(enriched, previous, file.extracted_text, fields);
    verified = recoverDocumentInvoiceAnchors(verified, file.extracted_text, fields);
  } catch (error) {
    // Optional fields are best effort. Missing essentials still fail below.
    console.warn("[engine-invoices] Unable to complete extracted fields", {
      file: file.file_name, missing,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
  try {
    return checkedInvoice({
      values: verified.values, evidence: verified.evidence, calculations: verified.calculations,
    }, file.extracted_text, fields);
  } catch {
    throw new Error(
      "No se pudo verificar la identidad de " + file.file_name +
      " tras dos lecturas; faltan " +
      core.filter(key => verified.values[key] === undefined).join(", ") + ".",
    );
  }
}
export async function previewKnowledgeInvoices(input: {
  importId: string; userId: string; workspaceId: string;
}): Promise<InvoiceImportPreview> {
  const imported = await prisma.knowledge_imports.findFirst({
    where: { id: input.importId, owner_user_id: input.userId, status: "proposal_ready",
      knowledge_libraries: { workspace_id: input.workspaceId } },
    select: { proposal_json: true, knowledge_import_files: {
      select: { id: true, file_name: true, status: true, content_hash: true, extracted_text: true },
    } },
  });
  if (!imported || !isObject(imported.proposal_json))
    throw new Error("La propuesta no está disponible para Engine.");
  const proposal = imported.proposal_json as unknown as KnowledgeImportProposal;
  const ids = invoiceFileIds(proposal, imported.knowledge_import_files);
  const otherStructuredCandidates = Object.entries(proposal.documentRoutes ?? {})
    .filter(([id, route]) => route.structuredCandidate && !ids.includes(id)).length;
  if (!ids.length) return { status: "not_applicable", planId: null,
    recordsToInsert: 0, recordsToUpdate: 0, recordsToReuse: 0,
    invoices: [], failures: [], otherStructuredCandidates };
  if (ids.length > 12) throw new Error("Máximo 12 facturas por confirmación.");
  const ws = await prisma.workspaces.findFirst({
    where: { id: input.workspaceId, status: "active" },
    select: { owner_user_id: true, workspace_members: {
      where: { user_id: input.userId, status: "active" }, select: { role: true },
    } },
  });
  if (!ws || (ws.owner_user_id !== input.userId &&
      !["owner", "admin"].includes(ws.workspace_members[0]?.role ?? "")))
    throw new Error("Necesitas permisos de administrador para insertar registros de Engine.");
  const catalog = await prisma.engine_catalog_types.findUnique({
    where: { key: "invoice" },
    include: { engine_catalog_type_versions: {
      where: { status: "published" },
      orderBy: { version: "desc" },
      take: 1,
      include: { engine_catalog_fields: { where: { status: "active" } } },
    } },
  });
  const version = catalog?.engine_catalog_type_versions[0];
  if (!catalog || catalog.status !== "active" || !version || !version.engine_catalog_fields.length)
    throw new Error("No existe el catálogo global de facturas en Neon.");
  const fields = new Map(version.engine_catalog_fields.map(f => [f.key, f.field_type]));
  if (version.version < 2 || fields.get("payment_method") !== "text")
    throw new Error("Falta publicar el catálogo de facturas v2 con payment_method en Neon.");
  const files = ids.map(id => imported.knowledge_import_files.find(f => f.id === id)!);
  if (files.some(f => f.status !== "text_ready"))
    throw new Error("Alguna factura no tiene el texto preparado.");
  const local = await prisma.engine_object_types.findUnique({
    where: { workspace_id_key: { workspace_id: input.workspaceId, key: "invoice" } },
    select: { id: true },
  });
  const priorRecords = local ? await prisma.engine_records.findMany({
    where: {
      workspace_id: input.workspaceId, object_type_id: local.id,
      external_key: { in: files.map(externalKeyForFile) },
    },
    select: {
      external_key: true, values_json: true,
      engine_record_provenance: {
        where: { field_key: { in: ["invoice_number", "total_amount"] } },
        orderBy: { revision: "desc" },
        select: { field_key: true, evidence_text: true },
      },
    },
  }) : [];
  const existing = new Map(priorRecords.filter(r => !!r.external_key)
    .map(r => [r.external_key, {
      values: r.values_json,
      evidence: Object.fromEntries(r.engine_record_provenance
        .filter(p => p.field_key && p.evidence_text)
        .map(p => [p.field_key!, p.evidence_text!])),
    }]));
  // Group identical content before extraction. Different filenames can point to
  // byte-identical documents; never ask the model to re-read a duplicate.
  const groups = new Map<string, StagingFile[]>();
  for (const file of files) {
    const key = externalKeyForFile(file);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  const rows: InvoiceImportRow[] = [];
  const failures: InvoiceImportFailure[] = [];
  const deltaByFileId = new Map<string, ReturnType<typeof previewInvoiceFieldDelta>>();
  const catalogFields = version.engine_catalog_fields.map(f => ({
    key: f.key, name: f.name, field_type: f.field_type,
    description: f.description, is_required: f.is_required,
  }));
  const uniqueGroups = [...groups.entries()];

  // Bound concurrent model calls to avoid serial timeouts on longer batches.
  for (let offset = 0; offset < uniqueGroups.length; offset += 3) {
    const results = await Promise.all(uniqueGroups.slice(offset, offset + 3)
      .map(async ([externalKey, siblings]) => {
        const file = siblings[0];
        try {
          const prior = existing.get(externalKey);
          const extracted = await extract(file, fields, catalogFields, prior ?? null);
          const delta = previewInvoiceFieldDelta(prior?.values, extracted);
          const firstAction: InvoiceImportRow["action"] = !prior ? "insert"
            : delta.addedFields.length ? "update" : "reuse";
          const planned: Array<{
            row: InvoiceImportRow;
            delta: ReturnType<typeof previewInvoiceFieldDelta>;
          }> = siblings.map((f, index) => ({
            row: {
              fileId: f.id, fileName: f.file_name, externalKey,
              action: index === 0 ? firstAction : "reuse",
              ...extracted,
            },
            delta: index === 0 ? delta :
              { addedFields: [], conflictingFields: [] },
          }));
          return { planned, failed: [] as InvoiceImportFailure[] };
        } catch (error) {
          // Do not discard eight valid documents because one is unreadable.
          const reason = error instanceof Error ? error.message : "Error de extracción no identificado";
          console.warn("[engine-invoices] File excluded from batch proposal", {
            file: file.file_name, reason,
          });
          return {
            planned: [] as Array<{ row: InvoiceImportRow;
              delta: ReturnType<typeof previewInvoiceFieldDelta> }>,
            failed: siblings.map(f => ({
              fileId: f.id, fileName: f.file_name, reason,
            })),
          };
        }
      }));
    for (const result of results) {
      failures.push(...result.failed);
      for (const { row, delta } of result.planned) {
        rows.push(row);
        deltaByFileId.set(row.fileId, delta);
      }
    }
  }
  if (rows.length === 0) {
    throw new Error("Ningún documento pudo verificarse para Engine: " +
      failures.slice(0, 3).map(f => f.fileName + ": " + f.reason).join(" | "));
  }
  const body: InvoicePlan = {
    kind: "catalog_invoice_import_v1", catalogTypeId: catalog.id,
    catalogVersion: version.version, documents: rows, failedFiles: failures,
  };
  const idempotencyKey = "knowledge-import:" + input.importId;
  const where = { workspace_id_idempotency_key: {
    workspace_id: input.workspaceId, idempotency_key: idempotencyKey,
  } };
  const prior = await prisma.engine_import_plans.findUnique({ where, select: { status: true } });
  if (prior?.status === "completed" || prior?.status === "committing")
    throw new Error("Este plan de Engine ya se ha confirmado.");
  const plan = await prisma.engine_import_plans.upsert({
    where,
    create: { workspace_id: input.workspaceId, created_by_user_id: input.userId,
      idempotency_key: idempotencyKey, status: "ready",
      source_json: { importId: input.importId, fileIds: ids },
      plan_json: body as unknown as Prisma.InputJsonObject,
      plan_hash: sha256(stableJson(body)),
      expires_at: new Date(Date.now() + 86400000) },
    update: { status: "ready", revision: { increment: 1 }, updated_at: new Date(),
      source_json: { importId: input.importId, fileIds: ids },
      plan_json: body as unknown as Prisma.InputJsonObject,
      plan_hash: sha256(stableJson(body)),
      expires_at: new Date(Date.now() + 86400000) },
    select: { id: true },
  });
  return {
    status: "ready", planId: plan.id,
    recordsToInsert: rows.filter(r => r.action === "insert").length,
    recordsToUpdate: rows.filter(r => r.action === "update").length,
    recordsToReuse: rows.filter(r => r.action === "reuse").length,
    failures,
    invoices: rows.map(({ fileId, fileName, action, values }) =>
      ({ fileId, fileName, action, values,
         ...(deltaByFileId.get(fileId) ?? { addedFields: [], conflictingFields: [] }),
      })),
    otherStructuredCandidates,
  };
}
export async function validatePreparedInvoicePlan(input: {
  importId: string; workspaceId: string; userId: string;
  proposal: KnowledgeImportProposal; files: StagingFile[];
}) {
  const ids = invoiceFileIds(input.proposal, input.files);
  if (!ids.length) return null;
  const plan = await prisma.engine_import_plans.findUnique({
    where: { workspace_id_idempotency_key: {
      workspace_id: input.workspaceId, idempotency_key: "knowledge-import:" + input.importId,
    } },
  });
  if (!plan || plan.status !== "ready" || plan.created_by_user_id !== input.userId ||
      (plan.expires_at && plan.expires_at <= new Date()))
    throw new Error("Primero debes completar la vista previa de facturas en Engine.");
  const source = plan.source_json;
  const data = plan.plan_json;
  // Narrow JSON arrays before using them in callbacks (Prisma.JsonValue is a union).
  const sourceFileIds = isObject(source) && Array.isArray(source.fileIds) ? source.fileIds : null;
  const documentRows = isObject(data) && Array.isArray(data.documents) ? data.documents : null;
  const failedFiles = isObject(data) && Array.isArray(data.failedFiles) ? data.failedFiles : [];
  const plannedIds = documentRows?.map((row: unknown) =>
    isObject(row) && typeof row.fileId === "string" ? row.fileId : null) ?? [];
  const failedIds = failedFiles.map((row: unknown) =>
    isObject(row) && typeof row.fileId === "string" ? row.fileId : null);
  const allIds = [...plannedIds, ...failedIds];
  if (!sourceFileIds || !documentRows || !isObject(source) ||
      source.importId !== input.importId || !isObject(data) ||
      data.kind !== "catalog_invoice_import_v1" ||
      documentRows.length === 0 || allIds.length !== ids.length ||
      new Set(allIds).size !== ids.length ||
      ids.some(id => !sourceFileIds.includes(id) || !allIds.includes(id)) ||
      sourceFileIds.length !== ids.length ||
      sha256(stableJson(data)) !== plan.plan_hash)
    throw new Error("La propuesta de Engine no coincide con los documentos.");
  for (const doc of documentRows) {
    if (!isObject(doc) || typeof doc.fileId !== "string" ||
        typeof doc.externalKey !== "string" || !isObject(doc.values) ||
        !isObject(doc.evidence)) throw new Error("Plan de facturas inválido.");
    const file = input.files.find(f => f.id === doc.fileId);
    if (!file || doc.externalKey !== externalKeyForFile(file))
      throw new Error("La factura cambió después del análisis.");
    const checked = checkedInvoice({
      values: doc.values, evidence: doc.evidence, calculations: doc.calculations,
    }, file.extracted_text, INVOICE_FIELDS);
    if (stableJson(checked.values) !== stableJson(doc.values))
      throw new Error("Los datos de la factura ya no superan la validación.");
  }
  return { planId: plan.id, plan: data as unknown as InvoicePlan };
}
export async function commitPreparedInvoices(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string; userId: string; importId: string;
    prepared: { planId: string; plan: InvoicePlan };
    documents: KnowledgeImportCreatedDocumentLog[];
    skippedDocuments: KnowledgeImportSkippedDocumentLog[];
  },
): Promise<NonNullable<KnowledgeImportExecutionLog["engineImports"]>> {
  const plan = await tx.engine_import_plans.findFirst({
    where: { id: input.prepared.planId, workspace_id: input.workspaceId, status: "ready" },
    select: { id: true, plan_hash: true, created_by_user_id: true, expires_at: true },
  });
  if (!plan || plan.created_by_user_id !== input.userId ||
      (plan.expires_at && plan.expires_at <= new Date()) ||
      plan.plan_hash !== sha256(stableJson(input.prepared.plan))) {
    throw new Error("La vista previa de Engine ha caducado o se ha modificado.");
  }
  // Preview permission is not sufficient: the commit rechecks membership.
  const ws = await tx.workspaces.findFirst({
    where: { id: input.workspaceId, status: "active" },
    select: { owner_user_id: true, workspace_members: {
      where: { user_id: input.userId, status: "active" }, select: { role: true },
    } },
  });
  if (!ws || (ws.owner_user_id !== input.userId &&
      !["owner", "admin"].includes(ws.workspace_members[0]?.role ?? ""))) {
    throw new Error("Ya no tienes permisos para insertar en Engine.");
  }
  const definition = await tx.engine_catalog_type_versions.findUnique({
    where: { type_id_version: {
      type_id: input.prepared.plan.catalogTypeId, version: input.prepared.plan.catalogVersion,
    } },
    include: { engine_catalog_fields: { where: { status: "active" }, orderBy: { sort_order: "asc" } } },
  });
  const catalog = await tx.engine_catalog_types.findUnique({
    where: { id: input.prepared.plan.catalogTypeId },
  });
  if (!definition || definition.status !== "published" ||
      !catalog || catalog.key !== "invoice" || catalog.status !== "active")
    throw new Error("El catálogo de facturas ya no es válido.");
  const workspaceId = input.workspaceId;
  // Prevent concurrent creation of the workspace invoice type or the same record.
  // pg_advisory_xact_lock returns PostgreSQL 'void', which Prisma cannot deserialize.
  // Invoke it in FROM but return only an integer from SELECT.
  // The lock remains held until this transaction commits or rolls back.
  await tx.$queryRaw<{ acquired: number }[]>(Prisma.sql`
    SELECT 1::integer AS acquired
    FROM pg_advisory_xact_lock(hashtext(${workspaceId}))
  `);
  let local = await tx.engine_object_types.findUnique({
    where: { workspace_id_key: { workspace_id: workspaceId, key: "invoice" } },
    include: { engine_field_definitions: true },
  });
  if (!local) {
    const created = await tx.engine_object_types.create({
      data: { workspace_id: workspaceId, key: "invoice", name: catalog.name,
        description: catalog.description },
    });
    await tx.engine_field_definitions.createMany({
      data: definition.engine_catalog_fields.map(f => ({
        workspace_id: workspaceId, object_type_id: created.id,
        key: f.key, name: f.name, field_type: f.field_type,
        sort_order: f.sort_order, is_required: f.is_required, is_unique: false,
        configuration: f.configuration as Prisma.InputJsonObject,
      })),
    });
    local = await tx.engine_object_types.findUniqueOrThrow({
      where: { id: created.id }, include: { engine_field_definitions: true },
    });
  }
  // A workspace bound to v1 may be missing the new optional v2 field.
  // Do not change existing field definitions or the local schema_version.
  const missingDefinitions = definition.engine_catalog_fields.filter(f =>
    !local!.engine_field_definitions.some(existing => existing.key === f.key));
  if (missingDefinitions.length) {
    if (missingDefinitions.some(f => f.key !== "payment_method" ||
        f.field_type !== "text" || f.is_required || f.is_unique)) {
      throw new Error("El catálogo nuevo requiere una migración de campos no compatible.");
    }
    await tx.engine_field_definitions.createMany({
      data: missingDefinitions.map(f => ({
        workspace_id: workspaceId, object_type_id: local!.id,
        key: f.key, name: f.name, field_type: f.field_type,
        sort_order: f.sort_order, is_required: false, is_unique: false,
        configuration: f.configuration as Prisma.InputJsonObject,
      })),
      skipDuplicates: true,
    });
    local = await tx.engine_object_types.findUniqueOrThrow({
      where: { id: local.id }, include: { engine_field_definitions: true },
    });
  }
  const localFields = new Map(local.engine_field_definitions
    .filter(f => f.status === "active").map(f => [f.key, f.field_type]));
  const catalogFields = new Map(definition.engine_catalog_fields.map(f => [f.key, f.field_type]));
  for (const doc of input.prepared.plan.documents) {
    for (const key of Object.keys(doc.values)) {
      if (!catalogFields.has(key) || localFields.get(key) !== catalogFields.get(key))
        throw new Error("El tipo invoice local no es compatible: " + key);
    }
  }
  const binding = await tx.engine_workspace_catalog_bindings.findUnique({
    where: { workspace_id_catalog_type_id: {
      workspace_id: workspaceId, catalog_type_id: catalog.id,
    } },
  });
  if (binding && (binding.local_object_type_id !== local.id ||
      binding.catalog_version > input.prepared.plan.catalogVersion))
    throw new Error("La versión de Factura del workspace necesita revisión.");
  if (!binding) await tx.engine_workspace_catalog_bindings.create({
    data: { workspace_id: workspaceId, catalog_type_id: catalog.id,
      catalog_version: input.prepared.plan.catalogVersion, local_object_type_id: local.id },
  });
  else if (binding.catalog_version < input.prepared.plan.catalogVersion) {
    // Only v1 -> v2 (the addition of an optional text field) is automatic.
    if (binding.catalog_version !== 1 || input.prepared.plan.catalogVersion !== 2)
      throw new Error("La actualización del catálogo necesita revisión.");
    await tx.engine_workspace_catalog_bindings.update({
      where: { id: binding.id },
      data: { catalog_version: 2, updated_at: new Date() },
    });
  }
  // Knowledge may skip storing a PDF already present in this workspace.
  // Reuse that exact original as the provenance of any newly recovered fields.
  const sourceById = new Map(input.documents.map(doc => [
    doc.importFileId, { knowledgeFileId: doc.knowledgeFileId, sourceId: doc.articleId },
  ]));
  const reuseIds = [...new Set(input.skippedDocuments
    .map(item => item.existingKnowledgeFileId).filter((id): id is string => !!id))];
  const reusedFiles = reuseIds.length ? await tx.knowledge_files.findMany({
    where: {
      id: { in: reuseIds },
      knowledge_sources: {
        owner_user_id: input.userId,
        knowledge_libraries: { workspace_id: workspaceId },
      },
    },
    select: { id: true, knowledge_source_id: true },
  }) : [];
  const reusedFileById = new Map(reusedFiles.map(file => [file.id, file]));
  for (const skipped of input.skippedDocuments) {
    if (skipped.existingKnowledgeFileId) {
      const reused = reusedFileById.get(skipped.existingKnowledgeFileId);
      if (reused) sourceById.set(skipped.importFileId, {
        knowledgeFileId: reused.id, sourceId: reused.knowledge_source_id,
      });
    } else if (skipped.duplicateImportFileId) {
      const withinBatch = sourceById.get(skipped.duplicateImportFileId);
      if (withinBatch) sourceById.set(skipped.importFileId, withinBatch);
    }
  }

  const outcomes: NonNullable<KnowledgeImportExecutionLog["engineImports"]> = [];
  for (const doc of input.prepared.plan.documents) {
    const source = sourceById.get(doc.fileId);
    const existing = await tx.engine_records.findFirst({
      where: { workspace_id: workspaceId, object_type_id: local.id,
        external_key: doc.externalKey },
      select: { id: true, status: true, values_json: true,
        revision: true, schema_version: true },
    });
    if (existing) {
      const additions = invoiceMissingFields(existing.values_json, doc.values);
      const keys = Object.keys(additions);
      if (!keys.length) {
        outcomes.push({
          knowledgeFileId: source?.knowledgeFileId ?? "", fileName: doc.fileName,
          status: "completed", recordsCreated: 0, recordsUpdated: 0,
          recordsReused: 1,
        });
        continue;
      }
      if (!source) throw new Error("No hay PDF original verificable para completar la factura " + doc.fileName);
      const merged = { ...(isObject(existing.values_json) ? existing.values_json : {}), ...additions };
      const validation = validateEngineRecordValues(merged, local.engine_field_definitions);
      if (!validation.ok) throw new Error("La factura completada no encaja en Engine: " + JSON.stringify(validation.issues));
      const updated = await tx.engine_records.update({
        where: { id: existing.id },
        data: { values_json: merged as Prisma.InputJsonObject,
          revision: { increment: 1 }, updated_by_user_id: input.userId,
          updated_at: new Date() },
        select: { revision: true },
      });
      await ensureInvoiceRevisionSnapshot(tx, {
        workspaceId,
        recordId: existing.id,
        objectTypeId: local.id,
        revision: updated.revision,
        schemaVersion: existing.schema_version,
        status: existing.status,
        values: merged,
        userId: input.userId,
      });
      for (const key of keys) {
        const quote = doc.evidence[key];
        if (!quote) throw new Error("Falta evidencia para el campo nuevo " + key);
        const calc = doc.calculations?.[key];
        await tx.engine_record_provenance.create({
          data: {
            workspace_id: workspaceId, record_id: existing.id,
            revision: updated.revision, field_key: key,
            source_locator: "knowledge-import:" + input.importId + "/file:" + doc.fileId,
            knowledge_file_id: source.knowledgeFileId,
            knowledge_source_id: source.sourceId,
            evidence_text: calc ? quote + " | suma: " + calc.operands.join(" + ") : quote,
            origin_type: "document", created_by_user_id: input.userId,
          },
        });
      }
      outcomes.push({
        knowledgeFileId: source.knowledgeFileId, fileName: doc.fileName,
        status: "completed", recordsCreated: 0, recordsUpdated: 1,
        recordsReused: 0, fieldsCompleted: keys.length,
      });
      continue;
    }

    if (!source) throw new Error("No hay PDF original verificable para crear la factura " + doc.fileName);
    const validation = validateEngineRecordValues(doc.values, local.engine_field_definitions);
    if (!validation.ok) throw new Error("Los campos de factura no encajan en Engine: " + JSON.stringify(validation.issues));
    const created = await tx.engine_records.create({
      data: { workspace_id: workspaceId, object_type_id: local.id,
        external_key: doc.externalKey, values_json: doc.values as Prisma.InputJsonObject,
        status: "draft", revision: 1, schema_version: local.schema_version,
        created_by_user_id: input.userId, updated_by_user_id: input.userId },
    });
    await ensureInvoiceRevisionSnapshot(tx, {
      workspaceId,
      recordId: created.id,
      objectTypeId: local.id,
      revision: created.revision,
      schemaVersion: local.schema_version,
      status: "draft",
      values: doc.values,
      userId: input.userId,
    });
    for (const [fieldKey, quote] of Object.entries(doc.evidence)) {
      const calc = doc.calculations?.[fieldKey];
      await tx.engine_record_provenance.create({
        data: {
          workspace_id: workspaceId, record_id: created.id, revision: created.revision,
          field_key: fieldKey,
          source_locator: "knowledge-import:" + input.importId + "/file:" + doc.fileId,
          knowledge_file_id: source.knowledgeFileId,
          knowledge_source_id: source.sourceId,
          evidence_text: calc ? quote + " | suma: " + calc.operands.join(" + ") : quote,
          origin_type: "document", created_by_user_id: input.userId,
        },
      });
    }
    outcomes.push({ knowledgeFileId: source.knowledgeFileId, fileName: doc.fileName,
      status: "completed", recordsCreated: 1, recordsUpdated: 0, recordsReused: 0 });
  }
  await tx.engine_import_plans.update({
    where: { id: plan.id },
    data: { status: "completed", reviewed_by_user_id: input.userId,
      committed_at: new Date(), result_json: { importId: input.importId, invoices: outcomes } },
  });
  return outcomes;
}
