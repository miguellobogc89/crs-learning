import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getKnowledgeImportModel, getOpenAIClient } from "@/lib/ai/openai";
import { prisma } from "@/lib/prisma";
import { validateEngineRecordValues } from "@/lib/engine/validation";
import type { KnowledgeImportProposal, KnowledgeImportCreatedDocumentLog, KnowledgeImportExecutionLog } from "@/lib/knowledge/import/types";

export type InvoiceImportRow = {
  fileId: string;
  fileName: string;
  externalKey: string;
  action: "insert" | "reuse";
  values: Record<string, string | number>;
  evidence: Record<string, string>;
};
export type InvoiceImportPreview = {
  status: "ready" | "not_applicable";
  planId: string | null;
  recordsToInsert: number;
  recordsToReuse: number;
  invoices: Array<Pick<InvoiceImportRow, "fileId" | "fileName" | "action" | "values">>;
  otherStructuredCandidates: number;
};
type InvoicePlan = {
  kind: "catalog_invoice_import_v1";
  catalogTypeId: string;
  catalogVersion: number;
  documents: InvoiceImportRow[];
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
  return [value, d + "-" + m + "-" + y, d + "/" + m + "/" + y, d + "." + m + "." + y]
    .some(candidate => quote.includes(candidate));
}
const INVOICE_FIELDS = new Map<string, string>([
  ["invoice_number", "text"], ["issue_date", "date"], ["due_date", "date"],
  ["currency", "text"], ["net_amount", "decimal"], ["tax_amount", "decimal"],
  ["total_amount", "decimal"], ["payment_terms", "text"], ["reference", "text"],
  ["notes", "long_text"],
]);
export function checkedInvoice(raw: unknown, text: string, fields: Map<string, string>) {
  if (!isObject(raw) || !isObject(raw.values) || !isObject(raw.evidence))
    throw new Error("La extracción de factura no contiene un JSON verificable.");
  const values: InvoiceImportRow["values"] = {};
  const evidence: InvoiceImportRow["evidence"] = {};
  const normalizedText = norm(text);
  for (const [key, value] of Object.entries(raw.values)) {
    const fieldType = fields.get(key);
    const quote = raw.evidence[key];
    if (!fieldType || typeof quote !== "string" || !quote.trim() ||
      quote.length > 500 || !normalizedText.includes(norm(quote))) continue;
    if (fieldType === "decimal") {
      const parsed = decimal(value);
      if (parsed === null || !supportedDecimal(parsed, quote)) continue;
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
  if (typeof values.invoice_number !== "string" || typeof values.total_amount !== "number")
    throw new Error("No se pudo verificar el número y el importe total de la factura.");
  return { values, evidence };
}
async function extract(file: StagingFile, fields: Map<string, string>) {
  if (!file.extracted_text || file.extracted_text.length > 50000)
    throw new Error("Texto de factura ausente o demasiado grande: " + file.file_name);
  const response = await getOpenAIClient().responses.create({
    model: getKnowledgeImportModel(),
    instructions: [
      "Devuelve solo un objeto JSON con values y evidence (diccionarios).",
      "Extrae UNA factura comercial. Usa solo las claves del catálogo incluido en el input.",
      "Cada valor debe tener una cita breve LITERAL del documento en evidence con la misma clave.",
      "Importes como número decimal; fechas como YYYY-MM-DD; no inventes datos ni calcules ausentes.",
      "No uses el nombre del archivo como evidencia.",
      "El número de factura y total deben estar presentes con citas verificables.",
      "Devuelve solo JSON válido, sin markdown."
    ].join("\n"),
    input: JSON.stringify({
      task: "Extract invoice fields to JSON values and evidence.",
      fields: Object.fromEntries(fields), text: file.extracted_text,
    }),
    text: { format: { type: "json_object" } },
  }, { timeout: 120000, maxRetries: 0 });
  if (response.status !== "completed" || !response.output_text || response.output_text.length > 18000)
    throw new Error("La IA no ha terminado de extraer " + file.file_name);
  let parsed: unknown;
  try { parsed = JSON.parse(response.output_text); }
  catch { throw new Error("JSON no válido para " + file.file_name); }
  return checkedInvoice(parsed, file.extracted_text, fields);
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
    recordsToInsert: 0, recordsToReuse: 0, invoices: [], otherStructuredCandidates };
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
      where: { version: 1, status: "published" },
      include: { engine_catalog_fields: { where: { status: "active" } } },
    } },
  });
  const version = catalog?.engine_catalog_type_versions[0];
  if (!catalog || catalog.status !== "active" || !version || !version.engine_catalog_fields.length)
    throw new Error("No existe el catálogo global de facturas en Neon.");
  const fields = new Map(version.engine_catalog_fields.map(f => [f.key, f.field_type]));
  const files = ids.map(id => imported.knowledge_import_files.find(f => f.id === id)!);
  if (files.some(f => f.status !== "text_ready"))
    throw new Error("Alguna factura no tiene el texto preparado.");
  const local = await prisma.engine_object_types.findUnique({
    where: { workspace_id_key: { workspace_id: input.workspaceId, key: "invoice" } },
    select: { id: true },
  });
  const priorKeys = local ? await prisma.engine_records.findMany({
    where: { workspace_id: input.workspaceId, object_type_id: local.id },
    select: { external_key: true },
  }) : [];
  const existing = new Set(priorKeys.map(r => r.external_key));
  const rows: InvoiceImportRow[] = [];
  for (const file of files) {
    const extracted = await extract(file, fields);
    const externalKey = externalKeyForFile(file);
    rows.push({ fileId: file.id, fileName: file.file_name, externalKey,
      action: existing.has(externalKey) ? "reuse" : "insert", ...extracted });
  }
  const body: InvoicePlan = {
    kind: "catalog_invoice_import_v1", catalogTypeId: catalog.id,
    catalogVersion: version.version, documents: rows,
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
      plan_hash: sha256(JSON.stringify(body)),
      expires_at: new Date(Date.now() + 86400000) },
    update: { status: "ready", revision: { increment: 1 }, updated_at: new Date(),
      source_json: { importId: input.importId, fileIds: ids },
      plan_json: body as unknown as Prisma.InputJsonObject,
      plan_hash: sha256(JSON.stringify(body)),
      expires_at: new Date(Date.now() + 86400000) },
    select: { id: true },
  });
  return {
    status: "ready", planId: plan.id,
    recordsToInsert: rows.filter(r => r.action === "insert").length,
    recordsToReuse: rows.filter(r => r.action === "reuse").length,
    invoices: rows.map(({ fileId, fileName, action, values }) =>
      ({ fileId, fileName, action, values })),
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
  if (!isObject(source) || source.importId !== input.importId ||
      !Array.isArray(source.fileIds) || !isObject(data) ||
      data.kind !== "catalog_invoice_import_v1" || !Array.isArray(data.documents) ||
      data.documents.length !== ids.length ||
      ids.some(id => !source.fileIds.includes(id) ||
        !data.documents.some((row: unknown) => isObject(row) && row.fileId === id)) ||
      sha256(JSON.stringify(data)) !== plan.plan_hash)
    throw new Error("La propuesta de Engine no coincide con los documentos.");
  for (const doc of data.documents) {
    if (!isObject(doc) || typeof doc.fileId !== "string" ||
        typeof doc.externalKey !== "string" || !isObject(doc.values) ||
        !isObject(doc.evidence)) throw new Error("Plan de facturas inválido.");
    const file = input.files.find(f => f.id === doc.fileId);
    if (!file || doc.externalKey !== externalKeyForFile(file))
      throw new Error("La factura cambió después del análisis.");
    const checked = checkedInvoice({ values: doc.values, evidence: doc.evidence },
      file.extracted_text, INVOICE_FIELDS);
    if (JSON.stringify(checked.values) !== JSON.stringify(doc.values))
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
  },
): Promise<NonNullable<KnowledgeImportExecutionLog["engineImports"]>> {
  const plan = await tx.engine_import_plans.findFirst({
    where: { id: input.prepared.planId, workspace_id: input.workspaceId, status: "ready" },
    select: { id: true, plan_hash: true, created_by_user_id: true, expires_at: true },
  });
  if (!plan || plan.created_by_user_id !== input.userId ||
      (plan.expires_at && plan.expires_at <= new Date()) ||
      plan.plan_hash !== sha256(JSON.stringify(input.prepared.plan))) {
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
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`);
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
      binding.catalog_version !== input.prepared.plan.catalogVersion))
    throw new Error("La versión de Factura del workspace necesita revisión.");
  if (!binding) await tx.engine_workspace_catalog_bindings.create({
    data: { workspace_id: workspaceId, catalog_type_id: catalog.id,
      catalog_version: input.prepared.plan.catalogVersion, local_object_type_id: local.id },
  });
  const sourceById = new Map(input.documents.map(doc => [doc.importFileId, doc]));
  const outcomes: NonNullable<KnowledgeImportExecutionLog["engineImports"]> = [];
  for (const doc of input.prepared.plan.documents) {
    const source = sourceById.get(doc.fileId);
    if (!source || source.sourceKind !== "document") {
      outcomes.push({ knowledgeFileId: source?.knowledgeFileId ?? "",
        fileName: doc.fileName, status: "no_records_imported",
        recordsCreated: 0, recordsReused: 0 });
      continue;
    }
    const existing = await tx.engine_records.findFirst({
      where: { workspace_id: workspaceId, object_type_id: local.id,
        external_key: doc.externalKey },
      select: { id: true },
    });
    if (existing) {
      outcomes.push({ knowledgeFileId: source.knowledgeFileId, fileName: doc.fileName,
        status: "completed", recordsCreated: 0, recordsReused: 1 });
      continue;
    }
    const validation = validateEngineRecordValues(doc.values, local.engine_field_definitions);
    if (!validation.ok) throw new Error("Los campos de factura no encajan en Engine: " + JSON.stringify(validation.issues));
    const created = await tx.engine_records.create({
      data: { workspace_id: workspaceId, object_type_id: local.id,
        external_key: doc.externalKey, values_json: doc.values as Prisma.InputJsonObject,
        status: "draft", revision: 1, schema_version: local.schema_version,
        created_by_user_id: input.userId, updated_by_user_id: input.userId },
    });
    await tx.engine_record_revisions.createMany({
      data: [{ workspace_id: workspaceId, record_id: created.id, object_type_id: local.id,
        revision: 1, schema_version: local.schema_version, status: "draft",
        values_json: doc.values as Prisma.InputJsonObject, changed_by_user_id: input.userId }],
      skipDuplicates: true,
    });
    // Preserve exact provenance for every field (not one undifferentiated quote).
    for (const [fieldKey, quote] of Object.entries(doc.evidence)) {
      await tx.engine_record_provenance.create({
        data: {
          workspace_id: workspaceId, record_id: created.id, revision: 1,
          field_key: fieldKey,
          source_locator: "knowledge-import:" + input.importId + "/file:" + doc.fileId,
          knowledge_file_id: source.knowledgeFileId,
          knowledge_source_id: source.articleId,
          evidence_text: quote, origin_type: "document",
          created_by_user_id: input.userId,
        },
      });
    }
    outcomes.push({ knowledgeFileId: source.knowledgeFileId, fileName: doc.fileName,
      status: "completed", recordsCreated: 1, recordsReused: 0 });
  }
  await tx.engine_import_plans.update({
    where: { id: plan.id },
    data: { status: "completed", reviewed_by_user_id: input.userId,
      committed_at: new Date(), result_json: { importId: input.importId, invoices: outcomes } },
  });
  return outcomes;
}
