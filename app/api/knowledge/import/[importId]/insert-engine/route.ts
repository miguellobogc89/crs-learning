import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { validateInsertPlan, type InsertPlan } from "@/lib/engine/ingestion/validate-insert-plan";
import { verifyInsertPlan } from "@/lib/engine/ingestion/signed-insert-plan";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ importId: string }> };
type Payload = { fileId?: string; signature?: string; plan?: InsertPlan; confirm?: boolean };
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
  const plan = body.plan;
  if (!verifyInsertPlan(activeWorkspace.id, importId, body.fileId, plan, body.signature))
    return Response.json({ error: "La propuesta ha cambiado. Repite la simulación." }, { status: 409 });
  const validation = validateInsertPlan(plan);
  if (!validation.ready) return Response.json({ error: "INSERT bloqueado", blockers: validation.blockers }, { status: 409 });
  const imported = await prisma.knowledge_imports.findFirst({
    where: { id: importId, owner_user_id: session.user.id,
      knowledge_libraries: { workspace_id: activeWorkspace.id } },
    select: { knowledge_import_files: { where: { id: body.fileId, status: "text_ready" },
      select: { id: true, extracted_text: true } } },
  });
  const source = imported?.knowledge_import_files[0];
  if (!source) return Response.json({ error: "Documento no disponible" }, { status: 404 });
  if (plan.rows.some(row => !source.extracted_text.includes(row.evidence)) ||
      plan.links.some(link => !source.extracted_text.includes(link.evidence)))
    return Response.json({ error: "Evidencia documental inválida" }, { status: 409 });
  const ws = activeWorkspace.id;
  try {
    const result = await prisma.$transaction(async tx => {
      // First E2E only: do not merge, overwrite or infer identity against existing data.
      // Serializing writes per workspace avoids two simultaneous empty-workspace imports.
      const lock = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${ws})) AS acquired`;
      if (!lock[0]?.acquired) throw new Error("Ya hay una inserción en curso en este workspace.");
      const [types, records, relations] = await Promise.all([
        tx.engine_object_types.count({ where: { workspace_id: ws } }),
        tx.engine_records.count({ where: { workspace_id: ws } }),
        tx.engine_relation_definitions.count({ where: { workspace_id: ws } }),
      ]);
      if (types || records || relations)
        throw new Error("Engine ya contiene datos. La inserción incremental necesita reconciliación de identidades; no se aplicó ningún cambio.");
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
        await tx.engine_record_revisions.create({ data: {
          workspace_id: ws, record_id: record.id, object_type_id: objectTypeId,
          revision: 1, schema_version: 1, status: "draft",
          values_json: values, changed_by_user_id: session.user.id,
        } });
        await tx.engine_record_provenance.create({ data: {
          workspace_id: ws, record_id: record.id, revision: 1,
          source_locator: "import:" + importId + "/file:" + body.fileId + "/" + row.localId,
          evidence_text: row.evidence, origin_type: "document",
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
