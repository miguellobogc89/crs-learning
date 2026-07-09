// lib/services/knowledge-library.service.ts

import { prisma } from "@/lib/prisma";

export async function listKnowledgeLibraries(ownerUserId: string) {
  let libraries = await prisma.knowledge_libraries.findMany({
    where: {
      owner_user_id: ownerUserId,
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

  if (libraries.length === 0) {
    const library = await prisma.knowledge_libraries.create({
      data: {
        owner_user_id: ownerUserId,
        name: "Mi biblioteca",
        position: 0,
      },
    });

    libraries = [library];
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