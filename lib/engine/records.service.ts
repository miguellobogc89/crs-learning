import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateEngineRecordValues } from "@/lib/engine/validation";

export class EngineRecordError extends Error {
  constructor(public readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "UNSUPPORTED" | "CONFLICT", message: string) {
    super(message);
    this.name = "EngineRecordError";
  }
}

async function checkMembership(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  write: boolean,
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
  if (write && !isOwner && !["owner", "admin"].includes(role ?? "")) {
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
      where: { workspace_id: input.workspaceId, object_type_id: objectType.id },
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
 * Replace a draft snapshot using optimistic concurrency.
 * Revisions prevent lost updates; the database captures immutable snapshots.
 */
export async function updateEngineDraftRecord(input: {
  workspaceId: string;
  userId: string;
  recordId: string;
  expectedRevision: number;
  values: unknown;
}) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new EngineRecordError("INVALID", "Expected revision must be a positive integer.");
  }
  return prisma.$transaction(async (tx) => {
    await checkMembership(tx, input.workspaceId, input.userId, true);
    const record = await tx.engine_records.findFirst({
      where: { id: input.recordId, workspace_id: input.workspaceId },
      select: { id: true, object_type_id: true, status: true, revision: true, schema_version: true },
    });
    if (!record) throw new EngineRecordError("NOT_FOUND", "Record not found.");
    if (record.status !== "draft") {
      throw new EngineRecordError("INVALID", "Only draft records can be edited.");
    }
    if (record.revision !== input.expectedRevision) {
      throw new EngineRecordError("CONFLICT", "Record was changed by another operation.");
    }

    const objectType = await tx.engine_object_types.findFirst({
      where: { id: record.object_type_id, workspace_id: input.workspaceId, status: "active" },
      include: { engine_field_definitions: { where: { status: "active" } } },
    });
    if (!objectType) throw new EngineRecordError("NOT_FOUND", "Active object type not found.");
    if (objectType.schema_version !== record.schema_version) {
      throw new EngineRecordError("CONFLICT", "Object definition changed; migration of this record is required.");
    }
    if (objectType.engine_field_definitions.some((field) =>
      field.is_unique || field.field_type === "entity_reference" || field.field_type === "record_reference"
    )) {
      throw new EngineRecordError("UNSUPPORTED", "Unique and reference fields are not yet supported.");
    }
    const validation = validateEngineRecordValues(input.values, objectType.engine_field_definitions);
    if (!validation.ok) throw new EngineRecordError("INVALID", JSON.stringify(validation.issues));

    const changed = await tx.engine_records.updateMany({
      where: {
        id: record.id,
        workspace_id: input.workspaceId,
        object_type_id: objectType.id,
        status: "draft",
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
      throw new EngineRecordError("CONFLICT", "Concurrent update detected.");
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
