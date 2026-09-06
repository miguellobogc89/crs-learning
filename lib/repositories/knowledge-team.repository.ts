import { prisma } from "@/lib/prisma";

export async function createKnowledgeTeam(data: {
  ownerUserId: string;
  workspaceId: string;
  name: string;
  description?: string;
}) {
  return prisma.knowledge_teams.create({
    data: {
      owner_user_id: data.ownerUserId,
      workspace_id: data.workspaceId,
      name: data.name,
      description: data.description ?? null,
      knowledge_team_members: {
        create: {
          user_id: data.ownerUserId,
          role: "owner",
        },
      },
    },
  });
}

export async function listKnowledgeTeamsForWorkspace(data: {
  userId: string;
  workspaceId: string;
}) {
  return prisma.knowledge_teams.findMany({
    where: {
      workspace_id: data.workspaceId,
      workspaces: {
        workspace_members: {
          some: {
            user_id: data.userId,
            status: "active",
          },
        },
      },
    },
    include: {
      knowledge_team_members: {
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });
}

export async function addKnowledgeTeamMember(data: {
  teamId: string;
  workspaceId: string;
  userId: string;
  role?: string;
}) {
  const team = await prisma.knowledge_teams.findFirst({
    where: {
      id: data.teamId,
      workspace_id: data.workspaceId,
    },
    select: {
      id: true,
    },
  });

  if (!team) {
    throw new Error("Equipo no encontrado en este workspace");
  }

  const workspaceMember =
    await prisma.workspace_members.findFirst({
      where: {
        workspace_id: data.workspaceId,
        user_id: data.userId,
        status: "active",
      },
      select: {
        id: true,
      },
    });

  if (!workspaceMember) {
    throw new Error(
      "El usuario no pertenece a este workspace",
    );
  }

  return prisma.knowledge_team_members.upsert({
    where: {
      team_id_user_id: {
        team_id: data.teamId,
        user_id: data.userId,
      },
    },
    create: {
      team_id: data.teamId,
      user_id: data.userId,
      role: data.role ?? "member",
    },
    update: {
      role: data.role ?? "member",
      updated_at: new Date(),
    },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.users.findUnique({
    where: {
      email,
    },
  });
}

export async function shareLibraryWithTeam(data: {
  libraryId: string;
  teamId: string;
  ownerUserId: string;
  workspaceId: string;
  accessLevel: "read" | "edit" | "owner";
}) {
  const [library, team] = await Promise.all([
    prisma.knowledge_libraries.findFirst({
      where: {
        id: data.libraryId,
        owner_user_id: data.ownerUserId,
        workspace_id: data.workspaceId,
      },
      select: {
        id: true,
      },
    }),
    prisma.knowledge_teams.findFirst({
      where: {
        id: data.teamId,
        workspace_id: data.workspaceId,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!library) {
    throw new Error("Library not found or not owned by user");
  }

  if (!team) {
    throw new Error("Team not found in workspace");
  }

  return prisma.knowledge_library_team_permissions.upsert({
    where: {
      library_id_team_id: {
        library_id: data.libraryId,
        team_id: data.teamId,
      },
    },
    create: {
      library_id: data.libraryId,
      team_id: data.teamId,
      access_level: data.accessLevel,
    },
    update: {
      access_level: data.accessLevel,
      updated_at: new Date(),
    },
  });
}

export async function listLibraryTeamShares(data: {
  libraryId: string;
  ownerUserId: string;
  workspaceId: string;
}) {
  const library = await prisma.knowledge_libraries.findFirst({
    where: {
      id: data.libraryId,
      owner_user_id: data.ownerUserId,
      workspace_id: data.workspaceId,
    },
    select: {
      id: true,
    },
  });

  if (!library) {
    throw new Error("Library not found or not owned by user");
  }

  return prisma.knowledge_library_team_permissions.findMany({
    where: {
      library_id: data.libraryId,
      knowledge_teams: {
        workspace_id: data.workspaceId,
      },
    },
    include: {
      knowledge_teams: {
        include: {
          knowledge_team_members: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });
}

export async function removeLibraryTeamShare(data: {
  libraryId: string;
  teamId: string;
  ownerUserId: string;
  workspaceId: string;
}) {
  const permission =
    await prisma.knowledge_library_team_permissions.findFirst({
      where: {
        library_id: data.libraryId,
        team_id: data.teamId,
        knowledge_libraries: {
          owner_user_id: data.ownerUserId,
          workspace_id: data.workspaceId,
        },
        knowledge_teams: {
          workspace_id: data.workspaceId,
        },
      },
      select: {
        library_id: true,
        team_id: true,
      },
    });

  if (!permission) {
    throw new Error("Library team share not found");
  }

  return prisma.knowledge_library_team_permissions.delete({
    where: {
      library_id_team_id: {
        library_id: permission.library_id,
        team_id: permission.team_id,
      },
    },
  });
}
