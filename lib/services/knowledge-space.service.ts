// lib/services/knowledge-space.service.ts
import { prisma } from "@/lib/prisma";

export async function listAccessibleKnowledgeSpaces(userId: string) {
  const user = await prisma.users.findUnique({
    where: {
      id: userId,
    },
    select: {
      company_id: true,
    },
  });

  return prisma.knowledge_spaces.findMany({
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
          knowledge_space_permissions: {
            some: {
              user_id: userId,
            },
          },
        },
        {
          created_by_user_id: userId,
        },
      ],
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      description: true,
      visibility: true,
      knowledge_space_libraries: {
        select: {
          knowledge_libraries: {
            select: {
              id: true,
              name: true,
              visibility: true,
            },
          },
        },
      },
    },
  });
}