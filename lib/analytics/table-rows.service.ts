import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateEngineRecord, EngineRecordError } from "@/lib/engine/records.service";
import { validateEngineRecordValues } from "@/lib/engine/validation";
import { editedCustomValues, editedValues } from "./edit";
import { PLAIN_EDITABLE } from "./compute";
import { BASE_TABLE_TYPES } from "./data";
import { newRecordValues, rowCapabilities, type Revision } from "./table-rows";

/**
 * Row operations of Analítica → Tablas: batch save of corrections, add / delete / restore rows, and a record's
 * history. Every write is a new revision of the record (the database keeps each snapshot), so everything here can
 * be looked back on and undone. Callers check the session; every query is scoped to the workspace.
 */
export class TableRowsError extends Error {}

const asValues = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => { if (typeof v !== "string" || !UUID.test(v)) throw new TableRowsError("Identificador no válido."); return v; };

/** The engine object type behind a table key (base table, table from documents or table from the assistant). */
export async function tableObjectType(workspaceId: string, tableKey: string) {
  let typeKey: string | null = BASE_TABLE_TYPES[tableKey] ?? null;
  if (tableKey.startsWith("plantilla:")) {
    const template = await prisma.intake_templates.findFirst({ where: { id: uuid(tableKey.slice(10)), workspace_id: workspaceId, status: "active" }, select: { object_type_key: true } });
    typeKey = template?.object_type_key ?? null;
  } else if (tableKey.startsWith("tabla:")) typeKey = tableKey.slice(6);
  if (!typeKey) throw new TableRowsError("Tabla no encontrada.");
  const type = await prisma.engine_object_types.findFirst({ where: { workspace_id: workspaceId, key: typeKey, status: "active" },
    select: { id: true, key: true, schema_version: true, settings: true,
      engine_field_definitions: { where: { status: "active" }, select: { key: true, name: true, field_type: true, is_required: true, is_unique: true } } } });
  if (!type || (tableKey.startsWith("tabla:") && asValues(type.settings).origen !== "asistente")) throw new TableRowsError("Tabla no encontrada.");
  return type;
}

/** One cell's new values, with the same rules as the single-cell edit (plain fields, or the few special ones). */
function editedRecord(typeKey: string, settings: unknown, fields: { key: string; field_type: string }[], current: Record<string, unknown>, field: string, value: unknown) {
  const origen = asValues(settings).origen;
  const plain = origen === "asistente" || origen === "plantilla" || PLAIN_EDITABLE[typeKey]?.includes(field);
  return plain ? editedCustomValues(fields, current, field, value) : editedValues(typeKey, current, field, value);
}

export async function editCell(input: { workspaceId: string; userId: string; recordId: string; expectedRevision: number; field: string; value: unknown }) {
  return saveRecordEdits({ ...input, edits: [{ field: input.field, value: input.value }] });
}

/** Several fields of one record in a single new revision. */
async function saveRecordEdits(input: { workspaceId: string; userId: string; recordId: string; expectedRevision: number; edits: { field: string; value: unknown }[] }) {
  const record = await prisma.engine_records.findFirst({ where: { id: uuid(input.recordId), workspace_id: input.workspaceId, status: { not: "archived" } },
    select: { values_json: true, engine_object_types: { select: { key: true, settings: true, engine_field_definitions: { where: { status: "active" }, select: { key: true, field_type: true } } } } } });
  if (!record) throw new TableRowsError("El registro ya no existe.");
  let values = asValues(record.values_json);
  for (const e of input.edits) {
    if (typeof e.field !== "string" || !e.field) throw new TableRowsError("Columna no válida.");
    const t = record.engine_object_types;
    const r = editedRecord(t.key, t.settings, t.engine_field_definitions, values, e.field, e.value);
    if (!r.ok) throw new TableRowsError(r.error);
    values = r.values;
  }
  try {
    await updateEngineRecord({ workspaceId: input.workspaceId, userId: input.userId, recordId: input.recordId,
      expectedRevision: input.expectedRevision, values, membersCanWrite: true });
  } catch (error) {
    if (error instanceof EngineRecordError) throw new TableRowsError(error.message);
    throw error;
  }
}

export type ChangeResult = { recordId: string; ok: true } | { recordId: string; ok: false; error: string };

/**
 * The pending corrections of a table, saved record by record (each record all-or-nothing, one revision each).
 * A record that changed meanwhile or has an invalid value fails alone; the rest are saved.
 */
export async function saveTableChanges(input: { workspaceId: string; userId: string; changes: unknown }): Promise<ChangeResult[]> {
  if (!Array.isArray(input.changes) || !input.changes.length || input.changes.length > 200) throw new TableRowsError("Entre 1 y 200 registros por guardado.");
  const results: ChangeResult[] = [];
  for (const raw of input.changes) {
    const c = asValues(raw);
    const recordId = typeof c.recordId === "string" ? c.recordId : "";
    try {
      const edits = Array.isArray(c.edits) ? c.edits.map(e => asValues(e)).map(e => ({ field: String(e.field ?? ""), value: e.value })) : [];
      if (!edits.length || edits.length > 100) throw new TableRowsError("Cambios no válidos.");
      await saveRecordEdits({ workspaceId: input.workspaceId, userId: input.userId, recordId, expectedRevision: Number(c.expectedRevision), edits });
      results.push({ recordId, ok: true });
    } catch (error) {
      if (!(error instanceof TableRowsError)) console.error("[analytics] guardar cambios:", error);
      results.push({ recordId, ok: false, error: error instanceof TableRowsError ? error.message : "No se pudo guardar." });
    }
  }
  return results;
}

/** A new row typed by the person (or a duplicate of another, already filled in the form). */
export async function addTableRow(input: { workspaceId: string; userId: string; tableKey: string; values: unknown }) {
  if (!rowCapabilities(input.tableKey).add) throw new TableRowsError("En esta tabla no se pueden añadir filas a mano.");
  const type = await tableObjectType(input.workspaceId, input.tableKey);
  if (type.engine_field_definitions.some(f => f.is_unique)) throw new TableRowsError("Esta tabla tiene columnas únicas: añade las filas desde el asistente.");
  const built = newRecordValues(type.engine_field_definitions, asValues(input.values));
  if (!built.ok) throw new TableRowsError(built.error);
  const valid = validateEngineRecordValues(built.values, type.engine_field_definitions);
  if (!valid.ok) throw new TableRowsError(valid.issues.map(i => `${type.engine_field_definitions.find(f => f.key === i.field)?.name ?? i.field}: no válido`).join(" · "));
  const created = await prisma.engine_records.create({ data: { workspace_id: input.workspaceId, object_type_id: type.id, status: "active",
    schema_version: type.schema_version, revision: 1, values_json: valid.values as Prisma.InputJsonObject,
    created_by_user_id: input.userId, updated_by_user_id: input.userId }, select: { id: true } });
  return { id: created.id };
}

function recordsInput(raw: unknown) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 100) throw new TableRowsError("Selecciona entre 1 y 100 filas.");
  return raw.map(r => { const v = asValues(r); const revision = Number(v.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) throw new TableRowsError("Revisión no válida.");
    return { id: uuid(v.id), revision }; });
}

/**
 * Deleting archives: the rows leave the table but keep their history and can be restored. Only rows of this
 * table's own type, and only if nobody changed them meanwhile.
 */
export async function deleteTableRows(input: { workspaceId: string; userId: string; tableKey: string; records: unknown }) {
  if (!rowCapabilities(input.tableKey).remove) throw new TableRowsError("En esta tabla no se pueden eliminar filas.");
  const type = await tableObjectType(input.workspaceId, input.tableKey);
  const records = recordsInput(input.records);
  return prisma.$transaction(async tx => {
    const changed = await tx.engine_records.updateMany({
      where: { workspace_id: input.workspaceId, object_type_id: type.id, status: { in: ["draft", "active"] },
        OR: records.map(r => ({ id: r.id, revision: r.revision })) },
      data: { status: "archived", revision: { increment: 1 }, updated_by_user_id: input.userId, updated_at: new Date() } });
    if (changed.count !== records.length) throw new TableRowsError("Alguna fila ha cambiado o ya no está. Actualiza la tabla.");
    // The document identity is set aside (not lost) so the same document can be imported again; a restore puts it back.
    await tx.$executeRaw`UPDATE engine_records SET external_key = external_key || ${ARCHIVED_KEY} || id::text
      WHERE workspace_id = ${input.workspaceId}::uuid AND id = ANY(${records.map(r => r.id)}::uuid[]) AND external_key IS NOT NULL`;
    return { ids: records.map(r => r.id) };
  });
}
const ARCHIVED_KEY = "#borrada:";

/** «Deshacer» of a deletion: the rows come back as they were (a new revision). */
export async function restoreTableRows(input: { workspaceId: string; userId: string; tableKey: string; ids: unknown }) {
  const type = await tableObjectType(input.workspaceId, input.tableKey);
  if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 100) throw new TableRowsError("Selección no válida.");
  const ids = input.ids.map(uuid);
  return prisma.$transaction(async tx => {
    const rows = await tx.engine_records.findMany({ where: { workspace_id: input.workspaceId, object_type_id: type.id, id: { in: ids }, status: "archived" },
      select: { id: true, external_key: true } });
    for (const r of rows) {
      const original = r.external_key?.endsWith(`${ARCHIVED_KEY}${r.id}`) ? r.external_key.slice(0, -(ARCHIVED_KEY.length + r.id.length)) : r.external_key;
      // If the document was imported again meanwhile, the restored row stays without its identity (no duplicate key).
      const taken = original ? await tx.engine_records.findFirst({ where: { object_type_id: type.id, external_key: original, id: { not: r.id } }, select: { id: true } }) : null;
      await tx.engine_records.update({ where: { id: r.id },
        data: { status: "active", external_key: taken ? null : original, revision: { increment: 1 }, updated_by_user_id: input.userId, updated_at: new Date() } });
    }
    return { restored: rows.length };
  });
}

/** Every stored version of a record, newest first, with who made it. */
export async function recordHistory(input: { workspaceId: string; recordId: string }): Promise<Revision[]> {
  const recordId = uuid(input.recordId);
  const revisions = await prisma.engine_record_revisions.findMany({ where: { workspace_id: input.workspaceId, record_id: recordId },
    orderBy: { revision: "desc" }, take: 50,
    select: { revision: true, status: true, values_json: true, recorded_at: true, users: { select: { name: true, email: true } } } });
  return revisions.map(r => ({ revision: r.revision, status: r.status, values: asValues(r.values_json), at: r.recorded_at.toISOString(),
    by: r.users?.name || r.users?.email || null }));
}

/** Puts back the values of an older version (as a new revision: the newer ones stay in the history). */
export async function restoreRevision(input: { workspaceId: string; userId: string; recordId: string; expectedRevision: number; revision: number }) {
  const recordId = uuid(input.recordId);
  const old = await prisma.engine_record_revisions.findFirst({ where: { workspace_id: input.workspaceId, record_id: recordId, revision: input.revision }, select: { values_json: true } });
  if (!old) throw new TableRowsError("Esa versión no existe.");
  try {
    await updateEngineRecord({ workspaceId: input.workspaceId, userId: input.userId, recordId, expectedRevision: input.expectedRevision,
      values: asValues(old.values_json), membersCanWrite: true });
  } catch (error) {
    if (error instanceof EngineRecordError) throw new TableRowsError(error.message);
    throw error;
  }
}
