/**
 * Knowledge → Engine preview (phase 1): the single processing line for
 * structured documents of a reviewed import batch.
 *
 *   1. One discovery call proposes a shared schema (no quotes).
 *   2. One extraction call per logical document (segment), with a Structured
 *      Output derived from that schema and numbered source lines.
 *   3. Deterministic verification of every value against its own evidence,
 *      per-document status, batch identity clusters.
 *
 * Results are checkpointed per document in engine_import_plans.review_json.
 * Nothing is written to Engine schemas, catalog or records in this phase.
 */
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getKnowledgeImportModel, getOpenAIClient } from "@/lib/ai/openai";
import { assertReviewedImportBatch } from "@/lib/knowledge/import/review-import-batch";
import type { ImportInventory } from "@/lib/knowledge/import/build-import-map";
import { numberLines, sourceLines } from "./evidence";
import { validateSegmentExtraction } from "./extraction";
import { DISCOVERY_INSTRUCTIONS, EXTRACTION_INSTRUCTIONS } from "./prompts";
import { privateLabelIssues, reconcileBatch, schemaSupport } from "./reconcile";
import {
  DISCOVERY_OUTPUT_FORMAT, extractionOutputFormat, schemaForExtraction, validateDiscoveredSchema,
  type CatalogContext, type PreviewSchema, type SchemaIssue,
} from "./schema";
import type {
  EnginePreviewCall, EnginePreviewDocument, EnginePreviewEvent, EnginePreviewRunMode, EnginePreviewStatus,
  KnowledgeEnginePreview,
} from "./types";

type Scope = { importId: string; userId: string; workspaceId: string };
type Segment = {
  segmentId: string; fileId: string; fileName: string; title: string; type: string; category: string;
  group: string | null; startLine: number; endLine: number; lines: string[]; chars: number;
};
type StoredState = {
  version: 2;
  sourceFingerprint: string;
  lease: { runId: string; until: string } | null;
  startedAt: string | null;
  updatedAt: string | null;
  schema: PreviewSchema | null;
  schemaHash: string | null;
  schemaIssues: SchemaIssue[];
  schemaError: string | null;
  discoveryScope: { segmentIds: string[]; reason: string | null } | null;
  documents: Record<string, EnginePreviewDocument>;
  calls: EnginePreviewCall[];
};

export class EnginePreviewConflictError extends Error {}

/** Wall-clock budget of one run; the route allows 300 s. Unfinished documents stay pending. */
const RUN_BUDGET_MS = 270_000;
const DISCOVERY_TIMEOUT_MS = 90_000;
const EXTRACTION_TIMEOUT_MS = 100_000;
/** Do not start an extraction that cannot finish inside the run. */
const MIN_TIME_FOR_EXTRACTION_MS = 60_000;
const LEASE_MS = 330_000;
const WORKERS = 3;
/** Above this the discovery call reads one representative per reviewed group (stated in the UI). */
const DISCOVERY_FULL_TEXT_LIMIT = 120_000;
const MAX_STORED_CALLS = 60;

const planKey = (importId: string) => "knowledge-relational:" + importId;
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

async function authorize(workspaceId: string, userId: string, tx: Prisma.TransactionClient = prisma) {
  const workspace = await tx.workspaces.findFirst({
    where: { id: workspaceId, status: "active" },
    select: { owner_user_id: true, workspace_members: { where: { user_id: userId, status: "active" }, select: { role: true } } },
  });
  if (!workspace || (workspace.owner_user_id !== userId && !["owner", "admin"].includes(workspace.workspace_members[0]?.role ?? "")))
    throw new Error("Necesitas permisos de administrador para analizar datos de Engine.");
}

async function loadContext(scope: Scope) {
  await authorize(scope.workspaceId, scope.userId);
  const imported = await prisma.knowledge_imports.findFirst({
    where: {
      id: scope.importId, owner_user_id: scope.userId, status: "proposal_ready",
      processing_status: { not: "cancelled" }, knowledge_libraries: { workspace_id: scope.workspaceId },
    },
    select: {
      proposal_json: true,
      knowledge_import_files: { select: { id: true, file_name: true, status: true, extracted_text: true } },
    },
  });
  if (!imported || !object(imported.proposal_json) || !object(imported.proposal_json.globalImportMap))
    throw new Error("La propuesta no está disponible.");
  const inventory = imported.proposal_json.globalImportMap as unknown as ImportInventory;
  assertReviewedImportBatch(inventory, imported.knowledge_import_files);
  const files = new Map(imported.knowledge_import_files.map(file => [file.id, file] as const));
  const groupOf = new Map((inventory.batchReview?.groups ?? []).flatMap(group => group.documentIds.map(id => [id, group.title] as const)));
  const segments: Segment[] = inventory.documents
    .filter(document => document.routing?.structuredCandidate === true && files.get(document.fileId)?.status === "text_ready")
    .map(document => {
      const lines = sourceLines(files.get(document.fileId)!.extracted_text);
      return {
        segmentId: document.id, fileId: document.fileId, fileName: document.fileName, title: document.title,
        type: document.type, category: document.category, group: groupOf.get(document.id) ?? null,
        startLine: document.startLine, endLine: document.endLine, lines,
        chars: lines.slice(document.startLine - 1, document.endLine).join("\n").length,
      };
    });
  const fingerprint = sha({
    segments: segments.map(segment => [segment.segmentId, segment.fileId, segment.startLine, segment.endLine]),
    texts: [...new Set(segments.map(segment => segment.fileId))].sort()
      .map(id => [id, createHash("sha256").update(files.get(id)!.extracted_text).digest("hex")]),
  });
  return { segments, fingerprint };
}

function freshState(fingerprint: string): StoredState {
  return {
    version: 2, sourceFingerprint: fingerprint, lease: null, startedAt: null, updatedAt: null,
    schema: null, schemaHash: null, schemaIssues: [], schemaError: null, discoveryScope: null, documents: {}, calls: [],
  };
}

function readState(reviewJson: unknown, fingerprint: string): StoredState {
  if (object(reviewJson) && reviewJson.version === 2 && reviewJson.sourceFingerprint === fingerprint)
    return reviewJson as unknown as StoredState;
  return freshState(fingerprint);
}

const leaseActive = (state: StoredState) => !!state.lease && new Date(state.lease.until).getTime() > Date.now();

function pendingDocument(segment: Segment): EnginePreviewDocument {
  return {
    segmentId: segment.segmentId, fileId: segment.fileId, fileName: segment.fileName, title: segment.title,
    type: segment.type, startLine: segment.startLine, endLine: segment.endLine, status: "pending",
    records: [], links: [], issues: [], warnings: [], error: null, callId: null, schemaHash: null,
  };
}

function buildPreview(state: StoredState, segments: Segment[]): KnowledgeEnginePreview {
  const documents = segments.map(segment => {
    const stored = state.documents[segment.segmentId];
    return stored && stored.schemaHash === state.schemaHash ? stored : pendingDocument(segment);
  });
  const extracted = documents.filter(document => document.status === "verified" || document.status === "needs_review")
    .map(document => ({ segmentId: document.segmentId, fileName: document.fileName, records: document.records, links: document.links }));
  const schema = state.schema;
  let status: EnginePreviewStatus;
  if (!segments.length) status = "not_applicable";
  else if (leaseActive(state)) status = "running";
  else if (state.schemaError || state.schemaIssues.length) status = "schema_failed";
  else if (!schema && !state.startedAt) status = "idle";
  else if (!schema || documents.some(document => document.status === "pending")) status = "incomplete";
  else if (documents.some(document => document.status !== "verified")) status = "needs_review";
  else status = "ready";
  const calls = state.calls.map(call => ({ ...call, rawOutput: undefined }));
  return {
    version: 2, status, savedToEngine: false, startedAt: state.startedAt, updatedAt: state.updatedAt,
    schema, schemaIssues: state.schemaIssues, schemaError: state.schemaError, discoveryScope: state.discoveryScope,
    support: schema ? schemaSupport(schema, extracted) : null,
    labelIssues: schema ? privateLabelIssues(schema, extracted) : [],
    documents, clusters: schema ? reconcileBatch(schema, extracted) : [], calls,
    totals: {
      calls: state.calls.length,
      durationMs: state.calls.reduce((total, call) => total + call.durationMs, 0),
      inputTokens: state.calls.reduce((total, call) => total + (call.inputTokens ?? 0), 0),
      outputTokens: state.calls.reduce((total, call) => total + (call.outputTokens ?? 0), 0),
    },
  };
}

async function lockedPlan(tx: Prisma.TransactionClient, scope: Scope) {
  await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"engine-preview:" + scope.importId}))`);
  const where = { workspace_id_idempotency_key: { workspace_id: scope.workspaceId, idempotency_key: planKey(scope.importId) } };
  const plan = await tx.engine_import_plans.findUnique({ where });
  if (plan && plan.created_by_user_id !== scope.userId) throw new Error("El análisis de Engine pertenece a otro usuario.");
  if (plan && ["completed", "committing"].includes(plan.status)) throw new Error("Este plan de Engine ya se ha confirmado.");
  return { where, plan };
}

async function writeState(tx: Prisma.TransactionClient, scope: Scope, where: Prisma.engine_import_plansWhereUniqueInput, state: StoredState, status: string) {
  const review = state as unknown as Prisma.InputJsonObject;
  const expires = new Date(Date.now() + 7 * 86_400_000);
  await tx.engine_import_plans.upsert({
    where,
    create: {
      workspace_id: scope.workspaceId, created_by_user_id: scope.userId, idempotency_key: planKey(scope.importId),
      status, source_json: { importId: scope.importId, kind: "knowledge_preview_v2" }, review_json: review, expires_at: expires,
    },
    // plan_json stays empty: a preview is not a committable plan in this phase.
    update: { status, review_json: review, plan_json: {}, plan_hash: null, expires_at: expires, updated_at: new Date() },
  });
}

export async function getKnowledgeEnginePreview(scope: Scope): Promise<KnowledgeEnginePreview> {
  const { segments, fingerprint } = await loadContext(scope);
  if (!segments.length) return buildPreview(freshState(fingerprint), segments);
  const plan = await prisma.engine_import_plans.findUnique({
    where: { workspace_id_idempotency_key: { workspace_id: scope.workspaceId, idempotency_key: planKey(scope.importId) } },
  });
  if (plan && plan.created_by_user_id !== scope.userId) throw new Error("El análisis de Engine pertenece a otro usuario.");
  return buildPreview(readState(plan?.review_json, fingerprint), segments);
}

type ModelResult = { call: EnginePreviewCall; parsed: unknown; failure: string | null };

async function callModel(input: {
  stage: "schema" | "extract"; segmentId: string | null; instructions: string; text: string;
  format: Record<string, unknown>; maxOutputTokens: number; timeoutMs: number; signal?: AbortSignal;
}): Promise<ModelResult> {
  const model = getKnowledgeImportModel();
  const started = Date.now();
  const call: EnginePreviewCall = {
    id: randomUUID(), stage: input.stage, segmentId: input.segmentId, model, startedAt: new Date(started).toISOString(),
    durationMs: 0, inputChars: input.instructions.length + input.text.length, inputTokens: null, outputTokens: null,
    reasoningTokens: null, status: "ok", error: null, rawOutput: null,
  };
  const finish = (status: EnginePreviewCall["status"], failure: string | null, parsed: unknown = undefined): ModelResult => {
    call.durationMs = Date.now() - started; call.status = status; call.error = failure;
    return { call, parsed, failure };
  };
  try {
    const response = await getOpenAIClient().responses.create({
      model,
      ...(/^gpt-5(?:[.-]|$)|^o[134](?:[.-]|$)/.test(model) && !/-pro|-chat|-codex/.test(model) ? { reasoning: { effort: "low" as const } } : {}),
      instructions: input.instructions,
      input: input.text,
      text: { format: input.format as never },
      max_output_tokens: input.maxOutputTokens,
    }, { timeout: input.timeoutMs, maxRetries: 0, signal: input.signal });
    call.inputTokens = response.usage?.input_tokens ?? null;
    call.outputTokens = response.usage?.output_tokens ?? null;
    call.reasoningTokens = response.usage?.output_tokens_details?.reasoning_tokens ?? null;
    call.rawOutput = response.output_text ?? null;
    if (response.status !== "completed") {
      const reason = response.incomplete_details?.reason;
      return finish("incomplete", reason === "max_output_tokens"
        ? "La respuesta superó el límite de salida; el documento es demasiado largo para una sola extracción."
        : `El modelo no completó la respuesta (${reason ?? response.status}).`);
    }
    try {
      return finish("ok", null, JSON.parse(response.output_text));
    } catch {
      return finish("invalid_json", "El modelo devolvió JSON no válido.");
    }
  } catch (error) {
    if (input.signal?.aborted) return finish("aborted", "Análisis detenido.");
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    if (/timeout|timed\s*out/i.test(message))
      return finish("timeout", `Sin respuesta en ${Math.round(input.timeoutMs / 1000)} s.`);
    return finish("error", error instanceof Error ? error.message : "Error al llamar al modelo.");
  }
}

async function catalogContext(workspaceId: string): Promise<CatalogContext> {
  const [catalog, local, relations] = await Promise.all([
    prisma.engine_catalog_types.findMany({
      where: { status: "active" }, orderBy: { key: "asc" },
      include: { engine_catalog_type_versions: { where: { status: "published" }, orderBy: { version: "desc" }, take: 1,
        include: { engine_catalog_fields: { where: { status: "active" }, orderBy: { sort_order: "asc" } } } } },
    }),
    prisma.engine_object_types.findMany({ where: { workspace_id: workspaceId, status: "active" }, include: { engine_field_definitions: true } }),
    prisma.engine_catalog_relations.findMany({
      where: { status: "active" }, orderBy: { key: "asc" },
      include: {
        engine_catalog_types_engine_catalog_relations_from_type_idToengine_catalog_types: { select: { key: true } },
        engine_catalog_types_engine_catalog_relations_to_type_idToengine_catalog_types: { select: { key: true } },
      },
    }),
  ]);
  const types: CatalogContext["types"] = catalog.map(type => ({
    key: type.key, name: type.name, origin: "catalog" as const,
    fields: (type.engine_catalog_type_versions[0]?.engine_catalog_fields ?? []).map(field => ({ key: field.key, name: field.name, type: field.field_type })),
  }));
  for (const type of local) {
    if (types.some(existing => existing.key === type.key)) continue;
    types.push({
      key: type.key, name: type.name, origin: "workspace",
      fields: type.engine_field_definitions.filter(field => field.status === "active").map(field => ({ key: field.key, name: field.name, type: field.field_type })),
    });
  }
  return {
    types,
    relations: relations.map(relation => ({
      key: relation.key, cardinality: relation.cardinality,
      fromEntity: relation.engine_catalog_types_engine_catalog_relations_from_type_idToengine_catalog_types.key,
      toEntity: relation.engine_catalog_types_engine_catalog_relations_to_type_idToengine_catalog_types.key,
    })),
  };
}

/** Full text of every structured document when it fits; otherwise one per reviewed group, stated explicitly. */
export function discoveryScope(segments: Array<Pick<Segment, "segmentId" | "group" | "chars">>, limit = DISCOVERY_FULL_TEXT_LIMIT) {
  const total = segments.reduce((sum, segment) => sum + segment.chars, 0);
  if (total <= limit) return { segmentIds: segments.map(segment => segment.segmentId), reason: null };
  const byGroup = new Map<string, Pick<Segment, "segmentId" | "group" | "chars">>();
  for (const segment of segments) {
    const key = segment.group ?? segment.segmentId;
    const current = byGroup.get(key);
    if (!current || segment.chars > current.chars) byGroup.set(key, segment);
  }
  const chosen = [...byGroup.values()];
  if (chosen.reduce((sum, segment) => sum + segment.chars, 0) > limit)
    throw new Error("Los documentos estructurados son demasiado extensos para proponer un esquema común en una sola lectura. Divide el lote.");
  return {
    segmentIds: chosen.map(segment => segment.segmentId),
    reason: `El esquema se propuso leyendo ${chosen.length} de ${segments.length} documentos (uno por grupo de la revisión) porque el lote completo supera ${limit.toLocaleString("es-ES")} caracteres. Todos los documentos se extraen y verifican igualmente.`,
  };
}

export async function runKnowledgeEnginePreview(input: Scope & {
  mode: EnginePreviewRunMode;
  segmentId?: string;
  signal?: AbortSignal;
  onEvent?: (event: EnginePreviewEvent) => void | Promise<void>;
}): Promise<KnowledgeEnginePreview> {
  const scope: Scope = { importId: input.importId, userId: input.userId, workspaceId: input.workspaceId };
  const { segments, fingerprint } = await loadContext(scope);
  if (!segments.length) return buildPreview(freshState(fingerprint), segments);
  if (input.mode === "retry_document" && !segments.some(segment => segment.segmentId === input.segmentId))
    throw new Error("El documento indicado no forma parte de los datos estructurados de este lote.");
  const runId = randomUUID();

  // Claim the run: only one analysis per import at a time, even across tabs.
  let state = await prisma.$transaction(async tx => {
    await authorize(scope.workspaceId, scope.userId, tx);
    const { where, plan } = await lockedPlan(tx, scope);
    let current = readState(plan?.review_json, fingerprint);
    if (leaseActive(current)) throw new EnginePreviewConflictError("Ya hay un análisis de Engine en curso para esta importación.");
    if (input.mode === "restart") current = { ...freshState(fingerprint), calls: current.calls };
    if (input.mode === "retry_document") delete current.documents[input.segmentId!];
    if (input.mode !== "restart" && (current.schemaError || current.schemaIssues.length))
      current = { ...current, schema: null, schemaHash: null, schemaIssues: [], schemaError: null, discoveryScope: null };
    current.lease = { runId, until: new Date(Date.now() + LEASE_MS).toISOString() };
    current.startedAt = current.startedAt ?? new Date().toISOString();
    current.updatedAt = new Date().toISOString();
    await writeState(tx, scope, where, current, "draft");
    return current;
  });

  const emit = async (event: EnginePreviewEvent) => { await input.onEvent?.(event); };
  const progress = (message: string) => emit({ type: "progress", message });
  const mutate = async (change: (state: StoredState) => void) => {
    state = await prisma.$transaction(async tx => {
      const { where, plan } = await lockedPlan(tx, scope);
      const current = readState(plan?.review_json, fingerprint);
      if (current.lease?.runId !== runId) throw new EnginePreviewConflictError("Otro análisis de Engine ha tomado el control de esta importación.");
      change(current);
      current.calls = current.calls.slice(-MAX_STORED_CALLS);
      current.updatedAt = new Date().toISOString();
      await writeState(tx, scope, where, current, "draft");
      return current;
    });
    await emit({ type: "state", preview: buildPreview(state, segments) });
  };

  const deadline = Date.now() + RUN_BUDGET_MS;
  try {
    await (async () => {
      await emit({ type: "state", preview: buildPreview(state, segments) });
      if (!state.schema) {
        const scopeOfDiscovery = discoveryScope(segments);
        const chosen = segments.filter(segment => scopeOfDiscovery.segmentIds.includes(segment.segmentId));
        const catalog = await catalogContext(scope.workspaceId);
        await progress(`Proponiendo el esquema común a partir de ${chosen.length} ${chosen.length === 1 ? "documento" : "documentos"}`);
        const text = [
          "EXISTING CATALOG AND WORKSPACE STRUCTURES (reuse exact keys when compatible):",
          JSON.stringify(catalog),
          "",
          "STRUCTURED DOCUMENTS OF THE BATCH:",
          ...chosen.map((segment, index) => [
            `=== D${index + 1} · ${segment.type} · ${segment.title}${segment.group ? " · grupo: " + segment.group : ""} ===`,
            segment.lines.slice(segment.startLine - 1, segment.endLine).join("\n"),
          ].join("\n")),
        ].join("\n");
        const result = await callModel({
          stage: "schema", segmentId: null, instructions: DISCOVERY_INSTRUCTIONS, text, format: DISCOVERY_OUTPUT_FORMAT,
          maxOutputTokens: 8000, timeoutMs: Math.min(DISCOVERY_TIMEOUT_MS, deadline - Date.now() - 5000), signal: input.signal,
        });
        if (result.failure) {
          await mutate(current => {
            current.calls.push(result.call);
            if (result.call.status !== "aborted") current.schemaError = "No se pudo proponer el esquema: " + result.failure;
          });
          return;
        }
        const checked = validateDiscoveredSchema(result.parsed, catalog);
        await mutate(current => {
          current.calls.push(result.call);
          current.discoveryScope = scopeOfDiscovery;
          if (!checked.schema) { current.schemaIssues = checked.issues; return; }
          current.schema = checked.schema;
          current.schemaHash = sha(checked.schema);
          current.schemaIssues = [];
          current.schemaError = null;
        });
        if (!state.schema) return;
      }

      const schema = state.schema!, schemaHash = state.schemaHash!;
      const format = extractionOutputFormat(schema);
      const compactSchema = JSON.stringify(schemaForExtraction(schema));
      const queue = segments.filter(segment => {
        if (input.mode === "retry_document") return segment.segmentId === input.segmentId;
        const stored = state.documents[segment.segmentId];
        return !stored || stored.schemaHash !== schemaHash || stored.status === "pending" || stored.status === "failed";
      });
      let next = 0;
      let stopped = false;
      await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
        while (!stopped && next < queue.length) {
          if (input.signal?.aborted) { stopped = true; return; }
          if (deadline - Date.now() < MIN_TIME_FOR_EXTRACTION_MS) {
            stopped = true;
            await progress("Se ha agotado la ventana de este análisis; los documentos restantes quedan pendientes y puedes continuar.");
            return;
          }
          const segment = queue[next++];
          await progress(`Extrayendo y verificando: ${segment.fileName} · ${segment.title}`);
          const result = await callModel({
            stage: "extract", segmentId: segment.segmentId, instructions: EXTRACTION_INSTRUCTIONS,
            text: [
              "SHARED SCHEMA:", compactSchema, "",
              `DOCUMENT: ${segment.type} · ${segment.title} (lines ${segment.startLine}-${segment.endLine} of ${segment.fileName})`,
              numberLines(segment.lines, segment),
            ].join("\n"),
            format, maxOutputTokens: 16000, timeoutMs: Math.min(EXTRACTION_TIMEOUT_MS, deadline - Date.now() - 5000), signal: input.signal,
          });
          if (result.call.status === "aborted") {
            stopped = true;
            await mutate(current => { current.calls.push(result.call); });
            return;
          }
          const document = pendingDocument(segment);
          document.callId = result.call.id;
          document.schemaHash = schemaHash;
          if (result.failure) {
            document.status = "failed";
            document.error = result.failure;
          } else {
            const verified = validateSegmentExtraction(result.parsed, schema, segment.lines, segment);
            Object.assign(document, verified);
            document.status = verified.issues.some(issue => issue.severity === "error") ? "needs_review" : "verified";
          }
          await mutate(current => {
            current.calls.push(result.call);
            current.documents[segment.segmentId] = document;
          });
        }
      }));
    })();
  } finally {
    // Release the claim even on failure, so the user can continue from what was saved.
    await prisma.$transaction(async tx => {
      const { where, plan } = await lockedPlan(tx, scope);
      const current = readState(plan?.review_json, fingerprint);
      if (current.lease?.runId !== runId) return;
      current.lease = null;
      current.updatedAt = new Date().toISOString();
      const preview = buildPreview(current, segments);
      await writeState(tx, scope, where, current, preview.status === "ready" ? "preview_ready" : "draft");
      state = current;
    }).catch(error => console.error("[engine-preview] could not release run", error));
  }
  return buildPreview(state, segments);
}
