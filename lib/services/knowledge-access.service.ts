// lib/services/knowledge-access.service.ts
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryReadWhere } from "@/lib/knowledge/access-control";

export async function listAccessibleKnowledgeLibraries(userId: string) {
  return prisma.knowledge_libraries.findMany({
    where: knowledgeLibraryReadWhere(userId),
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
