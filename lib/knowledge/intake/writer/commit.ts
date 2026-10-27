import { Prisma } from "@prisma/client";
import type { PlannedRecord, WritePlan } from "./plan";

/**
 * Writes a reviewed write plan in ONE transaction: binds the global catalog types and relations the plan uses to the
 * workspace (local table, fields, binding, relation definitions), creates the new records with a first revision and
 * the printed evidence of every value, reuses existing ones, and creates the relations. Records are matched by
 * external key inside the transaction too, so a concurrent or repeated save never duplicates a master record.
 * Nothing existing is modified. Fails as a whole if anything does not fit (no partial writes).
 */
export type WriteResult = {
  module: "record_writer"; version: number; loteId: string;
  resumen: { creados: number; reutilizados: number; relaciones: number; evidencias: number; omitidos: number };
  registros: { ref: string; tipo: string; registroId: string; accion: "creado" | "reutilizado" }[];
  relaciones: { relacion: string; desde: string; hacia: string; creada: boolean }[];
};

type Tx = Prisma.TransactionClient;

async function bindType(tx: Tx, workspaceId: string, key: string) {
  await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"engine-catalog-type:" + key}))`);
  const catalog = await tx.engine_catalog_types.findUnique({ where: { key } });
  if (!catalog || catalog.status !== "active") throw new Error(`El catálogo global no tiene el tipo «${key}»`);
  const version = await tx.engine_catalog_type_versions.findFirst({ where: { type_id: catalog.id, status: "published" }, orderBy: { version: "desc" },
    include: { engine_catalog_fields: { where: { status: "active" } } } });
  if (!version) throw new Error(`El tipo «${key}» no tiene versión publicada`);
  let local = await tx.engine_object_types.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key } }, include: { engine_field_definitions: true } });
  if (local && local.status !== "active") throw new Error(`La tabla «${key}» del espacio de trabajo no está activa`);
  if (!local) {
    const created = await tx.engine_object_types.create({ data: { workspace_id: workspaceId, key, name: catalog.name, description: catalog.description } });
    local = await tx.engine_object_types.findUniqueOrThrow({ where: { id: created.id }, include: { engine_field_definitions: true } });
  }
  const existing = new Map<string, { field_type: string; status: string }>(local.engine_field_definitions.map((f: { key: string; field_type: string; status: string }) => [f.key, f]));
  let added = false;
  for (const field of version.engine_catalog_fields) {
    const current = existing.get(field.key);
    if (current) {
      if (current.field_type !== field.field_type || current.status !== "active") throw new Error(`Campo incompatible: ${key}.${field.key}`);
      continue;
    }
    // Optional for every record: requiredness is a catalog rule checked on review, never retroactive.
    await tx.engine_field_definitions.create({ data: { workspace_id: workspaceId, object_type_id: local.id, key: field.key, name: field.name,
      field_type: field.field_type, is_required: false, configuration: (field.configuration ?? {}) as Prisma.InputJsonObject, sort_order: field.sort_order } });
    added = true;
  }
  if (added && local.engine_field_definitions.length) await tx.engine_object_types.update({ where: { id: local.id }, data: { schema_version: { increment: 1 }, updated_at: new Date() } });
  const binding = await tx.engine_workspace_catalog_bindings.findUnique({ where: { workspace_id_catalog_type_id: { workspace_id: workspaceId, catalog_type_id: catalog.id } } });
  if (binding && (binding.status !== "active" || (binding.local_object_type_id && binding.local_object_type_id !== local.id) || binding.catalog_version > version.version))
    throw new Error(`Vinculación de catálogo incompatible: ${key}`);
  if (!binding) await tx.engine_workspace_catalog_bindings.create({ data: { workspace_id: workspaceId, catalog_type_id: catalog.id, catalog_version: version.version, local_object_type_id: local.id } });
  else if (binding.catalog_version !== version.version || !binding.local_object_type_id)
    await tx.engine_workspace_catalog_bindings.update({ where: { id: binding.id }, data: { catalog_version: version.version, local_object_type_id: local.id, updated_at: new Date() } });
  return tx.engine_object_types.findUniqueOrThrow({ where: { id: local.id } });
}

async function bindRelation(tx: Tx, workspaceId: string, userId: string, key: string, types: Map<string, { id: string; key: string }>) {
  const global = await tx.engine_catalog_relations.findFirst({ where: { key, status: "active" }, orderBy: { version: "desc" },
    include: { engine_catalog_types_engine_catalog_relations_from_type_idToengine_catalog_types: true, engine_catalog_types_engine_catalog_relations_to_type_idToengine_catalog_types: true } });
  if (!global) throw new Error(`El catálogo global no tiene la relación «${key}»`);
  const fromKey = global.engine_catalog_types_engine_catalog_relations_from_type_idToengine_catalog_types.key;
  const toKey = global.engine_catalog_types_engine_catalog_relations_to_type_idToengine_catalog_types.key;
  const from = types.get(fromKey), to = types.get(toKey);
  if (!from || !to) throw new Error(`La relación «${key}» une ${fromKey} y ${toKey}, que el lote no usa`);
  const existing = await tx.engine_relation_definitions.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key } } });
  if (existing) {
    if (existing.status !== "active" || existing.from_object_type_id !== from.id || existing.to_object_type_id !== to.id || existing.cardinality !== global.cardinality)
      throw new Error(`Relación existente incompatible en el espacio de trabajo: ${key}`);
    return { ...existing, fromKey, toKey };
  }
  const created = await tx.engine_relation_definitions.create({ data: { workspace_id: workspaceId, key, name: global.name, description: global.description,
    from_object_type_id: from.id, to_object_type_id: to.id, cardinality: global.cardinality, created_by_user_id: userId } });
  return { ...created, fromKey, toKey };
}

export async function commitWritePlan(tx: Tx, input: { workspaceId: string; userId: string; batchId: string; plan: WritePlan; revision: number }): Promise<WriteResult> {
  const { workspaceId, userId, batchId, plan } = input;
  const blocked = plan.registros.filter(r => r.accion === "bloqueado");
  if (blocked.length) throw new Error(`Hay ${blocked.length} registro(s) pendientes de decisión`);
  const toWrite = plan.registros.filter(r => r.accion === "crear" || r.accion === "reutilizar");
  // Workspace-level locking: one save at a time per workspace, also across app instances.
  await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"engine-intake-write:" + workspaceId}))`);

  const types = new Map<string, Awaited<ReturnType<typeof bindType>>>();
  for (const key of [...new Set(toWrite.map(r => r.tipo))].sort()) types.set(key, await bindType(tx, workspaceId, key));

  const ids = new Map<string, string>();
  const result: WriteResult = { module: "record_writer", version: input.revision, loteId: batchId, registros: [], relaciones: [],
    resumen: { creados: 0, reutilizados: 0, relaciones: 0, evidencias: 0, omitidos: plan.registros.length - toWrite.length } };
  // Masters first, then invoices, then their details (so every relation endpoint exists).
  const order = (r: PlannedRecord) => r.padre ? 2 : r.tipo === "invoice" ? 1 : 0;
  for (const record of [...toWrite].sort((a, b) => order(a) - order(b))) {
    const type = types.get(record.tipo)!;
    if (record.accion === "reutilizar") {
      const existing = await tx.engine_records.findFirst({ where: { id: record.registroId, workspace_id: workspaceId, object_type_id: type.id, status: { not: "archived" } }, select: { id: true } });
      if (!existing) throw new Error(`El registro existente de ${record.ref} ya no está disponible`);
      ids.set(record.ref, existing.id);
      result.registros.push({ ref: record.ref, tipo: record.tipo, registroId: existing.id, accion: "reutilizado" });
      result.resumen.reutilizados++;
      continue;
    }
    const again = record.claveExterna ? await tx.engine_records.findFirst({ where: { workspace_id: workspaceId, object_type_id: type.id, external_key: record.claveExterna, status: { not: "archived" } }, select: { id: true } }) : null;
    if (again) {
      ids.set(record.ref, again.id);
      result.registros.push({ ref: record.ref, tipo: record.tipo, registroId: again.id, accion: "reutilizado" });
      result.resumen.reutilizados++;
      continue;
    }
    const values = record.valores as Prisma.InputJsonObject;
    const created = await tx.engine_records.create({ data: { workspace_id: workspaceId, object_type_id: type.id, external_key: record.claveExterna,
      values_json: values, status: "draft", revision: 1, schema_version: type.schema_version, created_by_user_id: userId, updated_by_user_id: userId } });
    // The database may already snapshot revision 1 with a trigger: write it only if it is not there.
    await tx.engine_record_revisions.createMany({ data: [{ workspace_id: workspaceId, record_id: created.id, object_type_id: type.id, revision: 1,
      schema_version: type.schema_version, status: created.status, values_json: values, changed_by_user_id: userId }], skipDuplicates: true });
    // The printed text of every value, where it was read and how it was converted.
    if (record.evidencias.length) await tx.engine_record_provenance.createMany({ data: record.evidencias.map(ev => ({ workspace_id: workspaceId, record_id: created.id,
      revision: 1, field_key: ev.campo, source_locator: `intake:${batchId}/${ev.archivoId}${ev.pagina ? `/p${ev.pagina}` : ""}/${ev.origen}`,
      evidence_text: `${ev.impreso}${ev.inferido ? ` (${ev.inferido})` : ""} · ${ev.archivo}`,
      // "document" requires a Knowledge file; the originals are still files of the intake batch, so the evidence is
      // recorded as coming from the intake pipeline, with the batch file, page and field in the locator.
      origin_type: "integration", created_by_user_id: userId })) });
    result.resumen.evidencias += record.evidencias.length;
    ids.set(record.ref, created.id);
    result.registros.push({ ref: record.ref, tipo: record.tipo, registroId: created.id, accion: "creado" });
    result.resumen.creados++;
  }

  const definitions = new Map<string, Awaited<ReturnType<typeof bindRelation>>>();
  for (const link of plan.relaciones) {
    const from = ids.get(link.desde), to = ids.get(link.hacia);
    if (!from || !to) continue;
    let definition = definitions.get(link.relacion);
    if (!definition) { definition = await bindRelation(tx, workspaceId, userId, link.relacion, new Map([...types].map(([k, t]) => [k, { id: t.id, key: k }]))); definitions.set(link.relacion, definition); }
    const existing = await tx.engine_record_relations.findFirst({ where: { workspace_id: workspaceId, relation_definition_id: definition.id, from_record_id: from, to_record_id: to }, select: { id: true } });
    if (!existing) {
      if (definition.cardinality !== "many_to_many") {
        // one_to_many: the owned record has a single owner (an invoice has one issuer).
        const taken = await tx.engine_record_relations.findFirst({ where: { workspace_id: workspaceId, relation_definition_id: definition.id, to_record_id: to, from_record_id: { not: from } }, select: { id: true } });
        if (taken) throw new Error(`«${link.hacia}» ya tiene otro ${link.relacion}`);
      }
      await tx.engine_record_relations.create({ data: { workspace_id: workspaceId, relation_definition_id: definition.id, from_record_id: from, to_record_id: to, reviewed_by_user_id: userId } });
      result.resumen.relaciones++;
    }
    result.relaciones.push({ relacion: link.relacion, desde: link.desde, hacia: link.hacia, creada: !existing });
  }
  return result;
}
