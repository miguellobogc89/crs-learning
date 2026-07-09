// lib/services/knowledge-library.service.ts
import { prisma } from "@/lib/prisma";

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
      ],
    },
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
    });

    libraries = [library, ...libraries];
  }

  return libraries;
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