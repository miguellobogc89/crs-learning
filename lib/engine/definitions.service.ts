import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EngineFieldType } from "@/lib/engine/validation";

const KEY = /^[a-z][a-z0-9_]*$/;
const FIELD_TYPES = new Set<EngineFieldType>([
  "text", "long_text", "integer", "decimal", "boolean", "date",
  "datetime", "enum", "entity_reference", "record_reference", "json",
]);

export class EngineDefinitionError extends Error {
  constructor(public readonly code: "FORBIDDEN" | "INVALID" | "NOT_FOUND", message: string) {
    super(message);
    this.name = "EngineDefinitionError";
  }
}

async function requireAdmin(tx: Prisma.TransactionClient, workspaceId: string, userId: string) {
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
  if (!workspace || (!isOwner && !["owner", "admin"].includes(role ?? ""))) {
    throw new EngineDefinitionError("FORBIDDEN", "Active workspace owner or admin required.");
  }
}

function checkKey(key: string) {
  if (!KEY.test(key) || key.length > 80) {
    throw new EngineDefinitionError("INVALID", "Keys must be lowercase identifiers of up to 80 characters.");
  }
}

function checkName(name: string) {
  if (!name.trim() || name.length > 160) {
    throw new EngineDefinitionError("INVALID", "Name must contain 1 to 160 characters.");
  }
}

export async function createEngineObjectType(input: {
  workspaceId: string;
  userId: string;
  key: string;
  name: string;
  description?: string;
}) {
  checkKey(input.key);
  checkName(input.name);
  return prisma.$transaction(async (tx) => {
    await requireAdmin(tx, input.workspaceId, input.userId);
    return tx.engine_object_types.create({
      data: {
        workspace_id: input.workspaceId,
        key: input.key,
        name: input.name.trim(),
        description: input.description?.trim() || null,
      },
    });
  });
}

export async function addEngineFieldDefinition(input: {
  workspaceId: string;
  userId: string;
  objectTypeId: string;
  key: string;
  name: string;
  fieldType: EngineFieldType;
  isRequired?: boolean;
  sortOrder?: number;
  configuration?: Record<string, unknown>;
}) {
  checkKey(input.key);
  checkName(input.name);
  if (!FIELD_TYPES.has(input.fieldType)) {
    throw new EngineDefinitionError("INVALID", "Unsupported field type.");
  }
  if (input.sortOrder !== undefined && !Number.isSafeInteger(input.sortOrder)) {
    throw new EngineDefinitionError("INVALID", "Sort order must be an integer.");
  }
  if (input.fieldType === "enum") {
    const options = input.configuration?.options;
    if (!Array.isArray(options) || options.length === 0 ||
        !options.every((v) => typeof v === "string" && v.length > 0) ||
        new Set(options).size !== options.length) {
      throw new EngineDefinitionError("INVALID", "Enum fields require unique nonempty string options.");
    }
  }
  return prisma.$transaction(async (tx) => {
    await requireAdmin(tx, input.workspaceId, input.userId);
    const objectType = await tx.engine_object_types.findFirst({
      where: { id: input.objectTypeId, workspace_id: input.workspaceId, status: "active" },
      select: { id: true },
    });
    if (!objectType) throw new EngineDefinitionError("NOT_FOUND", "Active object type not found.");
    const field = await tx.engine_field_definitions.create({
      data: {
        workspace_id: input.workspaceId,
        object_type_id: objectType.id,
        key: input.key,
        name: input.name.trim(),
        field_type: input.fieldType,
        is_required: input.isRequired ?? false,
        sort_order: input.sortOrder ?? 0,
        configuration: (input.configuration ?? {}) as Prisma.InputJsonObject,
      },
    });
    await tx.engine_object_types.update({
      where: { id: objectType.id },
      data: { schema_version: { increment: 1 }, updated_at: new Date() },
    });
    return field;
  });
}
