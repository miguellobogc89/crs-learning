import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateEngineRecordValues } from "@/lib/engine/validation";
import type { Action } from "./plan";

/**
 * Applies the actions of a plan (computed again just before, against fresh data) in ONE transaction, and returns
 * everything needed to undo them. Records keep their history (every change is a new revision); nothing is
 * physically deleted: rows are archived and tables/columns/links are retired.
 */
export type UndoLog = {
  tipos: string[];
  campos: string[];
  relaciones: { id: string; typeId: string; settingsBefore: Prisma.InputJsonValue }[];
  insertados: string[];
  actualizados: { id: string; antes: Prisma.InputJsonValue }[];
  enlaces: { creados: string[]; quitados: { relationId: string; from: string; to: string }[] };
  borrados: string[];
};
/** What apply needs about the tables that already exist. */
export type ApplyTable = { tableKey: string; typeId: string; typeKey: string };
export type ApplyLink = { from: string; columna: string; relationId: string };

type Tx = Prisma.TransactionClient;
type Field = { key: string; field_type: string; is_required: boolean; status: string; configuration?: unknown };
const asValues = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
const BATCH = 500;

export class ApplyError extends Error {}

/**
 * Engine keys must match ^[a-z][a-z0-9_]*$ (and relation keys ≤ 80 characters): a link's relation is
 * «enlace_<table>_<column>», shortened with a hash when too long.
 */
export function relationKey(typeKey: string, columna: string) {
  const key = `enlace_${typeKey}_${columna}`.replace(/[^a-z0-9_]/g, "_");
  if (key.length <= 80) return key;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${key.slice(0, 70)}_${h.toString(36)}`.slice(0, 80);
}
/** A retired key frees the name for a new table/column/link, keeping the engine's key format. */
export const retiredKey = (key: string, stamp: string, max = 80) => `${key.slice(0, max - stamp.length - 10)}_deshecho_${stamp}`;

export async function applyActions(input: { workspaceId: string; userId: string; actions: Action[]; tables: ApplyTable[]; links: ApplyLink[] }): Promise<UndoLog> {
  const { workspaceId, userId } = input;
  const undo: UndoLog = { tipos: [], campos: [], relaciones: [], insertados: [], actualizados: [], enlaces: { creados: [], quitados: [] }, borrados: [] };
  await prisma.$transaction(async (tx: Tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"assistant-changes:" + workspaceId}))`);
    const typeOf = new Map(input.tables.map(t => [t.tableKey, { id: t.typeId, key: t.typeKey }]));
    const relationOf = new Map(input.links.map(l => [`${l.from}|${l.columna}`, l.relationId]));
    const recordOf = new Map<string, string>();
    const fields = new Map<string, Field[]>();
    const versions = new Map<string, number>();
    const bumped = new Set<string>();
    const type = (tableKey: string) => { const t = typeOf.get(tableKey); if (!t) throw new ApplyError(`La tabla «${tableKey}» ya no existe.`); return t; };
    const ref = (r: string) => r.startsWith("nuevo:") ? recordOf.get(r) ?? (() => { throw new ApplyError("Fila nueva sin crear."); })() : r;
    const fieldsOf = async (typeId: string) => {
      if (!fields.has(typeId)) fields.set(typeId, await tx.engine_field_definitions.findMany({ where: { object_type_id: typeId, status: "active" },
        select: { key: true, field_type: true, is_required: true, status: true, configuration: true } }));
      return fields.get(typeId)!;
    };
    const versionOf = async (typeId: string) => {
      if (!versions.has(typeId)) versions.set(typeId, (await tx.engine_object_types.findUniqueOrThrow({ where: { id: typeId }, select: { schema_version: true } })).schema_version);
      return versions.get(typeId)!;
    };
    const check = async (typeId: string, values: Record<string, unknown>) => {
      const result = validateEngineRecordValues(values, await fieldsOf(typeId));
      if (!result.ok) throw new ApplyError(`Valores no válidos: ${result.issues.map(i => `${i.field} (${i.code})`).join(", ")}`);
      return result.values;
    };

    // Inserts go in batches (with their ids chosen here, so later actions can point at them).
    let pending: { typeId: string; id: string; values: Record<string, unknown> }[] = [];
    const flush = async () => {
      for (let i = 0; i < pending.length; i += BATCH) {
        const chunk = pending.slice(i, i + BATCH);
        await tx.engine_records.createMany({ data: await Promise.all(chunk.map(async p => ({ id: p.id, workspace_id: workspaceId, object_type_id: p.typeId, status: "active",
          values_json: p.values as Prisma.InputJsonObject, schema_version: await versionOf(p.typeId), revision: 1, created_by_user_id: userId, updated_by_user_id: userId }))) });
      }
      pending = [];
    };

    for (const a of input.actions) {
      if (a.k !== "insertar") await flush();
      switch (a.k) {
        case "tabla": {
          const exists = await tx.engine_object_types.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key: a.typeKey } }, select: { id: true } });
          if (exists) throw new ApplyError(`Ya existe una tabla «${a.typeKey}».`);
          const created = await tx.engine_object_types.create({ data: { workspace_id: workspaceId, key: a.typeKey, name: a.nombre, description: a.descripcion || null,
            settings: { origen: "asistente", titulo: a.titulo, enlaces: [], creado_por: userId } } });
          typeOf.set(a.tabla, { id: created.id, key: a.typeKey });
          fields.set(created.id, []); versions.set(created.id, created.schema_version);
          undo.tipos.push(created.id);
          break;
        }
        case "columna": {
          const t = type(a.tabla);
          // A column added to a table that already has rows: the table's version goes up, and its rows with it
          // (they simply have no value in the new column), so they stay editable.
          if (!undo.tipos.includes(t.id) && !bumped.has(t.id)) {
            const next = (await versionOf(t.id)) + 1;
            await tx.engine_object_types.update({ where: { id: t.id }, data: { schema_version: next, updated_at: new Date() } });
            await tx.engine_records.updateMany({ where: { workspace_id: workspaceId, object_type_id: t.id }, data: { schema_version: next } });
            versions.set(t.id, next); bumped.add(t.id);
          }
          const created = await tx.engine_field_definitions.create({ data: { workspace_id: workspaceId, object_type_id: t.id, key: a.key, name: a.nombre, field_type: a.tipo,
            is_required: false, sort_order: a.orden, configuration: { money: a.money, origen: "asistente", ...(a.completar ? { completar: true } : {}) } } });
          (await fieldsOf(t.id)).push({ key: a.key, field_type: a.tipo, is_required: false, status: "active", configuration: { money: a.money } });
          undo.campos.push(created.id);
          break;
        }
        case "enlace": {
          const from = type(a.tabla), to = type(a.destino);
          const key = relationKey(from.key, a.columna);
          const clash = await tx.engine_relation_definitions.findUnique({ where: { workspace_id_key: { workspace_id: workspaceId, key } }, select: { id: true } });
          if (clash) throw new ApplyError(`Ya existe el enlace «${key}».`);
          // Like the catalog's relations: from the linked row (one) to the rows pointing at it (many).
          const created = await tx.engine_relation_definitions.create({ data: { workspace_id: workspaceId, key, name: a.nombre, from_object_type_id: to.id, to_object_type_id: from.id,
            cardinality: "one_to_many", created_by_user_id: userId, description: "Columna de enlace creada con el asistente." } });
          const current = await tx.engine_object_types.findUniqueOrThrow({ where: { id: from.id }, select: { settings: true } });
          const settings = asValues(current.settings);
          const enlaces = Array.isArray(settings.enlaces) ? settings.enlaces : [];
          await tx.engine_object_types.update({ where: { id: from.id }, data: { settings: { ...settings, enlaces: [...enlaces, { columna: a.columna, nombre: a.nombre, relacion: key, destino: a.destino, ...(a.completar ? { completar: true } : {}) }] } as Prisma.InputJsonObject } });
          relationOf.set(`${a.tabla}|${a.columna}`, created.id);
          undo.relaciones.push({ id: created.id, typeId: from.id, settingsBefore: (current.settings ?? {}) as Prisma.InputJsonValue });
          break;
        }
        case "insertar": {
          const t = type(a.tabla);
          const id = randomUUID();
          const values = await check(t.id, Object.fromEntries(Object.entries(a.valores).filter(([, v]) => v !== null)));
          pending.push({ typeId: t.id, id, values });
          recordOf.set(a.ref, id);
          undo.insertados.push(id);
          break;
        }
        case "actualizar": {
          const t = type(a.tabla);
          const record = await tx.engine_records.findFirst({ where: { id: ref(a.ref), workspace_id: workspaceId, object_type_id: t.id, status: { not: "archived" } },
            select: { id: true, values_json: true } });
          if (!record) throw new ApplyError("Una de las filas a cambiar ya no existe.");
          const next = asValues(record.values_json);
          for (const [k, v] of Object.entries(a.valores)) { if (v === null) delete next[k]; else next[k] = v; }
          await tx.engine_records.update({ where: { id: record.id }, data: { values_json: (await check(t.id, next)) as Prisma.InputJsonObject,
            revision: { increment: 1 }, updated_by_user_id: userId, updated_at: new Date() } });
          if (!undo.insertados.includes(record.id) && !undo.actualizados.some(u => u.id === record.id)) undo.actualizados.push({ id: record.id, antes: (record.values_json ?? {}) as Prisma.InputJsonValue });
          break;
        }
        case "enlazar": {
          const relationId = relationOf.get(`${a.tabla}|${a.columna}`);
          if (!relationId) throw new ApplyError(`La columna de enlace «${a.columna}» ya no existe.`);
          const row = ref(a.ref);
          const old = await tx.engine_record_relations.findMany({ where: { workspace_id: workspaceId, relation_definition_id: relationId, to_record_id: row },
            select: { id: true, from_record_id: true } });
          if (old.length) {
            await tx.engine_record_relations.deleteMany({ where: { id: { in: old.map((o: { id: string }) => o.id) } } });
            for (const o of old as { id: string; from_record_id: string }[]) {
              const mine = undo.enlaces.creados.indexOf(o.id);
              if (mine >= 0) undo.enlaces.creados.splice(mine, 1); else undo.enlaces.quitados.push({ relationId, from: o.from_record_id, to: row });
            }
          }
          if (a.destino) {
            const id = randomUUID();
            await tx.engine_record_relations.create({ data: { id, workspace_id: workspaceId, relation_definition_id: relationId, from_record_id: ref(a.destino), to_record_id: row, reviewed_by_user_id: userId } });
            undo.enlaces.creados.push(id);
          }
          break;
        }
        case "borrar": {
          const id = ref(a.ref);
          const changed = await tx.engine_records.updateMany({ where: { id, workspace_id: workspaceId, status: { in: ["draft", "active"] } },
            data: { status: "archived", revision: { increment: 1 }, updated_by_user_id: userId, updated_at: new Date() } });
          if (changed.count !== 1) throw new ApplyError("Una de las filas a borrar ya no existe.");
          if (!undo.insertados.includes(id)) undo.borrados.push(id);
          break;
        }
      }
    }
    await flush();
  }, { timeout: 180_000, maxWait: 15_000 });
  return undo;
}

/** Undoes an applied proposal: rows back as they were (new revisions), links restored, new tables and columns retired. */
export async function undoActions(input: { workspaceId: string; userId: string; undo: UndoLog }) {
  const { workspaceId, userId, undo } = input;
  const stamp = Date.now().toString(36);
  await prisma.$transaction(async (tx: Tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT 1::integer FROM pg_advisory_xact_lock(hashtext(${"assistant-changes:" + workspaceId}))`);
    if (undo.enlaces.creados.length) await tx.engine_record_relations.deleteMany({ where: { workspace_id: workspaceId, id: { in: undo.enlaces.creados } } });
    if (undo.enlaces.quitados.length) await tx.engine_record_relations.createMany({ skipDuplicates: true,
      data: undo.enlaces.quitados.map(l => ({ workspace_id: workspaceId, relation_definition_id: l.relationId, from_record_id: l.from, to_record_id: l.to, reviewed_by_user_id: userId })) });
    if (undo.borrados.length) await tx.engine_records.updateMany({ where: { workspace_id: workspaceId, id: { in: undo.borrados }, status: "archived" },
      data: { status: "active", revision: { increment: 1 }, updated_by_user_id: userId, updated_at: new Date() } });
    for (const u of undo.actualizados) await tx.engine_records.updateMany({ where: { workspace_id: workspaceId, id: u.id },
      data: { values_json: u.antes, revision: { increment: 1 }, updated_by_user_id: userId, updated_at: new Date() } });
    if (undo.insertados.length) await tx.engine_records.updateMany({ where: { workspace_id: workspaceId, id: { in: undo.insertados }, status: { not: "archived" } },
      data: { status: "archived", revision: { increment: 1 }, updated_by_user_id: userId, updated_at: new Date() } });
    for (const r of [...undo.relaciones].reverse()) {
      await tx.engine_object_types.update({ where: { id: r.typeId }, data: { settings: r.settingsBefore } });
      const def = await tx.engine_relation_definitions.findUnique({ where: { id: r.id }, select: { key: true } });
      if (def) await tx.engine_relation_definitions.update({ where: { id: r.id }, data: { status: "archived", key: retiredKey(def.key, stamp) } });
    }
    for (const id of undo.campos) {
      const f = await tx.engine_field_definitions.findUnique({ where: { id }, select: { key: true } });
      if (f) await tx.engine_field_definitions.update({ where: { id }, data: { status: "archived", key: retiredKey(f.key, stamp) } });
    }
    for (const id of undo.tipos) {
      const t = await tx.engine_object_types.findUnique({ where: { id }, select: { key: true } });
      if (t) await tx.engine_object_types.update({ where: { id }, data: { status: "archived", key: retiredKey(t.key, stamp) } });
    }
  }, { timeout: 180_000, maxWait: 15_000 });
}
