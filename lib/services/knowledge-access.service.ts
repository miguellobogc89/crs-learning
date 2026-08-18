// lib/services/knowledge-access.service.ts
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryReadWhere } from "@/lib/knowledge/access-control";

export async function listAccessibleKnowledgeLibraries(
  userId: string,
  workspaceId: string,
) {
  return prisma.knowledge_libraries.findMany({
    where: knowledgeLibraryReadWhere(userId, workspaceId),
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      visibility: true,
      company_id: true,
      parent_id: true,
    },
  });
}
