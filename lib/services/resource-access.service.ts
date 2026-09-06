import { prisma } from "@/lib/prisma";

export const RESOURCE_ACCESS_TYPES = [
  "knowledge_source",
  "knowledge_library",
  "chat_conversation",
  "course",
] as const;

export const RESOURCE_ACCESS_INTERACTIONS = [
  "viewed",
  "edited",
  "messaged",
  "progressed",
] as const;

export type ResourceAccessType =
  (typeof RESOURCE_ACCESS_TYPES)[number];

export type ResourceAccessInteraction =
  (typeof RESOURCE_ACCESS_INTERACTIONS)[number];

type RecordResourceAccessInput = {
  userId: string;
  workspaceId: string;
  resourceType: ResourceAccessType;
  resourceId: string;
  interactionType: ResourceAccessInteraction;
};

type GetRecentResourceAccessInput = {
  userId: string;
  workspaceId: string;
  limit?: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function isResourceAccessType(
  value: string,
): value is ResourceAccessType {
  return RESOURCE_ACCESS_TYPES.includes(
    value as ResourceAccessType,
  );
}

function isResourceAccessInteraction(
  value: string,
): value is ResourceAccessInteraction {
  return RESOURCE_ACCESS_INTERACTIONS.includes(
    value as ResourceAccessInteraction,
  );
}

function canTrackResourceAccess(
  input: RecordResourceAccessInput,
) {
  return (
    isUuid(input.userId) &&
    isUuid(input.workspaceId) &&
    isUuid(input.resourceId) &&
    isResourceAccessType(input.resourceType) &&
    isResourceAccessInteraction(input.interactionType)
  );
}

export async function recordResourceAccess(
  input: RecordResourceAccessInput,
) {
  try {
    if (!canTrackResourceAccess(input)) {
      console.warn(
        "[resource-access] Skipping invalid access event",
        {
          resourceType: input.resourceType,
          interactionType: input.interactionType,
        },
      );

      return null;
    }

    const now = new Date();

    return await prisma.user_resource_access.upsert({
      where: {
        user_id_workspace_id_resource_type_resource_id:
          {
            user_id: input.userId,
            workspace_id: input.workspaceId,
            resource_type: input.resourceType,
            resource_id: input.resourceId,
          },
      },
      update: {
        interaction_type: input.interactionType,
        last_accessed_at: now,
      },
      create: {
        user_id: input.userId,
        workspace_id: input.workspaceId,
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        interaction_type: input.interactionType,
        last_accessed_at: now,
      },
    });
  } catch (error) {
    console.error(
      "[resource-access] Failed to record access",
      error,
    );

    return null;
  }
}

export async function getRecentResourceAccess({
  userId,
  workspaceId,
  limit = 6,
}: GetRecentResourceAccessInput) {
  try {
    if (!isUuid(userId) || !isUuid(workspaceId)) {
      console.warn(
        "[resource-access] Skipping invalid recent access query",
      );

      return [];
    }

    const normalizedLimit = Number.isFinite(limit)
      ? Math.trunc(limit)
      : 6;
    const take = Math.min(Math.max(normalizedLimit, 1), 50);

    return await prisma.user_resource_access.findMany({
      where: {
        user_id: userId,
        workspace_id: workspaceId,
      },
      orderBy: {
        last_accessed_at: "desc",
      },
      take,
    });
  } catch (error) {
    console.error(
      "[resource-access] Failed to read recent access",
      error,
    );

    return [];
  }
}
