import { resolveIdentityQuestions, type IdentityAnswers } from "@/lib/engine/ingestion/resolve-identity-questions";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { validateInsertPlan, type InsertPlan } from "@/lib/engine/ingestion/validate-insert-plan";
import { verifyInsertPlan } from "@/lib/engine/ingestion/signed-insert-plan";
import { Prisma } from "@prisma/client";
import { loadEngineReconciliationSnapshot } from "@/lib/engine/ingestion/load-reconciliation-snapshot";
import { discoverIdentityRules } from "@/lib/engine/ingestion/discover-identity-rules";
import { reconcileEngineImport } from "@/lib/engine/ingestion/reconcile-engine-import";
import { resolveImportConflicts, type ConflictAnswers } from "@/lib/engine/ingestion/resolve-import-conflicts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ importId: string }> };
type Payload = { fileId?: string; signature?: string; plan?: InsertPlan; confirm?: boolean; conflictAnswers?: ConflictAnswers; identityAnswers?: IdentityAnswers };
const asObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { importId } = await context.params;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const body = await request.json().catch(() => null) as Payload | null;
  if (!body?.confirm || !body.fileId || !body.signature || !body.plan ||
    !asObject(body.plan) || !Array.isArray(body.plan.entities) ||
    !Array.isArray(body.plan.relations) || !Array.isArray(body.plan.rows) ||
    !Array.isArray(body.plan.links) || !Array.isArray(body.plan.issues) ||
    !Array.isArray(body.plan.unresolvedLinks))
    return Response.json({ error: "Falta confirmación o propuesta válida" }, { status: 400 });
  let plan = body.plan;
  if (!verifyInsertPlan(activeWorkspace.id, importId, body.fileId, plan, body.signature))
    return Response.json({ error: "La propuesta ha cambiado. Repite la simulación." }, { status: 409 });

  const validation = validateInsertPlan(plan);
  if (!validation.ready) return Response.json({ error: "INSERT bloqueado", blockers: validation.blockers }, { status: 409 });
  const imported = await prisma.knowledge_imports.findFirst({
    where: { id: importId, owner_user_id: session.user.id,
      knowledge_libraries: { workspace_id: activeWorkspace.id } },
    select: { library_id: true, knowledge_import_files: { where: { id: body.fileId, status: "text_ready" },
      select: { id: true, file_name: true, mime_type: true, file_size: true, storage_path: true, content_hash: true, extracted_text: true } } },
  });
  const source = imported?.knowledge_import_files[0];
  if (!source) return Response.json({ error: "Documento no disponible" }, { status: 404 });
  if (plan.rows.some(row => !source.extracted_text.includes(row.evidence)) ||
      plan.links.some(link => !source.extracted_text.includes(link.evidence)))
    return Response.json({ error: "Evidencia documental inválida" }, { status: 409 });
  try {
    plan = resolveIdentityQuestions(plan, body.identityAnswers ?? {});
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Identidades inválidas" }, { status: 409 });
  }
  const resolvedValidation = validateInsertPlan(plan);
  if (!resolvedValidation.ready)
    return Response.json({ error: "La consolidación requiere revisión", blockers: resolvedValidation.blockers }, { status: 409 });
  const ws = activeWorkspace.id;
  try {
    const result = await prisma.$transaction(async tx => {
      // First E2E only: do not merge, overwrite or infer identity against existing data.
      // Serializing writes per workspace avoids two simultaneous empty-workspace imports.
      const lock = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${ws})) AS acquired`;
      if (!lock[0]?.acquired) throw new Error("Ya hay una inserción en curso en este workspace.");
      const [types, records, relations] = await Promise.all([
        tx.engine_object_types.count({ where: { workspace_id: ws } }),
        tx.engine_records.count({ where: { workspace_id: ws, status: { not: "archived" } } }),
        tx.engine_relation_definitions.count({ where: { workspace_id: ws } }),
      ]);
      if (types || records || relations) {
        // Never trust a browser preview for writes: recompute identity, schema,
        // values and links from the locked workspace inside this transaction.
        const { snapshot, identityRules } = await loadEngineReconciliationSnapshot(ws, tx);
        const discovery = discoverIdentityRules(plan, snapshot, identityRules);
        const reconciliation = reconcileEngineImport(plan, snapshot, discovery.rules);
        const hasConflicts = reconciliation.rows.some(row => row.action === "review" || row.action === "extend");
        if (!reconciliation.ready && !hasConflicts)
          throw new Error("Reconciliación incremental bloqueada: " + reconciliation.blockers.join(" · "));
        const resolution = hasConflicts
          ? resolveImportConflicts(plan, snapshot, reconciliation, body.conflictAnswers ?? {})
          : null;
        if (!hasConflicts && body.conflictAnswers && Object.keys(body.conflictAnswers).length)
          throw new Error("No hay conflictos que resolver.");
        if (hasConflicts && !resolution) throw new Error("Faltan decisiones de conflictos.");
        // This first incremental writer supports only existing compatible
        // definitions; schema evolution requires its own reviewed migration.
        if (reconciliation.entities.some(item => item.action !== "reuse") ||
            reconciliation.relations.some(item => item.action !== "reuse"))
          throw new Error("Hay estructuras o relaciones nuevas: requieren una migración de esquema.");
        const newRows = reconciliation.rows.filter(row => row.action === "create" && !resolution?.omitted.has(row.localId));
        const existingRowIds = new Map(reconciliation.rows.filter(row => row.existingId)
          .map(row => [row.localId, row.existingId!]));
        // A link marked "review" solely because of a row conflict becomes
        // eligible once that row is explicitly resolved.
        const newLinks = reconciliation.links.filter(link => {
          if (resolution?.omitted.has(link.fromLocalId) || resolution?.omitted.has(link.toLocalId))
            return false;
          if (link.action === "reuse") return false;
          const from = existingRowIds.get(link.fromLocalId);
          const to = existingRowIds.get(link.toLocalId);
          return !(from && to && snapshot.links.some(item =>
            item.relationKey === link.relationKey && item.fromId === from && item.toId === to));
        });
        if (!newRows.length && !newLinks.length && !resolution?.updates.size)
          return { structures: 0, fields: 0, relationDefinitions: 0, records: 0,
            links: 0, reusedRecords: reconciliation.rows.length, reusedLinks: reconciliation.links.length };
        // Create a real, workspace-linked document source for provenance.
        const provenanceSource = await tx.knowledge_sources.create({ data: {
          owner_user_id: session.user.id,
          created_by_user_id: session.user.id,
          updated_by_user_id: session.user.id,
          library_id: imported!.library_id,
          title: source.file_name,
          content: source.extracted_text,
          status: "draft",
          knowledge_type: "document",
        } });
        const provenanceFile = await tx.knowledge_files.create({ data: {
          knowledge_source_id: provenanceSource.id,
          file_name: source.file_name,
          file_type: source.mime_type,
          file_size: source.file_size,
          storage_path: source.storage_path,
          content_hash: source.content_hash,
          extracted_text: source.extracted_text,
          status: "text_ready",
          uploaded_by_user_id: session.user.id,
        } });
        const typeIds = new Map(snapshot.entities.map(entity => [entity.key, entity.id]));
        const relationIds = new Map(snapshot.relations.map(relation => [relation.key, relation.id]));
        const planRows = new Map(plan.rows.map(row => [row.localId, row]));
        const rowIds = new Map<string, string>();
        for (const decision of reconciliation.rows) {
          if (decision.existingId && (decision.action === "reuse" || resolution?.kept.has(decision.localId) || resolution?.updates.has(decision.localId)))
            rowIds.set(decision.localId, decision.existingId);
          if (decision.action !== "create" || resolution?.omitted.has(decision.localId)) continue;
          const row = planRows.get(decision.localId);
          const objectTypeId = typeIds.get(decision.entityKey);
          if (!row || !objectTypeId) throw new Error("Registro sin estructura: " + decision.localId);
          const values = row.values as Prisma.InputJsonValue;
          const created = await tx.engine_records.create({ data: {
            workspace_id: ws, object_type_id: objectTypeId, values_json: values,
            status: "draft", revision: 1,
            created_by_user_id: session.user.id, updated_by_user_id: session.user.id,
          } });
          rowIds.set(decision.localId, created.id);
          await tx.engine_record_revisions.createMany({
            data: [{ workspace_id: ws, record_id: created.id, object_type_id: objectTypeId,
              revision: 1, schema_version: 1, status: "draft", values_json: values,
              changed_by_user_id: session.user.id }],
            skipDuplicates: true,
          });
          await tx.engine_record_provenance.create({ data: {
            workspace_id: ws, record_id: created.id, revision: 1,
            source_locator: "import:" + importId + "/file:" + body.fileId + "/" + decision.localId,
            evidence_text: row.evidence, origin_type: "document",
            knowledge_source_id: provenanceSource.id, knowledge_file_id: provenanceFile.id,
            created_by_user_id: session.user.id,
          } });
        }
        // Update only explicitly approved fields, preserving old values and revisions.
        for (const [localId, change] of resolution?.updates ?? []) {
          const existing = await tx.engine_records.findFirst({
            where: { id: change.existingId, workspace_id: ws, status: { not: "archived" } },
            select: { id: true, object_type_id: true, revision: true },
          });
          if (!existing) throw new Error("Registro actualizado no encontrado: " + localId);
          const nextRevision = existing.revision + 1;
          await tx.engine_records.update({
            where: { id: existing.id },
            data: { values_json: change.values as Prisma.InputJsonValue, revision: nextRevision,
              updated_by_user_id: session.user.id },
          });
          await tx.engine_record_revisions.createMany({
            data: [{ workspace_id: ws, record_id: existing.id, object_type_id: existing.object_type_id,
              revision: nextRevision, schema_version: 1, status: "draft",
              values_json: change.values as Prisma.InputJsonValue,
              changed_by_user_id: session.user.id }],
            skipDuplicates: true,
          });
          await tx.engine_record_provenance.create({ data: {
            workspace_id: ws, record_id: existing.id, revision: nextRevision,
            source_locator: "import:" + importId + "/file:" + body.fileId + "/" + localId,
            evidence_text: change.evidence, origin_type: "document",
            knowledge_source_id: provenanceSource.id, knowledge_file_id: provenanceFile.id,
            created_by_user_id: session.user.id,
          } });
        }
        for (const link of newLinks) {
          const from = rowIds.get(link.fromLocalId);
          const to = rowIds.get(link.toLocalId);
          const relationId = relationIds.get(link.relationKey);
          if (!from || !to || !relationId) throw new Error("Vínculo sin extremos resueltos");
          await tx.engine_record_relations.create({ data: {
            workspace_id: ws, relation_definition_id: relationId,
            from_record_id: from, to_record_id: to,
          } });
        }
        return { structures: 0, fields: 0, relationDefinitions: 0,
          records: newRows.length, links: newLinks.length,
          updatedRecords: resolution?.updates.size ?? 0,
          omittedRecords: resolution?.omitted.size ?? 0,
          reusedRecords: reconciliation.rows.filter(row => row.action === "reuse" || resolution?.kept.has(row.localId)).length,
          reusedLinks: reconciliation.links.filter(link => link.action === "reuse" && !resolution?.omitted.has(link.fromLocalId) && !resolution?.omitted.has(link.toLocalId)).length };
      }
      // Provenance for a document requires a real knowledge_file_id (or
      // knowledge_source_id), not the staging knowledge_import_files UUID.
      // Materialize a linked source and file inside the same transaction so
      // failed imports leave neither orphaned provenance nor source copies.
      const provenanceSource = await tx.knowledge_sources.create({ data: {
        owner_user_id: session.user.id,
        created_by_user_id: session.user.id,
        updated_by_user_id: session.user.id,
        library_id: imported!.library_id,
        title: source.file_name,
        content: source.extracted_text,
        status: "draft",
        knowledge_type: "document",
      } });
      const provenanceFile = await tx.knowledge_files.create({ data: {
        knowledge_source_id: provenanceSource.id,
        file_name: source.file_name,
        file_type: source.mime_type,
        file_size: source.file_size,
        storage_path: source.storage_path,
        content_hash: source.content_hash,
        extracted_text: source.extracted_text,
        status: "text_ready",
        uploaded_by_user_id: session.user.id,
      } });
      const entityIds = new Map<string, string>();
      for (const entity of plan.entities) {
        const created = await tx.engine_object_types.create({ data: {
          workspace_id: ws, key: entity.key, name: entity.key,
          description: "Estructura descubierta en importación documental",
        } });
        entityIds.set(entity.key, created.id);
        for (const [index, field] of entity.fields.entries()) {
          await tx.engine_field_definitions.create({ data: {
            workspace_id: ws, object_type_id: created.id,
            key: field.key, name: field.key, field_type: field.type,
            sort_order: index,
          } });
        }
      }
      const relationIds = new Map<string, string>();
      for (const relation of plan.relations) {
        const from = entityIds.get(relation.fromEntity);
        const to = entityIds.get(relation.toEntity);
        if (!from || !to) throw new Error("Relación con extremos desconocidos");
        const created = await tx.engine_relation_definitions.create({ data: {
          workspace_id: ws, key: relation.key, name: relation.key,
          from_object_type_id: from, to_object_type_id: to,
          cardinality: relation.cardinality, created_by_user_id: session.user.id,
        } });
        relationIds.set(relation.key, created.id);
      }
      const rowIds = new Map<string, string>();
      for (const row of plan.rows) {
        const objectTypeId = entityIds.get(row.entityKey);
        if (!objectTypeId) throw new Error("Estructura no encontrada");
        const values = row.values as Prisma.InputJsonValue;
        const record = await tx.engine_records.create({ data: {
          workspace_id: ws, object_type_id: objectTypeId,
          values_json: values, status: "draft", revision: 1,
          created_by_user_id: session.user.id, updated_by_user_id: session.user.id,
        } });
        rowIds.set(row.localId, record.id);
        // The database may already create revision 1 through an INSERT trigger.
        // Preserve that revision rather than inserting the same (record_id, revision) twice.
        await tx.engine_record_revisions.createMany({
          data: [{
            workspace_id: ws, record_id: record.id, object_type_id: objectTypeId,
            revision: 1, schema_version: 1, status: "draft",
            values_json: values, changed_by_user_id: session.user.id,
          }],
          skipDuplicates: true,
        });
        await tx.engine_record_provenance.create({ data: {
          workspace_id: ws, record_id: record.id, revision: 1,
          source_locator: "import:" + importId + "/file:" + body.fileId + "/" + row.localId,
          evidence_text: row.evidence, origin_type: "document",
          knowledge_source_id: provenanceSource.id, knowledge_file_id: provenanceFile.id,
          created_by_user_id: session.user.id,
        } });
      }
      for (const link of plan.links) {
        const from = rowIds.get(link.fromLocalId);
        const to = rowIds.get(link.toLocalId);
        const relationId = relationIds.get(link.relationKey);
        if (!from || !to || !relationId) throw new Error("Referencia no resuelta");
        await tx.engine_record_relations.create({ data: {
          workspace_id: ws, relation_definition_id: relationId,
          from_record_id: from, to_record_id: to,
        } });
      }
      return { structures: entityIds.size, fields: plan.entities.reduce((n, e) => n + e.fields.length, 0),
        relationDefinitions: relationIds.size, records: rowIds.size, links: plan.links.length };
    }, { timeout: 55000, maxWait: 10000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ ok: true, writesPerformed: true, ...result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error de escritura; transacción revertida" }, { status: 409 });
  }
}
