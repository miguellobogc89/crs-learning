// lib/services/knowledge-library.service.ts
import { prisma } from "@/lib/prisma";

export async function listKnowledgeLibraries(ownerUserId: string) {
  return prisma.knowledge_libraries.findMany({
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
}