import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateEngineRecordValues } from "@/lib/engine/validation";

export class EngineRecordError extends Error {
  constructor(public readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "UNSUPPORTED", message: string) {
    super(message);
    this.name = "EngineRecordError";
  }
}

async function checkMembership(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  write: boolean,
) {
  const member = await tx.organization_members.findUnique({
    where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
    select: { status: true, role: true, organizations: { select: { status: true } } },
  });
  if (!member || member.status !== "active" || member.organizations.status !== "active") {
    throw new EngineRecordError("FORBIDDEN", "Active organization membership required.");
  }
  if (write && !["owner", "admin"].includes(member.role)) {
    throw new EngineRecordError("FORBIDDEN", "Owner or admin role required for writes.");
  }
}

export async function listEngineObjectTypes(organizationId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await checkMembership(tx, organizationId, userId, false);
    return tx.engine_object_types.findMany({
      where: { organization_id: organizationId, status: "active" },
      include: { engine_field_definitions: { where: { status: "active" }, orderBy: { sort_order: "asc" } } },
      orderBy: { name: "asc" },
    });
  });
}

export async function listEngineRecords(input: {
  organizationId: string;
  userId: string;
  objectTypeId: string;
  take?: number;
}) {
  return prisma.$transaction(async (tx) => {
    await checkMembership(tx, input.organizationId, input.userId, false);
    const objectType = await tx.engine_object_types.findFirst({
      where: { id: input.objectTypeId, organization_id: input.organizationId, status: "active" },
      select: { id: true },
    });
    if (!objectType) throw new EngineRecordError("NOT_FOUND", "Object type not found.");
    const take = Number.isFinite(input.take) ? Math.min(100, Math.max(1, Math.trunc(input.take!))) : 50;
    return tx.engine_records.findMany({
      where: { organization_id: input.organizationId, object_type_id: objectType.id },
      orderBy: { created_at: "desc" },
      take,
    });
  });
}

/** Draft-only: publishing and editing require history and version controls. */
export async function createEngineDraftRecord(input: {
  organizationId: string;
  userId: string;
  objectTypeId: string;
  values: unknown;
  externalKey?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await checkMembership(tx, input.organizationId, input.userId, true);
    const objectType = await tx.engine_object_types.findFirst({
      where: { id: input.objectTypeId, organization_id: input.organizationId, status: "active" },
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
        organization_id: input.organizationId,
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
