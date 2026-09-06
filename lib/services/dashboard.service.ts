import { knowledgeLibraryReadWhere, knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { prisma } from "@/lib/prisma";
import {
  getRecentResourceAccess,
  type ResourceAccessInteraction,
  type ResourceAccessType,
} from "@/lib/services/resource-access.service";
import { formatShortRelativeTime } from "@/lib/utils/relative-time";

export type ContinueWorkingItem = {
  resourceType: ResourceAccessType;
  resourceId: string;
  interactionType: ResourceAccessInteraction;
  title: string;
  subtitle: string;
  href: string;
  lastAccessedAt: Date;
  progressPercent?: number;
};

type GetContinueWorkingItemsInput = {
  userId: string;
  workspaceId: string;
  limit?: number;
};

export async function getContinueWorkingItems({
  userId,
  workspaceId,
  limit = 6,
}: GetContinueWorkingItemsInput): Promise<
  ContinueWorkingItem[]
> {
  const take = Math.min(Math.max(Math.trunc(limit), 1), 6);
  const recentAccess = await getRecentResourceAccess({
    userId,
    workspaceId,
    limit: Math.max(take * 4, 24),
  });

  if (recentAccess.length === 0) {
    return [];
  }

  const idsByType = groupResourceIdsByType(recentAccess);

  const [
    knowledgeSources,
    knowledgeLibraries,
    chatConversations,
    courses,
  ] = await Promise.all([
    idsByType.knowledge_source.length > 0
      ? prisma.knowledge_sources.findMany({
          where: {
            id: {
              in: idsByType.knowledge_source,
            },
            AND: [
              knowledgeSourceReadWhere(userId, workspaceId),
            ],
          },
          select: {
            id: true,
            title: true,
          },
        })
      : [],
    idsByType.knowledge_library.length > 0
      ? prisma.knowledge_libraries.findMany({
          where: {
            id: {
              in: idsByType.knowledge_library,
            },
            AND: [
              knowledgeLibraryReadWhere(userId, workspaceId),
            ],
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [],
    idsByType.chat_conversation.length > 0
      ? prisma.chat_conversations.findMany({
          where: {
            id: {
              in: idsByType.chat_conversation,
            },
            owner_user_id: userId,
            OR: [
              {
                scope_library_id: null,
              },
              {
                knowledge_libraries: {
                  workspace_id: workspaceId,
                },
              },
            ],
          },
          select: {
            id: true,
            title: true,
          },
        })
      : [],
    idsByType.course.length > 0
      ? prisma.courses.findMany({
          where: {
            id: {
              in: idsByType.course,
            },
            knowledge_sources: {
              knowledge_libraries: {
                workspace_id: workspaceId,
              },
            },
          },
          select: {
            id: true,
            title: true,
            user_course_progress: {
              where: {
                user_id: userId,
              },
              select: {
                progress_percent: true,
              },
              take: 1,
            },
          },
        })
      : [],
  ]);

  const sourceById = new Map(
    knowledgeSources.map((source) => [source.id, source]),
  );
  const libraryById = new Map(
    knowledgeLibraries.map((library) => [
      library.id,
      library,
    ]),
  );
  const conversationById = new Map(
    chatConversations.map((conversation) => [
      conversation.id,
      conversation,
    ]),
  );
  const courseById = new Map(
    courses.map((course) => [course.id, course]),
  );

  const items: ContinueWorkingItem[] = [];

  for (const access of recentAccess) {
    if (items.length >= take) {
      break;
    }

    const item = buildContinueWorkingItem({
      access,
      sourceById,
      libraryById,
      conversationById,
      courseById,
    });

    if (item) {
      items.push(item);
    }
  }

  return items;
}

function groupResourceIdsByType(
  recentAccess: Awaited<
    ReturnType<typeof getRecentResourceAccess>
  >,
) {
  const idsByType: Record<ResourceAccessType, string[]> = {
    knowledge_source: [],
    knowledge_library: [],
    chat_conversation: [],
    course: [],
  };

  for (const access of recentAccess) {
    const resourceType =
      access.resource_type as ResourceAccessType;

    if (resourceType in idsByType) {
      idsByType[resourceType].push(access.resource_id);
    }
  }

  return idsByType;
}

function buildContinueWorkingItem({
  access,
  sourceById,
  libraryById,
  conversationById,
  courseById,
}: {
  access: Awaited<
    ReturnType<typeof getRecentResourceAccess>
  >[number];
  sourceById: Map<string, { id: string; title: string }>;
  libraryById: Map<string, { id: string; name: string }>;
  conversationById: Map<string, { id: string; title: string }>;
  courseById: Map<
    string,
    {
      id: string;
      title: string;
      user_course_progress: {
        progress_percent: number;
      }[];
    }
  >;
}): ContinueWorkingItem | null {
  const resourceType =
    access.resource_type as ResourceAccessType;
  const interactionType =
    access.interaction_type as ResourceAccessInteraction;

  if (resourceType === "knowledge_source") {
    const source = sourceById.get(access.resource_id);

    if (!source) {
      return null;
    }

    return {
      resourceType,
      resourceId: source.id,
      interactionType,
      title: source.title,
      subtitle: buildSubtitle({
        area: "Knowledge",
        interactionType,
        lastAccessedAt: access.last_accessed_at,
      }),
      href: `/knowledge/${source.id}`,
      lastAccessedAt: access.last_accessed_at,
    };
  }

  if (resourceType === "knowledge_library") {
    const library = libraryById.get(access.resource_id);

    if (!library) {
      return null;
    }

    return {
      resourceType,
      resourceId: library.id,
      interactionType,
      title: library.name,
      subtitle: buildSubtitle({
        area: "Knowledge",
        interactionType,
        lastAccessedAt: access.last_accessed_at,
      }),
      href: `/knowledge?library=${library.id}`,
      lastAccessedAt: access.last_accessed_at,
    };
  }

  if (resourceType === "chat_conversation") {
    const conversation = conversationById.get(
      access.resource_id,
    );

    if (!conversation) {
      return null;
    }

    return {
      resourceType,
      resourceId: conversation.id,
      interactionType,
      title: conversation.title,
      subtitle: "Asistente · Conversación reciente",
      href: `/assistant/${conversation.id}`,
      lastAccessedAt: access.last_accessed_at,
    };
  }

  if (resourceType === "course") {
    const course = courseById.get(access.resource_id);

    if (!course) {
      return null;
    }

    const progressPercent = clampProgressPercent(
      course.user_course_progress[0]?.progress_percent,
    );

    return {
      resourceType,
      resourceId: course.id,
      interactionType,
      title: course.title,
      subtitle:
        typeof progressPercent === "number"
          ? `Cursos · ${progressPercent} % completado`
          : buildSubtitle({
              area: "Cursos",
              interactionType,
              lastAccessedAt: access.last_accessed_at,
            }),
      href: `/courses/${course.id}`,
      lastAccessedAt: access.last_accessed_at,
      progressPercent,
    };
  }

  return null;
}

function buildSubtitle({
  area,
  interactionType,
  lastAccessedAt,
}: {
  area: string;
  interactionType: ResourceAccessInteraction;
  lastAccessedAt: Date;
}) {
  return `${area} · ${getInteractionLabel(
    interactionType,
  )} ${lowercaseFirst(
    formatShortRelativeTime(lastAccessedAt),
  )}`;
}

function getInteractionLabel(
  interactionType: ResourceAccessInteraction,
) {
  if (interactionType === "edited") {
    return "Editado";
  }

  if (interactionType === "messaged") {
    return "Usado";
  }

  if (interactionType === "progressed") {
    return "Actualizado";
  }

  return "Visto";
}

function lowercaseFirst(value: string) {
  return value
    ? value.charAt(0).toLowerCase() + value.slice(1)
    : value;
}

function clampProgressPercent(
  value: number | undefined,
) {
  if (typeof value !== "number") {
    return undefined;
  }

  return Math.min(Math.max(value, 0), 100);
}
