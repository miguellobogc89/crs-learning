import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateEngineRecordValues } from "@/lib/engine/validation";

export class EngineRecordError extends Error {
  constructor(public readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "UNSUPPORTED" | "CONFLICT", message: string) {
    super(message);
    this.name = "EngineRecordError";
  }
}

/** `write`: false = read; true = owner/admin; "member" = any active member (table corrections from Analítica). */
async function checkMembership(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  write: boolean | "member",
) {
  const workspace = await tx.workspaces.findFirst({
    where: { id: workspaceId, status: "active" },
    select: {
      owner_user_id: true,
      workspace_members: {
        where: { user_id: userId, status: "active" },
        select: { role: true },
      },
    },
  });
  const isOwner = workspace?.owner_user_id === userId;
  const role = workspace?.workspace_members[0]?.role;
  if (!workspace || (!isOwner && !role)) {
    throw new EngineRecordError("FORBIDDEN", "Active workspace membership required.");
  }
  if (write === true && !isOwner && !["owner", "admin"].includes(role ?? "")) {
    throw new EngineRecordError("FORBIDDEN", "Workspace owner or admin required for writes.");
  }
}

export async function listEngineObjectTypes(workspaceId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await checkMembership(tx, workspaceId, userId, false);
    return tx.engine_object_types.findMany({
      where: { workspace_id: workspaceId, status: "active" },
      include: { engine_field_definitions: { where: { status: "active" }, orderBy: { sort_order: "asc" } } },
      orderBy: { name: "asc" },
    });
  });
}

export async function listEngineRecords(input: {
  workspaceId: string;
  userId: string;
  objectTypeId: string;
  take?: number;
}) {
  return prisma.$transaction(async (tx) => {
    await checkMembership(tx, input.workspaceId, input.userId, false);
    const objectType = await tx.engine_object_types.findFirst({
      where: { id: input.objectTypeId, workspace_id: input.workspaceId, status: "active" },
      select: { id: true },
    });
    if (!objectType) throw new EngineRecordError("NOT_FOUND", "Object type not found.");
    const take = Number.isFinite(input.take) ? Math.min(100, Math.max(1, Math.trunc(input.take!))) : 50;
    return tx.engine_records.findMany({
      where: { workspace_id: input.workspaceId, object_type_id: objectType.id, status: { not: "archived" } },
      orderBy: { created_at: "desc" },
      take,
    });
  });
}

/** Draft-only: publishing requires a separate reviewed workflow. */
export async function createEngineDraftRecord(input: {
  workspaceId: string;
  userId: string;
  objectTypeId: string;
  values: unknown;
  externalKey?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await checkMembership(tx, input.workspaceId, input.userId, true);
    const objectType = await tx.engine_object_types.findFirst({
      where: { id: input.objectTypeId, workspace_id: input.workspaceId, status: "active" },
      include: { engine_field_definitions: { where: { status: "active" } } },
    });
    if (!objectType) throw new EngineRecordError("NOT_FOUND", "Object type not found.");
    if (objectType.engine_field_definitions.some((field) =>
      field.is_unique || field.field_type === "entity_reference" || field.field_type === "record_reference"
    )) {
      throw new EngineRecordError("UNSUPPORTED", "Unique and reference fields are not yet supported.");
    }
    const validation = validateEngineRecordValues(input.values, objectType.engine_field_definitions);
    if (!validation.ok) throw new EngineRecordError("INVALID", JSON.stringify(validation.issues));
    return tx.engine_records.create({
      data: {
        workspace_id: input.workspaceId,
        object_type_id: objectType.id,
        external_key: input.externalKey?.trim() || null,
        status: "draft",
        schema_version: objectType.schema_version,
        revision: 1,
        values_json: validation.values as Prisma.InputJsonObject,
        created_by_user_id: input.userId,
        updated_by_user_id: input.userId,
      },
    });
  });
}

/**
 * Replace a record snapshot using optimistic concurrency.
 * Revisions prevent lost updates; the database captures immutable snapshots.
 */
export async function updateEngineRecord(input: {
  workspaceId: string;
  userId: string;
  recordId: string;
  expectedRevision: number;
  values: unknown;
  draftOnly?: boolean;
  /** Any active member may write (otherwise owner/admin only). */
  membersCanWrite?: boolean;
}) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new EngineRecordError("INVALID", "La revisión del registro no es válida.");
  }
  return prisma.$transaction(async (tx) => {
    await checkMembership(tx, input.workspaceId, input.userId, input.membersCanWrite ? "member" : true);
    const record = await tx.engine_records.findFirst({
      where: { id: input.recordId, workspace_id: input.workspaceId },
      select: { id: true, object_type_id: true, status: true, revision: true, schema_version: true, values_json: true },
    });
    if (!record) throw new EngineRecordError("NOT_FOUND", "Record not found.");
    if (record.status === "archived" || (input.draftOnly && record.status !== "draft")) {
      throw new EngineRecordError("INVALID", "El registro no admite edición en su estado actual.");
    }
    if (record.revision !== input.expectedRevision) {
      throw new EngineRecordError("CONFLICT", "El registro ha cambiado. Actualiza la tabla antes de guardar.");
    }

    const objectType = await tx.engine_object_types.findFirst({
      where: { id: record.object_type_id, workspace_id: input.workspaceId, status: "active" },
      include: { engine_field_definitions: { where: { status: "active" } } },
    });
    if (!objectType) throw new EngineRecordError("NOT_FOUND", "Active object type not found.");
    if (objectType.schema_version !== record.schema_version) {
      throw new EngineRecordError("CONFLICT", "La definición de la tabla ha cambiado. Este registro debe migrarse antes de editarlo.");
    }
    const previous = record.values_json as Record<string, unknown>;
    const next = input.values && typeof input.values === "object" && !Array.isArray(input.values)
      ? input.values as Record<string, unknown> : {};
    if (objectType.engine_field_definitions.some(field =>
      (field.is_unique || ["entity_reference", "record_reference"].includes(field.field_type)) &&
      JSON.stringify(previous[field.key]) !== JSON.stringify(next[field.key])
    )) throw new EngineRecordError("UNSUPPORTED", "Los campos únicos y las referencias requieren una revisión específica.");
    const validation = validateEngineRecordValues(input.values, objectType.engine_field_definitions);
    if (!validation.ok) {
      const labels = new Map(objectType.engine_field_definitions.map(field => [field.key, field.name]));
      const descriptions = { required: "es obligatorio", invalid_type: "tiene un valor no válido",
        invalid_option: "no es una opción permitida", unknown_field: "no está definido en esta tabla",
        unsupported_type: "no admite este tipo de edición" };
      throw new EngineRecordError("INVALID", validation.issues.map(issue =>
        `${labels.get(issue.field) ?? issue.field}: ${descriptions[issue.code]}`).join(" · "));
    }

    const changed = await tx.engine_records.updateMany({
      where: {
        id: record.id,
        workspace_id: input.workspaceId,
        object_type_id: objectType.id,
        status: record.status,
        revision: input.expectedRevision,
        schema_version: objectType.schema_version,
      },
      data: {
        values_json: validation.values as Prisma.InputJsonObject,
        revision: { increment: 1 },
        updated_by_user_id: input.userId,
        updated_at: new Date(),
      },
    });
    if (changed.count !== 1) {
      throw new EngineRecordError("CONFLICT", "Otro proceso ha cambiado el registro. Actualiza la tabla.");
    }
    return tx.engine_records.findFirstOrThrow({
      where: { id: record.id, workspace_id: input.workspaceId },
    });
  });
}

/** Returns the stored snapshots of a record, newest revision first. */
export async function listEngineRecordHistory(input: {
  workspaceId: string;
  userId: string;
  recordId: string;
  take?: number;
}) {
  return prisma.$transaction(async (tx) => {
    await checkMembership(tx, input.workspaceId, input.userId, false);
    const record = await tx.engine_records.findFirst({
      where: { id: input.recordId, workspace_id: input.workspaceId },
      select: { id: true },
    });
    if (!record) throw new EngineRecordError("NOT_FOUND", "Record not found.");
    const take = Number.isFinite(input.take)
      ? Math.min(100, Math.max(1, Math.trunc(input.take!)))
      : 50;
    return tx.engine_record_revisions.findMany({
      where: { workspace_id: input.workspaceId, record_id: record.id },
      orderBy: { revision: "desc" },
      take,
    });
  });
}

/** Preserve the original draft-only contract for API consumers. */
export async function updateEngineDraftRecord(input: Parameters<typeof updateEngineRecord>[0]) {
  return updateEngineRecord({ ...input, draftOnly: true });
}

/** Logical deletion preserves immutable history and frees the external identity for reimport. */
export async function deleteEngineRecords(input: {
  workspaceId: string; userId: string; records: Array<{ id: string; revision: number }>;
}) {
  if (!Array.isArray(input.records) || !input.records.length || input.records.length > 100 ||
    new Set(input.records.map(record => record?.id)).size !== input.records.length ||
    input.records.some(record => !record || typeof record.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(record.id) || !Number.isSafeInteger(record.revision) || record.revision < 1)) {
    throw new EngineRecordError("INVALID", "Selecciona entre 1 y 100 registros válidos.");
  }
  return prisma.$transaction(async tx => {
    await checkMembership(tx, input.workspaceId, input.userId, true);
    const changed = await tx.engine_records.updateMany({
      where: { workspace_id: input.workspaceId, status: { in: ["draft", "active"] },
        OR: input.records.map(record => ({ id: record.id, revision: record.revision })) },
      data: { status: "archived", external_key: null, revision: { increment: 1 },
        updated_by_user_id: input.userId, updated_at: new Date() },
    });
    if (changed.count !== input.records.length) {
      throw new EngineRecordError("CONFLICT", "Un registro ha cambiado o ya no está disponible. Actualiza la tabla.");
    }
    return { deleted: input.records.length };
  }, { timeout: 20000 });
}
