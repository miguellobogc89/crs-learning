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

  const members = await prisma.knowledge_team_members.findMany({
    where: {
      team_id: data.teamId,
    },
  });

  await Promise.all(
    members.map((member) =>
      prisma.knowledge_library_permissions.upsert({
        where: {
          library_id_user_id: {
            library_id: data.libraryId,
            user_id: member.user_id,
          },
        },
        create: {
          library_id: data.libraryId,
          user_id: member.user_id,
          access_level: data.accessLevel,
        },
        update: {
          access_level: data.accessLevel,
          updated_at: new Date(),
        },
      }),
    ),
  );

  return {
    ok: true,
    sharedWith: members.length,
  };
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

const teams = await prisma.knowledge_teams.findMany({
  where: {
    OR: [
      {
        owner_user_id: data.ownerUserId,
      },
      {
        knowledge_team_members: {
          some: {
            user_id: data.ownerUserId,
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

  const permissions = await prisma.knowledge_library_permissions.findMany({
    where: {
      library_id: data.libraryId,
    },
  });

const shares = teams
  .map((team) => {
    const memberIds = team.knowledge_team_members.map(
      (member) => member.user_id,
    );

    const teamPermissions = permissions.filter((permission) =>
      memberIds.includes(permission.user_id),
    );

    if (teamPermissions.length === 0) {
      return null;
    }

    return {
      teamId: team.id,
      teamName: team.name,
      membersWithAccess: teamPermissions.length,
      totalMembers: team.knowledge_team_members.length,
      accessLevel: teamPermissions[0]?.access_level ?? "read",
    };
  })
  .filter((share) => share !== null);

return shares;
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

  const members = await prisma.knowledge_team_members.findMany({
    where: {
      team_id: data.teamId,
    },
  });

  await prisma.knowledge_library_permissions.deleteMany({
    where: {
      library_id: data.libraryId,
      user_id: {
        in: members.map((member) => member.user_id),
      },
    },
  });

  return {
    ok: true,
    removedFrom: members.length,
  };
}