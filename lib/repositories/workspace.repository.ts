import { prisma } from "@/lib/prisma";

export type AccessibleWorkspace = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  owner_user_id: string | null;
  organization_id: string | null;
  role: string;
  status?: string;
  member_count?: number;
};

export async function listAccessibleWorkspaces(
  userId: string,
): Promise<AccessibleWorkspace[]> {
  const memberships =
    await prisma.workspace_members.findMany({
      where: {
        user_id: userId,
        status: "active",
        workspaces: {
          status: "active",
        },
      },
      orderBy: [
        {
          workspaces: {
            created_at: "asc",
          },
        },
        {
          workspaces: {
            name: "asc",
          },
        },
      ],
      select: {
        role: true,
        workspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            status: true,
            owner_user_id: true,
            organization_id: true,
            _count: {
              select: {
                workspace_members: {
                  where: {
                    status: "active",
                  },
                },
              },
            },
          },
        },
      },
    });

  return memberships.map((membership) => ({
    ...membership.workspaces,
    role: membership.role,
    member_count:
      membership.workspaces._count.workspace_members,
  }));
}

export async function getAccessibleWorkspaceById(
  userId: string,
  workspaceId: string,
) {
  return prisma.workspaces.findFirst({
    where: {
      id: workspaceId,
      status: "active",
      workspace_members: {
        some: {
          user_id: userId,
          status: "active",
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      status: true,
      owner_user_id: true,
      organization_id: true,
    },
  });
}

export async function upsertPersonalWorkspace(data: {
  userId: string;
  name: string;
  slug: string;
}) {
  const existing = await prisma.workspaces.findFirst({
    where: {
      owner_user_id: data.userId,
      organization_id: null,
      slug: data.slug,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      owner_user_id: true,
      organization_id: true,
    },
  });

  if (existing) {
    if (existing.owner_user_id === data.userId) {
      return prisma.workspaces.update({
        where: {
          id: existing.id,
        },
        data: {
          status: "active",
          updated_at: new Date(),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          owner_user_id: true,
          organization_id: true,
        },
      });
    }

    return existing;
  }

  return prisma.workspaces.create({
    data: {
      owner_user_id: data.userId,
      organization_id: null,
      name: data.name,
      slug: data.slug,
      visibility: "private",
      status: "active",
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      owner_user_id: true,
      organization_id: true,
    },
  });
}

export async function ensureWorkspaceMember(data: {
  workspaceId: string;
  userId: string;
  role: string;
}) {
  const existing = await prisma.workspace_members.findFirst({
    where: {
      workspace_id: data.workspaceId,
      user_id: data.userId,
    },
  });

  if (existing) {
    return prisma.workspace_members.update({
      where: {
        id: existing.id,
      },
      data: {
        role: data.role,
        status: "active",
        updated_at: new Date(),
      },
    });
  }

  return prisma.workspace_members.create({
    data: {
      workspace_id: data.workspaceId,
      user_id: data.userId,
      role: data.role,
      status: "active",
    },
  });
}

export async function getWorkspaceMembership(data: {
  workspaceId: string;
  userId: string;
}) {
  return prisma.workspace_members.findFirst({
    where: {
      workspace_id: data.workspaceId,
      user_id: data.userId,
      status: "active",
      workspaces: {
        status: "active",
      },
    },
    include: {
      workspaces: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true,
          owner_user_id: true,
          organization_id: true,
        },
      },
    },
  });
}

export async function getWorkspaceMembers(workspaceId: string) {
  return prisma.workspace_members.findMany({
    where: {
      workspace_id: workspaceId,
      status: "active",
    },
    orderBy: [
      {
        role: "asc",
      },
      {
        joined_at: "asc",
      },
    ],
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
  });
}

export async function getPendingWorkspaceInvites(
  workspaceId: string,
) {
  return prisma.$queryRaw<
    Array<{
      id: string;
      workspace_id: string;
      invited_by_user_id: string;
      email: string;
      role: string;
      status: string;
      token: string;
      expires_at: Date | null;
      accepted_at: Date | null;
      created_at: Date;
      updated_at: Date;
      users: {
        id: string;
        name: string | null;
        email: string;
      };
    }>
  >`
    SELECT
      wi.*,
      jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'email', u.email
      ) AS users
    FROM workspace_invites wi
    JOIN users u ON u.id = wi.invited_by_user_id
    WHERE wi.workspace_id = ${workspaceId}::uuid
      AND wi.status = 'pending'
    ORDER BY wi.created_at DESC
  `;
}

export async function findWorkspaceInviteByToken(token: string) {
  const invites = await prisma.$queryRaw<
    Array<{
      id: string;
      workspace_id: string;
      invited_by_user_id: string;
      email: string;
      role: string;
      status: string;
      token: string;
      expires_at: Date | null;
      accepted_at: Date | null;
      created_at: Date;
      updated_at: Date;
      workspaces: {
        id: string;
        name: string;
        description: string | null;
        status: string;
      };
      users: {
        id: string;
        name: string | null;
        email: string;
      };
    }>
  >`
    SELECT
      wi.*,
      jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'description', w.description,
        'status', w.status
      ) AS workspaces,
      jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'email', u.email
      ) AS users
    FROM workspace_invites wi
    JOIN workspaces w ON w.id = wi.workspace_id
    JOIN users u ON u.id = wi.invited_by_user_id
    WHERE wi.token = ${token}
    LIMIT 1
  `;

  return invites[0] ?? null;
}

export async function findPendingWorkspaceInviteByEmail(data: {
  workspaceId: string;
  email: string;
}) {
  const invites = await prisma.$queryRaw<
    Array<{ id: string }>
  >`
    SELECT id
    FROM workspace_invites
    WHERE workspace_id = ${data.workspaceId}::uuid
      AND email = ${data.email}
      AND status = 'pending'
    LIMIT 1
  `;

  return invites[0] ?? null;
}

export async function createWorkspaceInviteRecord(data: {
  workspaceId: string;
  invitedByUserId: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
}) {
  const invites = await prisma.$queryRaw<
    Array<{
      id: string;
      workspace_id: string;
      invited_by_user_id: string;
      email: string;
      role: string;
      status: string;
      token: string;
      expires_at: Date | null;
      accepted_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>
  >`
    INSERT INTO workspace_invites (
      workspace_id,
      invited_by_user_id,
      email,
      role,
      status,
      token,
      expires_at
    )
    VALUES (
      ${data.workspaceId}::uuid,
      ${data.invitedByUserId}::uuid,
      ${data.email},
      ${data.role},
      'pending',
      ${data.token},
      ${data.expiresAt}
    )
    RETURNING *
  `;

  return invites[0];
}

export async function updateWorkspaceInviteStatus(data: {
  inviteId: string;
  workspaceId?: string;
  currentStatus?: string;
  nextStatus: string;
  acceptedAt?: Date | null;
}) {
  const acceptedAt = data.acceptedAt ?? null;

  return prisma.$executeRaw`
    UPDATE workspace_invites
    SET
      status = ${data.nextStatus},
      accepted_at = COALESCE(${acceptedAt}, accepted_at),
      updated_at = NOW()
    WHERE id = ${data.inviteId}::uuid
      AND (${data.workspaceId ?? null}::uuid IS NULL OR workspace_id = ${data.workspaceId ?? null}::uuid)
      AND (${data.currentStatus ?? null}::text IS NULL OR status = ${data.currentStatus ?? null})
  `;
}
