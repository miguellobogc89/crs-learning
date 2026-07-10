// lib/services/knowledge-library.service.ts
import { prisma } from "@/lib/prisma";

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
  _count: {
    select: {
      knowledge_sources: true,
      other_knowledge_libraries: true,
    },
  },
} as const;

export async function listKnowledgeLibraries(userId: string) {
  let libraries = await prisma.knowledge_libraries.findMany({
    where: {
      OR: [
        {
          owner_user_id: userId,
        },
        {
          knowledge_library_permissions: {
            some: {
              user_id: userId,
            },
          },
        },
        {
          knowledge_library_team_permissions: {
            some: {
              knowledge_teams: {
                knowledge_team_members: {
                  some: {
                    user_id: userId,
                  },
                },
              },
            },
          },
        },
      ],
    },
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
    const library = await prisma.knowledge_libraries.create({
      data: {
        owner_user_id: userId,
        name: "Mi biblioteca",
        position: 0,
      },
      include: libraryInclude,
    });

    libraries = [library, ...libraries];
  }

  return libraries.map((library) => {
    const fileCount = library.knowledge_sources.reduce(
      (total, source) => total + source._count.knowledge_files,
      0,
    );

    return {
      ...library,
      is_shared: library.owner_user_id !== userId,
      article_count: library._count.knowledge_sources,
      folder_count: library._count.other_knowledge_libraries,
      file_count: fileCount,
    };
  });
}

export async function ensureRootKnowledgeLibrary(userId: string) {
  const existing = await prisma.knowledge_libraries.findFirst({
    where: {
      owner_user_id: userId,
      parent_id: null,
      name: "Mi biblioteca",
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.knowledge_libraries.create({
    data: {
      owner_user_id: userId,
      name: "Mi biblioteca",
      parent_id: null,
    },
  });
}