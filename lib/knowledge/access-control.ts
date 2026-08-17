import type { Prisma } from "@prisma/client";

export function knowledgeLibraryReadWhere(
  userId: string,
): Prisma.knowledge_librariesWhereInput {
  return {
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
  };
}

export function knowledgeLibraryWriteWhere(
  userId: string,
): Prisma.knowledge_librariesWhereInput {
  return {
    OR: [
      {
        owner_user_id: userId,
      },
      {
        knowledge_library_permissions: {
          some: {
            user_id: userId,
            access_level: {
              in: ["edit", "owner"],
            },
          },
        },
      },
      {
        knowledge_library_team_permissions: {
          some: {
            access_level: {
              in: ["edit", "owner"],
            },
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
  };
}

export function knowledgeSourceReadWhere(
  userId: string,
): Prisma.knowledge_sourcesWhereInput {
  return {
    status: {
      not: "deleted",
    },
    OR: [
      {
        owner_user_id: userId,
      },
      {
        knowledge_libraries:
          knowledgeLibraryReadWhere(userId),
      },
    ],
  };
}

export function knowledgeSourceOwnerWhere(
  userId: string,
): Prisma.knowledge_sourcesWhereInput {
  return {
    status: {
      not: "deleted",
    },
    owner_user_id: userId,
  };
}
