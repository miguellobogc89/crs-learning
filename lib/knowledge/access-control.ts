import type { Prisma } from "@prisma/client";

export function knowledgeLibraryReadWhere(
  userId: string,
  workspaceId?: string | null,
): Prisma.knowledge_librariesWhereInput {
  const permissionWhere: Prisma.knowledge_librariesWhereInput = {
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
      ...(workspaceId
        ? [
            {
              workspaces: {
                workspace_members: {
                  some: {
                    user_id: userId,
                    status: "active",
                  },
                },
              },
            },
          ]
        : []),
    ],
  };

  if (!workspaceId) {
    return permissionWhere;
  }

  return {
    AND: [
      {
        workspace_id: workspaceId,
      },
      permissionWhere,
    ],
  };
}

export function knowledgeLibraryWriteWhere(
  userId: string,
  workspaceId?: string | null,
): Prisma.knowledge_librariesWhereInput {
  const permissionWhere: Prisma.knowledge_librariesWhereInput = {
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

  if (!workspaceId) {
    return permissionWhere;
  }

  return {
    AND: [
      {
        workspace_id: workspaceId,
      },
      permissionWhere,
    ],
  };
}

export function knowledgeSourceReadWhere(
  userId: string,
  workspaceId?: string | null,
): Prisma.knowledge_sourcesWhereInput {
  const permissionWhere: Prisma.knowledge_sourcesWhereInput = {
    status: {
      not: "deleted",
    },
    OR: [
      {
        owner_user_id: userId,
      },
      {
        knowledge_libraries:
          knowledgeLibraryReadWhere(userId, workspaceId),
      },
    ],
  };

  if (!workspaceId) {
    return permissionWhere;
  }

  return {
    AND: [
      {
        knowledge_libraries: {
          workspace_id: workspaceId,
        },
      },
      permissionWhere,
    ],
  };
}

export function knowledgeSourceOwnerWhere(
  userId: string,
  workspaceId?: string | null,
): Prisma.knowledge_sourcesWhereInput {
  const ownerWhere: Prisma.knowledge_sourcesWhereInput = {
    status: {
      not: "deleted",
    },
    owner_user_id: userId,
  };

  if (!workspaceId) {
    return ownerWhere;
  }

  return {
    AND: [
      ownerWhere,
      {
        knowledge_libraries: {
          workspace_id: workspaceId,
        },
      },
    ],
  };
}
