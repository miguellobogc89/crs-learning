/**
 * Engine COMMIT of a v1 relational plan (legacy contract).
 *
 * Since phase 1 the preview is produced by lib/engine/knowledge-preview and is
 * not committable; confirmKnowledgeImport no longer calls this module. It stays
 * until phase 4 replaces the commit, so its catalog/identity rules can be
 * reviewed against the new plan instead of being lost.
 */
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureInvoiceRevisionSnapshot, invoiceMissingFields } from "./invoice-evidence";
import { validateEngineRecordValues } from "./validation";
import { canonicalRecordValue, batchRowIdentity, hashPlan, normalizedIdentity, sourceFingerprint, validateEngineBatchPlan, type EngineBatchPlan, type EngineBatchRow, type EngineSource } from "./knowledge-engine-plan";
import type { KnowledgeImportProposal, KnowledgeImportCreatedDocumentLog, KnowledgeImportSkippedDocumentLog, KnowledgeImportExecutionLog } from "@/lib/knowledge/import/types";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const planKey = (id: string) => "knowledge-relational:" + id;
const candidates = (proposal: KnowledgeImportProposal, files: EngineSource[]) => files.filter(f => f.status === "text_ready" && proposal.documentRoutes?.[f.id]?.structuredCandidate);
function recordKey(plan: EngineBatchPlan, row: EngineBatchRow): string {
  if (row.entity !== "invoice")
    return row.identityParent
      ? row.entity + ":" + hashPlan([batchRowIdentity(row), recordKey(plan, plan.rows.find(r => r.id === row.identityParent)!)]) : batchRowIdentity(row);
  const link = plan.links.find(l => l.to === row.id && l.relationKey === "invoice_issuer")!;
  const issuer = plan.rows.find(r => r.id === link.from)!;
  return "invoice:" + hashPlan([batchRowIdentity(issuer), canonicalRecordValue(row.values.invoice_number)]);
}
async function authorize(workspaceId: string, userId: string, tx: Prisma.TransactionClient = prisma) {
  const ws = await tx.workspaces.findFirst({
    where: { id: workspaceId, status: "active" },
    select: { owner_user_id: true, workspace_members: { where: { user_id: userId, status: "active" }, select: { role: true } } }
  });
  if (!ws || (ws.owner_user_id !== userId && !["owner", "admin"].includes(ws.workspace_members[0]?.role ?? "")))
    throw new Error("Necesitas permisos de administrador para importar en Engine.");
}
async function findExisting(tx: Prisma.TransactionClient, workspaceId: string, plan: EngineBatchPlan, row: EngineBatchRow, files: EngineSource[]) {
  const type = await tx.engine_object_types.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key: row.entity } } });
  if (!type)
    return null;
  const file = files.find(f => f.id === row.documentId)!;
  const keys = [recordKey(plan, row)];
  if (row.entity === "invoice")
    keys.push("invoice:" + hashText(file.content_hash || file.extracted_text));
  // Existing records without our external key can be reused only by exact natural identity.
  const normalizedMatches = row.entity === "company" ? await tx.$queryRaw<{
    id: string;
  }[]>(Prisma.sql`
    SELECT id FROM engine_records
    WHERE workspace_id = ${workspaceId}::uuid AND object_type_id = ${type.id}::uuid AND status <> 'archived'
      AND regexp_replace(upper(values_json ->> ${row.identityFields[0]}), '[^A-Z0-9]', '', 'g') = ${normalizedIdentity(row.values[row.identityFields[0]])}
    LIMIT 3
  `) : [];
  const issuerLink = plan.links.find(l => l.to === row.id && l.relationKey === "invoice_issuer");
  const issuer = issuerLink ? plan.rows.find(r => r.id === issuerLink.from) : undefined;
  const issuerField = issuer?.identityFields[0];
  const matches = await tx.engine_records.findMany({
    where: {
      workspace_id: workspaceId, object_type_id: type.id, status: { not: "archived" },
      OR: [{ external_key: { in: keys } },
      ...(normalizedMatches.length ? [{ id: { in: normalizedMatches.map(r => r.id) } }] : []),
      ...(row.entity === "invoice" && issuer && issuerField ? [{
        AND: [
          { values_json: { path: ["invoice_number"], equals: row.values.invoice_number } },
          {
            record_relations_to: {
              some: {
                definition: { key: "invoice_issuer", status: "active" }, from_record: {
                  workspace_id: workspaceId, status: { not: "archived" },
                  OR: [{ external_key: batchRowIdentity(issuer) }, { values_json: { path: [issuerField], equals: issuer.values[issuerField] } }]
                }
              }
            }
          },
        ]
      }] : row.entity !== "invoice" && !row.identityParent ? [{ AND: row.identityFields.map(k => ({ values_json: { path: [k], equals: row.values[k] } })) }] : []),
      ]
    }, take: 3
  });
  if (matches.length > 1)
    throw new Error("Identidad ambigua en " + row.entity + "; revisa los registros existentes.");
  return matches[0] ?? null;
}
// The legacy invoice importer hashes the raw text/hash directly, not canonical JSON.
const hashText = (v: string) => createHash("sha256").update(v).digest("hex");
export async function validatePreparedEnginePlan(input: {
  importId: string;
  workspaceId: string;
  userId: string;
  proposal: KnowledgeImportProposal;
  files: EngineSource[];
}) {
  const files = candidates(input.proposal, input.files);
  if (!files.length)
    return null;
  const stored = await prisma.engine_import_plans.findUnique({ where: { workspace_id_idempotency_key: { workspace_id: input.workspaceId, idempotency_key: planKey(input.importId) } } });
  if (!stored || stored.status !== "ready" || stored.created_by_user_id !== input.userId || !stored.expires_at || stored.expires_at <= new Date() || stored.plan_hash !== hashPlan(stored.plan_json))
    throw new Error("Completa la vista previa relacional de Engine antes de confirmar.");
  const plan = validateEngineBatchPlan(stored.plan_json, files, input.workspaceId);
  if (plan.sourceFingerprint !== sourceFingerprint(files, input.proposal))
    throw new Error("Las fuentes o la propuesta cambiaron; regenera Engine.");
  return { planId: stored.id, plan, files };
}
/** All schemas, private records, links and Knowledge provenance commit in the caller's transaction. */
export async function commitPreparedEngine(tx: Prisma.TransactionClient, input: {
  workspaceId: string;
  userId: string;
  importId: string;
  prepared: NonNullable<Awaited<ReturnType<typeof validatePreparedEnginePlan>>>;
  documents: KnowledgeImportCreatedDocumentLog[];
  skippedDocuments: KnowledgeImportSkippedDocumentLog[];
}): Promise<NonNullable<KnowledgeImportExecutionLog["engineImports"]>> {
  const { workspaceId, userId, prepared } = input;
  await authorize(workspaceId, userId, tx);
  // Serialize private writes within this workspace, without blocking imports in other workspaces.
  await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${workspaceId}))`);
  const storedPlan = await tx.engine_import_plans.findUnique({ where: { workspace_id_idempotency_key: { workspace_id: workspaceId, idempotency_key: planKey(input.importId) } } });
  if (!storedPlan || storedPlan.id !== prepared.planId || hashPlan(storedPlan.plan_json) !== hashPlan(prepared.plan))
    throw new Error("El plan almacenado cambió; regenera la vista previa.");
  const claimed = await tx.engine_import_plans.updateMany({
    where: {
      id: prepared.planId, workspace_id: workspaceId, status: "ready", created_by_user_id: userId,
      plan_hash: hashPlan(prepared.plan), expires_at: { gt: new Date() }
    }, data: { status: "committing" }
  });
  if (claimed.count !== 1)
    throw new Error("El plan de Engine cambió o ya se confirmó.");
  const fresh = await tx.knowledge_imports.findFirst({ where: { id: input.importId, owner_user_id: userId, knowledge_libraries: { workspace_id: workspaceId } }, include: { knowledge_import_files: true } });
  if (!fresh || !object(fresh.proposal_json) || sourceFingerprint(candidates(fresh.proposal_json as unknown as KnowledgeImportProposal, fresh.knowledge_import_files), fresh.proposal_json) !== prepared.plan.sourceFingerprint)
    throw new Error("Las fuentes cambiaron antes de confirmar Engine.");
  const plan = validateEngineBatchPlan(prepared.plan, prepared.files, workspaceId);
  const localTypes = new Map<string, Awaited<ReturnType<typeof bindType>>>();
  for (const entity of [...plan.schema.entities].sort((a, b) => a.key.localeCompare(b.key)))
    localTypes.set(entity.key, await bindType(tx, workspaceId, entity));
  const sources = new Map(input.documents.map(d => [d.importFileId, { knowledgeFileId: d.knowledgeFileId, sourceId: d.articleId }]));
  for (const skipped of input.skippedDocuments) {
    if (skipped.existingKnowledgeFileId) {
      const file = await tx.knowledge_files.findFirst({ where: { id: skipped.existingKnowledgeFileId, status: { not: "deleted" }, knowledge_sources: { owner_user_id: userId, knowledge_libraries: { workspace_id: workspaceId } } } });
      if (file)
        sources.set(skipped.importFileId, { knowledgeFileId: file.id, sourceId: file.knowledge_source_id });
    }
    else if (skipped.duplicateImportFileId) {
      const original = sources.get(skipped.duplicateImportFileId);
      if (original)
        sources.set(skipped.importFileId, original);
    }
  }
  const resolved = new Map<string, string>(), byIdentity = new Map<string, string>(), revisions = new Map<string, number>();
  const outcomes: NonNullable<KnowledgeImportExecutionLog["engineImports"]> = [];
  for (const row of plan.rows) {
    const source = sources.get(row.documentId), type = localTypes.get(row.entity)!;
    if (!source)
      throw new Error("Falta el documento original de " + row.entity);
    const identity = recordKey(plan, row);
    const known = byIdentity.get(identity);
    let existing = known ? await tx.engine_records.findFirst({ where: { id: known, workspace_id: workspaceId, status: { not: "archived" } } }) : await findExisting(tx, workspaceId, plan, row, prepared.files);
    const additions = existing ? invoiceMissingFields(existing.values_json, row.values) : row.values;
    const values = { ...(existing && object(existing.values_json) ? existing.values_json : {}), ...additions };
    const validation = validateEngineRecordValues(values, type.engine_field_definitions.map(f => ({ ...f, is_required: f.is_required || type.catalogRequired.includes(f.key) })));
    if (!validation.ok)
      throw new Error("Esquema incompatible en " + row.entity + ": " + JSON.stringify(validation.issues));
    const changed = Object.keys(additions).length > 0;
    const created = !existing;
    if (!existing) {
      existing = await tx.engine_records.create({
        data: {
          workspace_id: workspaceId, object_type_id: type.id, external_key: identity,
          values_json: values as Prisma.InputJsonObject, status: "draft", revision: 1, schema_version: type.schema_version, created_by_user_id: userId, updated_by_user_id: userId
        }
      });
    }
    else if (changed) {
      existing = await tx.engine_records.update({ where: { id: existing.id }, data: { values_json: values as Prisma.InputJsonObject, revision: { increment: 1 }, updated_by_user_id: userId, updated_at: new Date() } });
    }
    await ensureInvoiceRevisionSnapshot(tx, { workspaceId, recordId: existing.id, objectTypeId: type.id, revision: existing.revision, schemaVersion: existing.schema_version, status: existing.status, values, userId });
    // Preserve evidence from every occurrence, including reused companies across invoices.
    for (const [field, quote] of Object.entries(row.evidence)) {
      if (hashPlan(values[field]) !== hashPlan(row.values[field]))
        continue;
      await tx.engine_record_provenance.create({
        data: {
          workspace_id: workspaceId, record_id: existing.id, revision: existing.revision, field_key: field,
          knowledge_file_id: source.knowledgeFileId, knowledge_source_id: source.sourceId, source_locator: "knowledge-import:" + input.importId + "/row:" + row.id,
          evidence_text: quote, origin_type: "document", created_by_user_id: userId
        }
      });
    }
    resolved.set(row.id, existing.id);
    byIdentity.set(identity, existing.id);
    revisions.set(existing.id, existing.revision);
    outcomes.push({
      knowledgeFileId: source.knowledgeFileId, fileName: row.entity + " · " + prepared.files.find(f => f.id === row.documentId)!.file_name, status: "completed",
      recordsCreated: created ? 1 : 0, recordsUpdated: !created && changed ? 1 : 0, recordsReused: !created && !changed ? 1 : 0, fieldsCompleted: created ? 0 : Object.keys(additions).length
    });
  }
  for (const relation of [...plan.schema.relations].sort((a, b) => a.key.localeCompare(b.key))) {
    const from = localTypes.get(relation.fromEntity)!, to = localTypes.get(relation.toEntity)!;
    const [fromCatalog, toCatalog] = await Promise.all([tx.engine_catalog_types.findUniqueOrThrow({ where: { key: relation.fromEntity } }), tx.engine_catalog_types.findUniqueOrThrow({ where: { key: relation.toEntity } })]);
    let globalRelation = await tx.engine_catalog_relations.findFirst({ where: { key: relation.key }, orderBy: { version: "desc" } });
    if (!globalRelation) {
      await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"engine-catalog-relation:" + relation.key}))`);
      globalRelation = await tx.engine_catalog_relations.findFirst({ where: { key: relation.key }, orderBy: { version: "desc" } });
    }
    if (globalRelation && (globalRelation.status !== "active" || globalRelation.from_type_id !== fromCatalog.id || globalRelation.to_type_id !== toCatalog.id || globalRelation.cardinality !== relation.cardinality))
      throw new Error("Relación de catálogo incompatible: " + relation.key);
    if (!globalRelation)
      await tx.engine_catalog_relations.create({ data: { key: relation.key, name: relation.key, description: relation.description, from_type_id: fromCatalog.id, to_type_id: toCatalog.id, cardinality: relation.cardinality } });
    let definition = await tx.engine_relation_definitions.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key: relation.key } } });
    if (definition && (definition.status !== "active" || definition.from_object_type_id !== from.id || definition.to_object_type_id !== to.id || definition.cardinality !== relation.cardinality))
      throw new Error("Relación existente incompatible: " + relation.key);
    if (!definition)
      definition = await tx.engine_relation_definitions.create({
        data: {
          workspace_id: workspaceId, key: relation.key, name: relation.key,
          description: relation.description, from_object_type_id: from.id, to_object_type_id: to.id, cardinality: relation.cardinality, created_by_user_id: userId
        }
      });
    for (const link of plan.links.filter(l => l.relationKey === relation.key)) {
      const fromId = resolved.get(link.from)!, toId = resolved.get(link.to)!;
      if (relation.cardinality === "one_to_many" || relation.cardinality === "one_to_one") {
        const incompatible = await tx.engine_record_relations.findFirst({
          where: {
            workspace_id: workspaceId, relation_definition_id: definition.id,
            from_record: { status: { not: "archived" } }, to_record: { status: { not: "archived" } },
            OR: [{ to_record_id: toId, from_record_id: { not: fromId } }, ...(relation.cardinality === "one_to_one" ? [{ from_record_id: fromId, to_record_id: { not: toId } }] : [])]
          }
        });
        if (incompatible)
          throw new Error("La relación contradice su cardinalidad: " + relation.key);
      }
      await tx.engine_record_relations.createMany({ data: [{ workspace_id: workspaceId, relation_definition_id: definition.id, from_record_id: fromId, to_record_id: toId, reviewed_by_user_id: userId }], skipDuplicates: true });
      const source = sources.get(link.documentId)!;
      await tx.engine_record_provenance.create({
        data: {
          workspace_id: workspaceId, record_id: fromId, revision: revisions.get(fromId)!, field_key: "relation:" + relation.key,
          knowledge_file_id: source.knowledgeFileId, knowledge_source_id: source.sourceId, evidence_text: link.evidence,
          source_locator: "knowledge-import:" + input.importId + "/link:" + relation.key + "/to:" + toId, origin_type: "document", created_by_user_id: userId
        }
      });
    }
  }
  await tx.engine_import_plans.update({ where: { id: prepared.planId }, data: { status: "completed", reviewed_by_user_id: userId, committed_at: new Date(), result_json: { records: outcomes } } });
  return outcomes;
}
async function bindType(tx: Prisma.TransactionClient, workspaceId: string, entity: EngineBatchPlan["schema"]["entities"][number]) {
  await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"engine-catalog-type:" + entity.key}))`);
  let catalog = await tx.engine_catalog_types.findUnique({ where: { key: entity.key } });
  let version = catalog ? await tx.engine_catalog_type_versions.findFirst({ where: { type_id: catalog.id, status: "published" }, orderBy: { version: "desc" }, include: { engine_catalog_fields: { where: { status: "active" } } } }) : null;
  if (catalog && (!version || catalog.status !== "active"))
    throw new Error("El estándar no está publicado: " + entity.key);

  if (!catalog) {
    catalog = await tx.engine_catalog_types.create({
      data: { key: entity.key, name: entity.key === "company" ? "Empresas" : entity.name, description: entity.description },
    });
    const fields = new Map<string, { key: string; name: string; type: string }>();
    if (entity.key === "company") {
      fields.set("legal_name", { key: "legal_name", name: "Razón social", type: "text" });
      fields.set("tax_id", { key: "tax_id", name: "Identificación fiscal", type: "text" });
    }
    for (const field of entity.fields) {
      const existing = fields.get(field.key);
      if (existing && existing.type !== field.type)
        throw new Error("Campo incompatible con el estándar: " + entity.key + "." + field.key);
      fields.set(field.key, { key: field.key, name: field.name, type: field.type });
    }
    await tx.engine_catalog_type_versions.create({
      data: {
        type_id: catalog.id, version: 1, status: "published", published_at: new Date(),
        engine_catalog_fields: { create: [...fields.values()].map((field, i) => ({
          key: field.key, name: field.name, field_type: field.type, is_required: false, sort_order: i,
        })) }
      }, include: { engine_catalog_fields: true }
    });
    version = await tx.engine_catalog_type_versions.findFirst({
      where: { type_id: catalog.id, status: "published" },
      orderBy: { version: "desc" },
      include: { engine_catalog_fields: { where: { status: "active" } } },
    });
    if (!version)
      throw new Error("No se pudo leer el nuevo estándar: " + entity.key);
  }
  else {
    const publishedFields = new Map(version!.engine_catalog_fields.map(field => [field.key, field]));
    const additions = entity.fields.filter(field => {
      const published = publishedFields.get(field.key);
      if (published && published.field_type !== field.type)
        throw new Error("Campo incompatible con el estándar: " + entity.key + "." + field.key);
      return !published;
    });
    if (additions.length) {
      const nextVersion = version!.version + 1;
      await tx.engine_catalog_type_versions.create({
        data: {
          type_id: catalog.id,
          version: nextVersion,
          status: "published",
          published_at: new Date(),
          notes: "Campos genéricos aprobados mediante importación de Knowledge.",
          engine_catalog_fields: {
            create: [
              ...version!.engine_catalog_fields.map(field => ({
                key: field.key, name: field.name, field_type: field.field_type,
                description: field.description, is_required: field.is_required,
                is_unique: field.is_unique, sort_order: field.sort_order,
                configuration: field.configuration === null ? {} : field.configuration as Prisma.InputJsonValue,
              })),
              ...additions.map((field, index) => ({
                key: field.key, name: field.name, field_type: field.type,
                description: null, is_required: false, is_unique: false,
                sort_order: version!.engine_catalog_fields.length + index,
                configuration: {},
              })),
            ],
          },
        },
      });
      version = await tx.engine_catalog_type_versions.findFirst({
        where: { type_id: catalog.id, status: "published" },
        orderBy: { version: "desc" },
        include: { engine_catalog_fields: { where: { status: "active" } } },
      });
      if (!version)
        throw new Error("No se pudo leer la nueva versión del estándar: " + entity.key);
    }
  }

  let local = await tx.engine_object_types.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key: entity.key } }, include: { engine_field_definitions: true } });
  if (local && local.status !== "active")
    throw new Error("Tabla inactiva: " + entity.key);
  if (!local) {
    const created = await tx.engine_object_types.create({ data: { workspace_id: workspaceId, key: entity.key, name: catalog?.name ?? entity.name, description: catalog?.description ?? entity.description } });
    local = await tx.engine_object_types.findUniqueOrThrow({ where: { id: created.id }, include: { engine_field_definitions: true } });
  }
  const fields = new Map(local.engine_field_definitions.map(f => [f.key, f]));
  const required = version!.engine_catalog_fields.map(f => ({
    key: f.key, name: f.name, type: f.field_type, required: f.is_required, configuration: f.configuration,
  }));
  let added = false;
  for (const field of required) {
    const existing = fields.get(field.key);
    if (existing) {
      if (existing.field_type !== field.type || existing.status !== "active")
        throw new Error("Campo incompatible: " + entity.key + "." + field.key);
      continue;
    }
    // New fields are optional for historical records; requiredness is checked in the reviewed batch.
    const created = await tx.engine_field_definitions.create({
      data: {
        workspace_id: workspaceId, object_type_id: local.id, key: field.key, name: field.name,
        field_type: field.type, is_required: false, configuration: field.configuration as Prisma.InputJsonObject, sort_order: fields.size
      }
    });
    fields.set(created.key, created);
    added = true;
  }
  if (added && local.engine_field_definitions.length)
    await tx.engine_object_types.update({ where: { id: local.id }, data: { schema_version: { increment: 1 }, updated_at: new Date() } });
  if (catalog && version) {
    const binding = await tx.engine_workspace_catalog_bindings.findUnique({ where: { workspace_id_catalog_type_id: { workspace_id: workspaceId, catalog_type_id: catalog.id } } });
    if (binding && (binding.status !== "active" || binding.local_object_type_id !== local.id || binding.catalog_version > version.version))
      throw new Error("Vinculación de catálogo incompatible.");
    if (!binding)
      await tx.engine_workspace_catalog_bindings.create({ data: { workspace_id: workspaceId, catalog_type_id: catalog.id, catalog_version: version.version, local_object_type_id: local.id } });
    else if (binding.catalog_version !== version.version)
      await tx.engine_workspace_catalog_bindings.update({ where: { id: binding.id }, data: { catalog_version: version.version, updated_at: new Date() } });
  }
  const bound = await tx.engine_object_types.findUniqueOrThrow({ where: { id: local.id }, include: { engine_field_definitions: true } });
  return { ...bound, catalogRequired: version!.engine_catalog_fields.filter(f => f.is_required).map(f => f.key) };
}
