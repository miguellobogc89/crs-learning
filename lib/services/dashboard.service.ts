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

export type DashboardRecentActivityType =
  | "knowledge.import.completed"
  | "knowledge.file.uploaded"
  | "knowledge.article.created"
  | "knowledge.article.updated"
  | "knowledge.folder.created";

export type DashboardRecentActivityItem = {
  id: string;
  type: DashboardRecentActivityType;
  actorUserId: string;
  actorName: string;
  actorImage?: string | null;
  title: string;
  description?: string | null;
  href?: string;
  occurredAt: Date;
  isCurrentUser: boolean;
};

type GetContinueWorkingItemsInput = {
  userId: string;
  workspaceId: string;
  limit?: number;
};

type GetDashboardRecentActivityInput = {
  userId: string;
  workspaceId: string;
  limit?: number;
};

type ActivityActor = {
  id: string;
  name: string | null;
  email?: string | null;
  image: string | null;
};

type ImportEventMetadata = {
  summary?: {
    documentsCreated?: number;
  };
  targetLibrary?: {
    name?: string;
  };
  folders?: Array<{
    databaseFolderId?: string;
  }>;
  articles?: Array<{
    databaseArticleId?: string;
  }>;
  documents?: Array<{
    knowledgeFileId?: string;
  }>;
};

export async function getContinueWorkingItems({
  userId,
  workspaceId,
  limit = 6,
}: GetContinueWorkingItemsInput): Promise<
  ContinueWorkingItem[]
> {
  const normalizedLimit = Number.isFinite(limit)
    ? Math.trunc(limit)
    : 6;
  const take = Math.min(Math.max(normalizedLimit, 1), 20);
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

export async function getDashboardRecentActivity({
  userId,
  workspaceId,
  limit = 12,
}: GetDashboardRecentActivityInput): Promise<
  DashboardRecentActivityItem[]
> {
  const normalizedLimit = Number.isFinite(limit)
    ? Math.trunc(limit)
    : 12;
  const take = Math.min(Math.max(normalizedLimit, 1), 15);
  const queryLimit = 20;

  const [
    importEvents,
    uploadedFiles,
    createdArticles,
    updatedArticleCandidates,
    createdFolders,
  ] = await Promise.all([
    prisma.knowledge_events.findMany({
      where: {
        action: "knowledge.import.completed",
        knowledge_libraries: knowledgeLibraryReadWhere(
          userId,
          workspaceId,
        ),
      },
      orderBy: {
        created_at: "desc",
      },
      take: queryLimit,
      select: {
        id: true,
        action: true,
        title: true,
        description: true,
        metadata: true,
        created_at: true,
        user_id: true,
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        knowledge_libraries: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.knowledge_files.findMany({
      where: {
        uploaded_by_user_id: {
          not: null,
        },
        knowledge_sources: knowledgeSourceReadWhere(
          userId,
          workspaceId,
        ),
      },
      orderBy: {
        created_at: "desc",
      },
      take: queryLimit,
      select: {
        id: true,
        file_name: true,
        created_at: true,
        uploaded_by_user_id: true,
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        knowledge_sources: {
          select: {
            id: true,
          },
        },
      },
    }),
    prisma.knowledge_sources.findMany({
      where: {
        created_by_user_id: {
          not: null,
        },
        AND: [knowledgeSourceReadWhere(userId, workspaceId)],
      },
      orderBy: {
        created_at: "desc",
      },
      take: queryLimit,
      select: {
        id: true,
        title: true,
        created_at: true,
        created_by_user_id: true,
        users_knowledge_sources_created_by_user_idTousers: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    }),
    prisma.knowledge_sources.findMany({
      where: {
        updated_by_user_id: {
          not: null,
        },
        AND: [knowledgeSourceReadWhere(userId, workspaceId)],
      },
      orderBy: {
        updated_at: "desc",
      },
      take: queryLimit * 2,
      select: {
        id: true,
        title: true,
        created_at: true,
        updated_at: true,
        updated_by_user_id: true,
        users_knowledge_sources_updated_by_user_idTousers: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    }),
    prisma.knowledge_libraries.findMany({
      where: {
        created_by_user_id: {
          not: null,
        },
        AND: [
          knowledgeLibraryReadWhere(userId, workspaceId),
        ],
      },
      orderBy: {
        created_at: "desc",
      },
      take: queryLimit,
      select: {
        id: true,
        name: true,
        created_at: true,
        created_by_user_id: true,
        users_knowledge_libraries_created_by_user_idTousers: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    }),
  ]);

  const importedIds =
    getImportedResourceIds(importEvents);

  const activity: DashboardRecentActivityItem[] = [
    ...importEvents.map((event) => {
      const metadata = parseImportEventMetadata(
        event.metadata,
      );
      const documentsCreated =
        metadata?.summary?.documentsCreated ??
        metadata?.documents?.length ??
        0;
      const libraryName =
        event.knowledge_libraries?.name ??
        metadata?.targetLibrary?.name ??
        "Knowledge";

      return buildActivityItem({
        id: event.id,
        type: "knowledge.import.completed",
        actor: event.users,
        actorUserId: event.user_id,
        currentUserId: userId,
        title:
          documentsCreated > 0
            ? `${documentsCreated} documentos en ${libraryName}`
            : libraryName,
        description: event.description,
        href: event.knowledge_libraries
          ? `/knowledge?library=${event.knowledge_libraries.id}`
          : "/knowledge/activity?view=activity",
        occurredAt: event.created_at,
      });
    }),
    ...uploadedFiles
      .filter(
        (file) =>
          !isImportedDerivative(
            importedIds.fileTimes,
            file.id,
            file.created_at,
          ) &&
          file.uploaded_by_user_id,
      )
      .map((file) =>
        buildActivityItem({
          id: file.id,
          type: "knowledge.file.uploaded",
          actor: file.users,
          actorUserId: file.uploaded_by_user_id!,
          currentUserId: userId,
          title: file.file_name,
          href: `/knowledge/${file.knowledge_sources.id}`,
          occurredAt: file.created_at,
        }),
      ),
    ...createdArticles
      .filter(
        (article) =>
          !isImportedDerivative(
            importedIds.articleTimes,
            article.id,
            article.created_at,
          ) &&
          article.created_by_user_id,
      )
      .map((article) =>
        buildActivityItem({
          id: article.id,
          type: "knowledge.article.created",
          actor:
            article.users_knowledge_sources_created_by_user_idTousers,
          actorUserId: article.created_by_user_id!,
          currentUserId: userId,
          title: article.title,
          href: `/knowledge/${article.id}`,
          occurredAt: article.created_at,
        }),
      ),
    ...updatedArticleCandidates
      .filter(
        (article) =>
          article.updated_at.getTime() >
            article.created_at.getTime() &&
          !isImportedDerivative(
            importedIds.articleTimes,
            article.id,
            article.updated_at,
          ) &&
          article.updated_by_user_id,
      )
      .slice(0, queryLimit)
      .map((article) =>
        buildActivityItem({
          id: `${article.id}:updated`,
          type: "knowledge.article.updated",
          actor:
            article.users_knowledge_sources_updated_by_user_idTousers,
          actorUserId: article.updated_by_user_id!,
          currentUserId: userId,
          title: article.title,
          href: `/knowledge/${article.id}`,
          occurredAt: article.updated_at,
        }),
      ),
    ...createdFolders
      .filter(
        (folder) =>
          !isImportedDerivative(
            importedIds.folderTimes,
            folder.id,
            folder.created_at,
          ) &&
          folder.created_by_user_id,
      )
      .map((folder) =>
        buildActivityItem({
          id: folder.id,
          type: "knowledge.folder.created",
          actor:
            folder.users_knowledge_libraries_created_by_user_idTousers,
          actorUserId: folder.created_by_user_id!,
          currentUserId: userId,
          title: folder.name,
          href: `/knowledge?library=${folder.id}`,
          occurredAt: folder.created_at,
        }),
      ),
  ];

  activity.sort(
    (left, right) =>
      right.occurredAt.getTime() -
      left.occurredAt.getTime(),
  );

  return prioritizeDashboardActivity(
    activity,
    take,
  );
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

function buildActivityItem({
  id,
  type,
  actor,
  actorUserId,
  currentUserId,
  title,
  description,
  href,
  occurredAt,
}: {
  id: string;
  type: DashboardRecentActivityType;
  actor: ActivityActor | null;
  actorUserId: string;
  currentUserId: string;
  title: string;
  description?: string | null;
  href?: string;
  occurredAt: Date;
}): DashboardRecentActivityItem {
  return {
    id,
    type,
    actorUserId,
    actorName:
      actor?.name ?? actor?.email ?? "Usuario",
    actorImage: actor?.image ?? null,
    title,
    description,
    href,
    occurredAt,
    isCurrentUser: actorUserId === currentUserId,
  };
}

function parseImportEventMetadata(
  metadata: unknown,
): ImportEventMetadata | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  return metadata as ImportEventMetadata;
}

function getImportedResourceIds(
  importEvents: Array<{
    metadata: unknown;
    created_at: Date;
  }>,
) {
  const fileTimes = new Map<string, Date>();
  const articleTimes = new Map<string, Date>();
  const folderTimes = new Map<string, Date>();

  for (const event of importEvents) {
    const metadata = parseImportEventMetadata(
      event.metadata,
    );

    for (const file of metadata?.documents ?? []) {
      if (file.knowledgeFileId) {
        fileTimes.set(file.knowledgeFileId, event.created_at);
      }
    }

    for (const article of metadata?.articles ?? []) {
      if (article.databaseArticleId) {
        articleTimes.set(
          article.databaseArticleId,
          event.created_at,
        );
      }
    }

    for (const folder of metadata?.folders ?? []) {
      if (folder.databaseFolderId) {
        folderTimes.set(folder.databaseFolderId, event.created_at);
      }
    }
  }

  return {
    fileTimes,
    articleTimes,
    folderTimes,
  };
}

function isImportedDerivative(
  importTimesByResourceId: Map<string, Date>,
  resourceId: string,
  occurredAt: Date,
) {
  const importTime =
    importTimesByResourceId.get(resourceId);

  if (!importTime) {
    return false;
  }

  const diffMs = Math.abs(
    occurredAt.getTime() - importTime.getTime(),
  );

  return diffMs <= 5 * 60 * 1000;
}

function prioritizeDashboardActivity(
  activity: DashboardRecentActivityItem[],
  limit: number,
) {
  const otherUserCount = activity.filter(
    (item) => !item.isCurrentUser,
  ).length;

  if (otherUserCount < limit) {
    return activity.slice(0, limit);
  }

  const maxCurrentUserItems = Math.max(
    1,
    Math.floor(limit / 3),
  );
  const result: DashboardRecentActivityItem[] = [];
  let currentUserItems = 0;

  for (const item of activity) {
    if (result.length >= limit) {
      break;
    }

    if (item.isCurrentUser) {
      if (currentUserItems >= maxCurrentUserItems) {
        continue;
      }

      currentUserItems += 1;
    }

    result.push(item);
  }

  return result;
}
