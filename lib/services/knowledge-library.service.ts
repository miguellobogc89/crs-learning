// lib/services/knowledge-library.service.ts

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
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

/**
 * The knowledge layout and page can render concurrently. Both may try to
 * bootstrap the same root library; a unique-key race must be harmless.
 */
async function createOrFindRootKnowledgeLibrary(
  userId: string,
  workspaceId: string,
) {
  const where = {
    owner_user_id: userId,
    workspace_id: workspaceId,
    parent_id: null,
  };

  const existing = await prisma.knowledge_libraries.findFirst({
    where,
    orderBy: { created_at: "asc" },
  });
  if (existing) return existing;

  try {
    return await prisma.knowledge_libraries.create({
      data: {
        owner_user_id: userId,
        workspace_id: workspaceId,
        name: "Mi biblioteca",
        parent_id: null,
        position: 0,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002") {
      throw error;
    }

    // Another concurrent request may have created the same root library.
    const concurrent = await prisma.knowledge_libraries.findFirst({
      where,
      orderBy: { created_at: "asc" },
    });
    if (concurrent) return concurrent;
    throw error;
  }
}

export async function listKnowledgeLibraries(
  userId: string,
  workspaceId: string,
) {
  let libraries = await prisma.knowledge_libraries.findMany({
    where: knowledgeLibraryReadWhere(userId, workspaceId),
    include: libraryInclude,
    orderBy: [
      {
        parent_id: "asc",
      },
      {
        position: "asc",
      },
      {
        created_at: "asc",
      },
    ],
  });

  const ownedLibraries = libraries.filter(
    (library) => library.owner_user_id === userId,
  );

  if (ownedLibraries.length === 0) {
    await createOrFindRootKnowledgeLibrary(userId, workspaceId);
    // Reload with the same permission rules, rather than returning a
    // separately-created row with different filtering semantics.
    libraries = await prisma.knowledge_libraries.findMany({
      where: knowledgeLibraryReadWhere(userId, workspaceId),
      include: libraryInclude,
      orderBy: [
        { parent_id: "asc" },
        { position: "asc" },
        { created_at: "asc" },
      ],
    });
  }

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
      article_count:
        library._count.knowledge_sources,
      folder_count:
        library._count.other_knowledge_libraries,
      file_count: fileCount,
    };
  });
}

export async function ensureRootKnowledgeLibrary(
  userId: string,
  workspaceId: string,
) {
  return createOrFindRootKnowledgeLibrary(userId, workspaceId);
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