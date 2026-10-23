// lib/services/knowledge-library.service.ts

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { knowledgeLibraryReadWhere } from "@/lib/knowledge/access-control";

const libraryInclude = {
  knowledge_library_team_permissions: {
    include: {
      knowledge_teams: true,
    },
  },

  knowledge_sources: {
    select: {
      id: true,
      knowledge_type: true,
      _count: {
        select: {
          knowledge_files: true,
        },
      },
    },
  },

  users_knowledge_libraries_updated_by_user_idTousers: {
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  },

  _count: {
    select: {
      knowledge_sources: true,
      other_knowledge_libraries: true,
    },
  },
} as const;

export async function listKnowledgeLibraries(
  userId: string,
  workspaceId: string,
) {
  const libraries = await prisma.knowledge_libraries.findMany({
    where: knowledgeLibraryReadWhere(userId, workspaceId),
    include: libraryInclude,
    orderBy: [
      { parent_id: "asc" },
      { position: "asc" },
      { created_at: "asc" },
    ],
  });

  return libraries.map((library) => {
    const fileCount = library.knowledge_sources.reduce(
      (total, source) =>
        total + source._count.knowledge_files,
      0,
    );

    return {
      ...library,
      is_shared:
        library.owner_user_id !== userId,
      article_count: library.knowledge_sources.filter(
        source => source.knowledge_type !== "document",
      ).length,
      folder_count:
        library._count.other_knowledge_libraries,
      file_count: fileCount,
    };
  });
}

type KnowledgeStatusClient = Pick<
  Prisma.TransactionClient,
  "knowledge_libraries"
>;

async function getKnowledgeStatus(
  client: KnowledgeStatusClient,
  userId: string,
  workspaceId: string,
) {
  return client.knowledge_libraries.findMany({
    where: knowledgeLibraryReadWhere(
      userId,
      workspaceId,
    ),
    select: {
      id: true,
      name: true,
      parent_id: true,
      owner_user_id: true,
      visibility: true,
      position: true,

      knowledge_sources: {
        orderBy: {
          title: "asc",
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          knowledge_type: true,
          visibility: true,

          knowledge_files: {
            orderBy: {
              file_name: "asc",
            },
            select: {
              id: true,
              file_name: true,
              file_type: true,
              file_size: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: [
      {
        parent_id: "asc",
      },
      {
        position: "asc",
      },
      {
        name: "asc",
      },
    ],
  });
}

export async function listKnowledgeStatus(
  userId: string,
  workspaceId: string,
) {
  return getKnowledgeStatus(
    prisma,
    userId,
    workspaceId,
  );
}

export async function createKnowledgeStatusSnapshot(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
) {
  return getKnowledgeStatus(
    tx,
    userId,
    workspaceId,
  );
}