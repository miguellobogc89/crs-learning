// lib/repositories/knowledge-team.repository.ts
import { prisma } from "@/lib/prisma";

export async function createKnowledgeTeam(data: {
  ownerUserId: string;
  name: string;
  description?: string;
}) {
  return prisma.knowledge_teams.create({
    data: {
      owner_user_id: data.ownerUserId,
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

export async function listKnowledgeTeamsForUser(userId: string) {
  return prisma.knowledge_teams.findMany({
    where: {
      OR: [
        { owner_user_id: userId },
        {
          knowledge_team_members: {
            some: {
              user_id: userId,
            },
          },
        },
      ],
    },
    include: {
      knowledge_team_members: {
        include: {
          users: true,
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
  userId: string;
  role?: string;
}) {
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
  accessLevel: "read" | "edit" | "owner";
}) {
  const library = await prisma.knowledge_libraries.findFirst({
    where: {
      id: data.libraryId,
      owner_user_id: data.ownerUserId,
    },
  });

  if (!library) {
    throw new Error("Library not found or not owned by user");
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
}) {
  const library = await prisma.knowledge_libraries.findFirst({
    where: {
      id: data.libraryId,
      owner_user_id: data.ownerUserId,
    },
  });

  if (!library) {
    throw new Error("Library not found or not owned by user");
  }

  return prisma.knowledge_library_team_permissions.findMany({
    where: {
      library_id: data.libraryId,
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
}) {
  const library = await prisma.knowledge_libraries.findFirst({
    where: {
      id: data.libraryId,
      owner_user_id: data.ownerUserId,
    },
  });

  if (!library) {
    throw new Error("Library not found or not owned by user");
  }

  return prisma.knowledge_library_team_permissions.delete({
    where: {
      library_id_team_id: {
        library_id: data.libraryId,
        team_id: data.teamId,
      },
    },
  });
}