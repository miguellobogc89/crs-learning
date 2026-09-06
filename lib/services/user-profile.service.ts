import type { Prisma } from "@prisma/client";

import {
  knowledgeLibraryReadWhere,
  knowledgeSourceReadWhere,
} from "@/lib/knowledge/access-control";
import { prisma } from "@/lib/prisma";
import {
  getUserSystemRole,
  isUserSuperAdmin,
} from "@/lib/auth/admin";

export type UserProfileContributionType =
  | "knowledge.file.uploaded"
  | "knowledge.article.created"
  | "knowledge.article.updated"
  | "knowledge.folder.created";

export type UserProfileContribution = {
  id: string;
  type: UserProfileContributionType;
  title: string;
  href: string;
  occurredAt: Date;
};

export type UserProfileArticle = {
  id: string;
  title: string;
  href: string;
  action: "created" | "updated";
  occurredAt: Date;
};

export type UserProfileFolder = {
  id: string;
  name: string;
  href: string;
  occurredAt: Date;
};

export type UserProfileWorkspace = {
  id: string;
  name: string;
  description: string | null;
  role: string;
};

export type UserProfileTeam = {
  id: string;
  name: string;
  description: string | null;
};

export type UserProfile = {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    status: string;
    systemRole: string;
  };
  isCurrentUser: boolean;
  canEdit: boolean;
  editableSystemRoles: string[];
  sharedWorkspaces: UserProfileWorkspace[];
  sharedTeams: UserProfileTeam[];
  recentContributions: UserProfileContribution[];
  recentArticles: UserProfileArticle[];
  recentFolders: UserProfileFolder[];
};

export type VisibleUserDirectoryItem = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  status: string;
  systemRole: string;
  isCurrentUser: boolean;
  canEdit: boolean;
  primaryRole: string;
  sharedWorkspaces: UserProfileWorkspace[];
  sharedTeams: UserProfileTeam[];
};

const SYSTEM_ROLE_OPTIONS = [
  "user",
  "system_admin",
  "system_super_admin",
] as const;

export async function getUserProfileForViewer({
  viewerUserId,
  profileUserId,
}: {
  viewerUserId: string;
  profileUserId: string;
}): Promise<UserProfile | null> {
  const profileUser = await prisma.users.findUnique({
    where: {
      id: profileUserId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      status: true,
      system_role: true,
    },
  });

  if (!profileUser) {
    return null;
  }

  const sharedWorkspaces =
    await getSharedWorkspaceMemberships({
      viewerUserId,
      profileUserId,
    });

  const isCurrentUser = viewerUserId === profileUserId;

  if (!isCurrentUser && sharedWorkspaces.length === 0) {
    return null;
  }

  const sharedWorkspaceIds = sharedWorkspaces.map(
    (workspace) => workspace.id,
  );

  const [
    sharedTeams,
    recentContributions,
    recentArticles,
    recentFolders,
    editPermissions,
  ] = await Promise.all([
    getSharedKnowledgeTeams({
      viewerUserId,
      profileUserId,
      sharedWorkspaceIds,
    }),
    getRecentKnowledgeContributions({
      viewerUserId,
      profileUserId,
      sharedWorkspaceIds,
      limit: 6,
    }),
    getRecentKnowledgeArticles({
      viewerUserId,
      profileUserId,
      sharedWorkspaceIds,
      limit: 6,
    }),
    getRecentKnowledgeFolders({
      viewerUserId,
      profileUserId,
      sharedWorkspaceIds,
      limit: 6,
    }),
    getUserEditPermissions({
      viewerUserId,
      targetSystemRole: profileUser.system_role,
    }),
  ]);

  return {
    user: {
      id: profileUser.id,
      name: profileUser.name,
      email: profileUser.email,
      image: profileUser.image,
      status: profileUser.status,
      systemRole: profileUser.system_role,
    },
    isCurrentUser,
    canEdit: editPermissions.canEdit,
    editableSystemRoles: editPermissions.editableSystemRoles,
    sharedWorkspaces,
    sharedTeams,
    recentContributions,
    recentArticles,
    recentFolders,
  };
}

export async function listVisibleUsersForViewer({
  viewerUserId,
  query,
  limit = 50,
}: {
  viewerUserId: string;
  query?: string;
  limit?: number;
}): Promise<VisibleUserDirectoryItem[]> {
  const viewerWorkspaceIds =
    await getViewerActiveWorkspaceIds(viewerUserId);

  const search = query?.trim();
  const users = await prisma.users.findMany({
    where: {
      AND: [
        {
          OR: [
            {
              id: viewerUserId,
            },
            {
              workspace_members: {
                some: {
                  workspace_id: {
                    in: viewerWorkspaceIds,
                  },
                  status: "active",
                  workspaces: {
                    status: "active",
                  },
                },
              },
            },
          ],
        },
        search
          ? {
              OR: [
                {
                  name: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {},
      ],
    },
    orderBy: [
      {
        name: "asc",
      },
      {
        email: "asc",
      },
    ],
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      status: true,
      system_role: true,
      workspace_members: {
        where: {
          workspace_id: {
            in: viewerWorkspaceIds,
          },
          status: "active",
          workspaces: {
            status: "active",
          },
        },
        orderBy: {
          joined_at: "asc",
        },
        select: {
          role: true,
          workspaces: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      },
    },
  });

  const sharedTeamsByUserId =
    await getSharedKnowledgeTeamsByUserId({
      viewerUserId,
      userIds: users.map((user) => user.id),
      workspaceIds: viewerWorkspaceIds,
    });

  const permissionEntries = await Promise.all(
    users.map((user) =>
      getUserEditPermissions({
        viewerUserId,
        targetSystemRole: user.system_role,
      }),
    ),
  );

  return users.map((user, index) => {
    const sharedWorkspaces =
      user.workspace_members.map((membership) => ({
        id: membership.workspaces.id,
        name: membership.workspaces.name,
        description:
          membership.workspaces.description,
        role: membership.role,
      }));

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      status: user.status,
      systemRole: user.system_role,
      isCurrentUser: user.id === viewerUserId,
      canEdit: permissionEntries[index]?.canEdit ?? false,
      primaryRole:
        sharedWorkspaces[0]?.role ??
        formatSystemRole(user.system_role),
      sharedWorkspaces,
      sharedTeams:
        sharedTeamsByUserId.get(user.id) ?? [],
    };
  });
}

export async function getUserEditPermissions({
  viewerUserId,
  targetSystemRole,
}: {
  viewerUserId: string;
  targetSystemRole: string;
}) {
  const viewerSystemRole =
    await getUserSystemRole(viewerUserId);

  if (viewerSystemRole === "system_super_admin") {
    return {
      canEdit: true,
      editableSystemRoles: [...SYSTEM_ROLE_OPTIONS],
    };
  }

  if (
    viewerSystemRole === "system_admin" &&
    targetSystemRole === "user"
  ) {
    return {
      canEdit: true,
      editableSystemRoles: ["user"],
    };
  }

  return {
    canEdit: false,
    editableSystemRoles: [],
  };
}

export async function isViewerSuperAdmin(userId: string) {
  return isUserSuperAdmin(userId);
}

async function getSharedWorkspaceMemberships({
  viewerUserId,
  profileUserId,
}: {
  viewerUserId: string;
  profileUserId: string;
}) {
  const memberships =
    await prisma.workspace_members.findMany({
      where: {
        user_id: profileUserId,
        status: "active",
        workspaces: {
          status: "active",
          workspace_members: {
            some: {
              user_id: viewerUserId,
              status: "active",
            },
          },
        },
      },
      orderBy: {
        joined_at: "asc",
      },
      select: {
        role: true,
        workspaces: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

  return memberships.map((membership) => ({
    id: membership.workspaces.id,
    name: membership.workspaces.name,
    description: membership.workspaces.description,
    role: membership.role,
  }));
}

async function getViewerActiveWorkspaceIds(
  viewerUserId: string,
) {
  const memberships =
    await prisma.workspace_members.findMany({
      where: {
        user_id: viewerUserId,
        status: "active",
        workspaces: {
          status: "active",
        },
      },
      select: {
        workspace_id: true,
      },
    });

  return memberships.map(
    (membership) => membership.workspace_id,
  );
}

async function getSharedKnowledgeTeams({
  viewerUserId,
  profileUserId,
  sharedWorkspaceIds,
}: {
  viewerUserId: string;
  profileUserId: string;
  sharedWorkspaceIds: string[];
}) {
  if (sharedWorkspaceIds.length === 0) {
    return [];
  }

  return prisma.knowledge_teams.findMany({
    where: {
      AND: [
        {
          knowledge_team_members: {
            some: {
              user_id: viewerUserId,
            },
          },
        },
        {
          knowledge_team_members: {
            some: {
              user_id: profileUserId,
            },
          },
        },
        {
          knowledge_library_team_permissions: {
            some: {
              knowledge_libraries: {
                workspace_id: {
                  in: sharedWorkspaceIds,
                },
              },
            },
          },
        },
      ],
    },
    orderBy: {
      name: "asc",
    },
    take: 6,
    select: {
      id: true,
      name: true,
      description: true,
    },
  });
}

async function getSharedKnowledgeTeamsByUserId({
  viewerUserId,
  userIds,
  workspaceIds,
}: {
  viewerUserId: string;
  userIds: string[];
  workspaceIds: string[];
}) {
  const teamsByUserId = new Map<string, UserProfileTeam[]>();

  if (userIds.length === 0 || workspaceIds.length === 0) {
    return teamsByUserId;
  }

  const teams = await prisma.knowledge_teams.findMany({
    where: {
      AND: [
        {
          knowledge_team_members: {
            some: {
              user_id: viewerUserId,
            },
          },
        },
        {
          knowledge_team_members: {
            some: {
              user_id: {
                in: userIds,
              },
            },
          },
        },
        {
          knowledge_library_team_permissions: {
            some: {
              knowledge_libraries: {
                workspace_id: {
                  in: workspaceIds,
                },
              },
            },
          },
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
      knowledge_team_members: {
        where: {
          user_id: {
            in: userIds,
          },
        },
        select: {
          user_id: true,
        },
      },
    },
  });

  for (const team of teams) {
    for (const member of team.knowledge_team_members) {
      const current =
        teamsByUserId.get(member.user_id) ?? [];

      if (current.length < 3) {
        current.push({
          id: team.id,
          name: team.name,
          description: team.description,
        });
      }

      teamsByUserId.set(member.user_id, current);
    }
  }

  return teamsByUserId;
}

async function getRecentKnowledgeContributions({
  viewerUserId,
  profileUserId,
  sharedWorkspaceIds,
  limit,
}: {
  viewerUserId: string;
  profileUserId: string;
  sharedWorkspaceIds: string[];
  limit: number;
}) {
  const [files, createdArticles, updatedArticles, folders] =
    await getKnowledgeContributionSources({
      viewerUserId,
      profileUserId,
      sharedWorkspaceIds,
    });

  const contributions: UserProfileContribution[] = [
    ...files.map((file) => ({
      id: file.id,
      type: "knowledge.file.uploaded" as const,
      title: file.file_name,
      href: `/knowledge/${file.knowledge_sources.id}`,
      occurredAt: file.created_at,
    })),
    ...createdArticles.map((article) => ({
      id: article.id,
      type: "knowledge.article.created" as const,
      title: article.title,
      href: `/knowledge/${article.id}`,
      occurredAt: article.created_at,
    })),
    ...updatedArticles.map((article) => ({
      id: `${article.id}:updated`,
      type: "knowledge.article.updated" as const,
      title: article.title,
      href: `/knowledge/${article.id}`,
      occurredAt: article.updated_at,
    })),
    ...folders.map((folder) => ({
      id: folder.id,
      type: "knowledge.folder.created" as const,
      title: folder.name,
      href: `/knowledge?library=${folder.id}`,
      occurredAt: folder.created_at,
    })),
  ];

  return contributions
    .sort(
      (left, right) =>
        right.occurredAt.getTime() -
        left.occurredAt.getTime(),
    )
    .slice(0, limit);
}

async function getRecentKnowledgeArticles({
  viewerUserId,
  profileUserId,
  sharedWorkspaceIds,
  limit,
}: {
  viewerUserId: string;
  profileUserId: string;
  sharedWorkspaceIds: string[];
  limit: number;
}) {
  const [, createdArticles, updatedArticles] =
    await getKnowledgeContributionSources({
      viewerUserId,
      profileUserId,
      sharedWorkspaceIds,
    });

  const articlesById = new Map<string, UserProfileArticle>();

  for (const article of createdArticles) {
    articlesById.set(article.id, {
      id: article.id,
      title: article.title,
      href: `/knowledge/${article.id}`,
      action: "created",
      occurredAt: article.created_at,
    });
  }

  for (const article of updatedArticles) {
    const existing = articlesById.get(article.id);

    if (
      !existing ||
      article.updated_at.getTime() >
        existing.occurredAt.getTime()
    ) {
      articlesById.set(article.id, {
        id: article.id,
        title: article.title,
        href: `/knowledge/${article.id}`,
        action: "updated",
        occurredAt: article.updated_at,
      });
    }
  }

  return Array.from(articlesById.values())
    .sort(
      (left, right) =>
        right.occurredAt.getTime() -
        left.occurredAt.getTime(),
    )
    .slice(0, limit);
}

async function getRecentKnowledgeFolders({
  viewerUserId,
  profileUserId,
  sharedWorkspaceIds,
  limit,
}: {
  viewerUserId: string;
  profileUserId: string;
  sharedWorkspaceIds: string[];
  limit: number;
}) {
  if (sharedWorkspaceIds.length === 0) {
    return [];
  }

  const folders =
    await prisma.knowledge_libraries.findMany({
      where: {
        created_by_user_id: profileUserId,
        AND: [
          buildVisibleLibraryWhere(
            viewerUserId,
            sharedWorkspaceIds,
          ),
        ],
      },
      orderBy: {
        created_at: "desc",
      },
      take: limit,
      select: {
        id: true,
        name: true,
        created_at: true,
      },
    });

  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    href: `/knowledge?library=${folder.id}`,
    occurredAt: folder.created_at,
  }));
}

async function getKnowledgeContributionSources({
  viewerUserId,
  profileUserId,
  sharedWorkspaceIds,
}: {
  viewerUserId: string;
  profileUserId: string;
  sharedWorkspaceIds: string[];
}) {
  if (sharedWorkspaceIds.length === 0) {
    return [[], [], [], []] as const;
  }

  return Promise.all([
    prisma.knowledge_files.findMany({
      where: {
        uploaded_by_user_id: profileUserId,
        knowledge_sources: buildVisibleSourceWhere(
          viewerUserId,
          sharedWorkspaceIds,
        ),
      },
      orderBy: {
        created_at: "desc",
      },
      take: 12,
      select: {
        id: true,
        file_name: true,
        created_at: true,
        knowledge_sources: {
          select: {
            id: true,
          },
        },
      },
    }),
    prisma.knowledge_sources.findMany({
      where: {
        created_by_user_id: profileUserId,
        AND: [
          buildVisibleSourceWhere(
            viewerUserId,
            sharedWorkspaceIds,
          ),
        ],
      },
      orderBy: {
        created_at: "desc",
      },
      take: 12,
      select: {
        id: true,
        title: true,
        created_at: true,
      },
    }),
    prisma.knowledge_sources
      .findMany({
        where: {
          updated_by_user_id: profileUserId,
          AND: [
            buildVisibleSourceWhere(
              viewerUserId,
              sharedWorkspaceIds,
            ),
          ],
        },
        orderBy: {
          updated_at: "desc",
        },
        take: 24,
        select: {
          id: true,
          title: true,
          created_at: true,
          updated_at: true,
        },
      })
      .then((articles) =>
        articles
          .filter(
            (article) =>
              article.updated_at.getTime() >
              article.created_at.getTime(),
          )
          .slice(0, 12),
      ),
    prisma.knowledge_libraries.findMany({
      where: {
        created_by_user_id: profileUserId,
        AND: [
          buildVisibleLibraryWhere(
            viewerUserId,
            sharedWorkspaceIds,
          ),
        ],
      },
      orderBy: {
        created_at: "desc",
      },
      take: 12,
      select: {
        id: true,
        name: true,
        created_at: true,
      },
    }),
  ]);
}

function buildVisibleSourceWhere(
  viewerUserId: string,
  workspaceIds: string[],
): Prisma.knowledge_sourcesWhereInput {
  return {
    OR: workspaceIds.map((workspaceId) =>
      knowledgeSourceReadWhere(viewerUserId, workspaceId),
    ),
  };
}

function buildVisibleLibraryWhere(
  viewerUserId: string,
  workspaceIds: string[],
): Prisma.knowledge_librariesWhereInput {
  return {
    OR: workspaceIds.map((workspaceId) =>
      knowledgeLibraryReadWhere(viewerUserId, workspaceId),
    ),
  };
}

function formatSystemRole(role: string) {
  if (role === "system_super_admin") {
    return "system super admin";
  }

  if (role === "system_admin") {
    return "system admin";
  }

  return role;
}
