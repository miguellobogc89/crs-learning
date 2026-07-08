// lib/services/knowledge-access.service.ts
import { prisma } from "@/lib/prisma";

export async function listAccessibleKnowledgeLibraries(userId: string) {
  const user = await prisma.users.findUnique({
    where: {
      id: userId,
    },
    select: {
      company_id: true,
    },
  });

  return prisma.knowledge_libraries.findMany({
    where: {
      OR: [
        {
          visibility: "public_global",
        },
        ...(user?.company_id
          ? [
              {
                visibility: "company_public",
                company_id: user.company_id,
              },
            ]
          : []),
        {
          knowledge_library_permissions: {
            some: {
              user_id: userId,
            },
          },
        },
        {
          owner_user_id: userId,
        },
      ],
    },
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