import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import {
  assertPlanAllows,
  canInviteMember,
} from "@/lib/services/entitlements.service";
import { createNotification } from "@/lib/services/notification.service";
import {
  createWorkspaceInviteRecord,
  ensureWorkspaceMember,
  findWorkspaceInviteByToken,
  findPendingWorkspaceInviteByEmail,
  getPendingWorkspaceInvites,
  getWorkspaceMembers,
  getWorkspaceMembership,
  listAccessibleWorkspaces,
  updateWorkspaceInviteStatus,
} from "@/lib/repositories/workspace.repository";

const INVITE_EXPIRATION_DAYS = 14;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireWorkspaceOwner(
  membership: Awaited<ReturnType<typeof getWorkspaceMembership>>,
) {
  if (!membership || membership.role !== "owner") {
    throw new Error("No tienes permisos para administrar este workspace");
  }

  return membership;
}

function validateMemberRole(role: string) {
  if (role !== "member") {
    throw new Error("El rol no es valido para esta version");
  }

  return role;
}

export async function listWorkspaceAdminItems(userId: string) {
  return listAccessibleWorkspaces(userId);
}

export async function getWorkspaceAdminDetail(data: {
  userId: string;
  workspaceId: string;
}) {
  const membership = await getWorkspaceMembership(data);

  if (!membership) {
    return null;
  }

  const [members, invites] = await Promise.all([
    getWorkspaceMembers(data.workspaceId),
    membership.role === "owner"
      ? getPendingWorkspaceInvites(data.workspaceId)
      : Promise.resolve([]),
  ]);

  return {
    workspace: membership.workspaces,
    role: membership.role,
    members,
    invites,
  };
}

export async function updateWorkspaceGeneral(data: {
  userId: string;
  workspaceId: string;
  name: string;
  description: string;
}) {
  requireWorkspaceOwner(
    await getWorkspaceMembership({
      userId: data.userId,
      workspaceId: data.workspaceId,
    }),
  );

  const name = data.name.trim();

  if (!name) {
    throw new Error("El nombre del workspace es obligatorio");
  }

  return prisma.workspaces.update({
    where: {
      id: data.workspaceId,
    },
    data: {
      name,
      description: data.description.trim() || null,
      updated_at: new Date(),
    },
  });
}

export async function inviteWorkspaceMember(data: {
  userId: string;
  workspaceId: string;
  email: string;
}) {
  const membership = requireWorkspaceOwner(
    await getWorkspaceMembership({
      userId: data.userId,
      workspaceId: data.workspaceId,
    }),
  );

  const email = normalizeEmail(data.email);

  if (!isValidEmail(email)) {
    throw new Error("El email no es valido");
  }

  const invitedUser = await prisma.users.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (invitedUser?.id === data.userId) {
    throw new Error("No puedes invitarte a ti mismo");
  }

  assertPlanAllows(
    await canInviteMember(data.userId, data.workspaceId),
  );

  if (
    invitedUser &&
    (await prisma.workspace_members.findFirst({
      where: {
        workspace_id: data.workspaceId,
        user_id: invitedUser.id,
        status: "active",
      },
      select: {
        id: true,
      },
    }))
  ) {
    throw new Error("Ese usuario ya pertenece al workspace");
  }

  const pendingInvite =
    await findPendingWorkspaceInviteByEmail({
      workspaceId: data.workspaceId,
      email,
    });

  if (pendingInvite) {
    throw new Error("Ya existe una invitacion pendiente para ese email");
  }

  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + INVITE_EXPIRATION_DAYS,
  );

  const invite = await createWorkspaceInviteRecord({
    workspaceId: data.workspaceId,
    invitedByUserId: data.userId,
    email,
    role: "member",
    token: randomBytes(32).toString("hex"),
    expiresAt,
  });

  if (invitedUser) {
    await createNotification({
      userId: invitedUser.id,
      type: "workspace_invite",
      title: `Te han invitado al workspace ${membership.workspaces.name}`,
      body: "Puedes aceptar o rechazar la invitacion desde tu area personal.",
      entityType: "workspace_invite",
      entityId: invite.id,
      href: `/workspace-invites/${invite.token}`,
      metadata: {
        workspaceId: data.workspaceId,
        inviteId: invite.id,
      },
    });
  }

  return invite;
}

export async function cancelWorkspaceInvite(data: {
  userId: string;
  workspaceId: string;
  inviteId: string;
}) {
  requireWorkspaceOwner(
    await getWorkspaceMembership({
      userId: data.userId,
      workspaceId: data.workspaceId,
    }),
  );

  return updateWorkspaceInviteStatus({
    inviteId: data.inviteId,
    workspaceId: data.workspaceId,
    currentStatus: "pending",
    nextStatus: "cancelled",
  });
}

export async function removeWorkspaceMember(data: {
  userId: string;
  workspaceId: string;
  memberId: string;
}) {
  const ownerMembership = requireWorkspaceOwner(
    await getWorkspaceMembership({
      userId: data.userId,
      workspaceId: data.workspaceId,
    }),
  );

  const targetMembership =
    await prisma.workspace_members.findFirst({
      where: {
        id: data.memberId,
        workspace_id: data.workspaceId,
        status: "active",
      },
    });

  if (!targetMembership) {
    throw new Error("Miembro no encontrado");
  }

  if (targetMembership.user_id === ownerMembership.workspaces.owner_user_id) {
    throw new Error("No puedes eliminar al propietario del workspace");
  }

  return prisma.workspace_members.update({
    where: {
      id: targetMembership.id,
    },
    data: {
      status: "removed",
      updated_at: new Date(),
    },
  });
}

export async function updateWorkspaceMemberRole(data: {
  userId: string;
  workspaceId: string;
  memberId: string;
  role: string;
}) {
  requireWorkspaceOwner(
    await getWorkspaceMembership({
      userId: data.userId,
      workspaceId: data.workspaceId,
    }),
  );

  const role = validateMemberRole(data.role);

  const targetMembership =
    await prisma.workspace_members.findFirst({
      where: {
        id: data.memberId,
        workspace_id: data.workspaceId,
        status: "active",
      },
    });

  if (!targetMembership) {
    throw new Error("Miembro no encontrado");
  }

  if (targetMembership.role === "owner") {
    throw new Error("No puedes cambiar el rol del propietario");
  }

  return prisma.workspace_members.update({
    where: {
      id: targetMembership.id,
    },
    data: {
      role,
      updated_at: new Date(),
    },
  });
}

export async function leaveWorkspace(data: {
  userId: string;
  workspaceId: string;
}) {
  const membership = await getWorkspaceMembership(data);

  if (!membership) {
    throw new Error("Workspace no encontrado");
  }

  if (membership.role === "owner") {
    throw new Error(
      "El propietario no puede abandonar el workspace. Eliminalo o transfiere la propiedad en una futura version.",
    );
  }

  return prisma.workspace_members.update({
    where: {
      id: membership.id,
    },
    data: {
      status: "left",
      updated_at: new Date(),
    },
  });
}

export async function deleteWorkspace(data: {
  userId: string;
  workspaceId: string;
  confirmation: string;
}) {
  const membership = requireWorkspaceOwner(
    await getWorkspaceMembership({
      userId: data.userId,
      workspaceId: data.workspaceId,
    }),
  );

  if (data.confirmation.trim() !== membership.workspaces.name) {
    throw new Error("La confirmacion no coincide con el nombre del workspace");
  }

  const libraryIds = await prisma.knowledge_libraries.findMany({
    where: {
      workspace_id: data.workspaceId,
    },
    select: {
      id: true,
    },
  });

  const ids = libraryIds.map((library) => library.id);

  await prisma.$transaction(async (tx) => {
    await tx.chat_conversations.updateMany({
      where: {
        scope_library_id: {
          in: ids,
        },
      },
      data: {
        scope_library_id: null,
        scope_type: "all",
        updated_at: new Date(),
      },
    });

    await tx.knowledge_sources.deleteMany({
      where: {
        library_id: {
          in: ids,
        },
      },
    });

    await tx.knowledge_libraries.deleteMany({
      where: {
        workspace_id: data.workspaceId,
      },
    });

    await tx.$executeRaw`
      DELETE FROM workspace_invites
      WHERE workspace_id = ${data.workspaceId}::uuid
    `;

    await tx.workspace_members.deleteMany({
      where: {
        workspace_id: data.workspaceId,
      },
    });

    await tx.workspaces.delete({
      where: {
        id: data.workspaceId,
      },
    });
  });
}

export async function acceptWorkspaceInvite(data: {
  userId: string;
  userEmail: string;
  token: string;
}) {
  const invite = await findWorkspaceInviteByToken(data.token);

  if (!invite || invite.status !== "pending") {
    throw new Error("Invitacion no encontrada o no disponible");
  }

  if (invite.workspaces.status !== "active") {
    throw new Error("El workspace ya no esta activo");
  }

  if (invite.expires_at && invite.expires_at < new Date()) {
    throw new Error("La invitacion ha caducado");
  }

  if (normalizeEmail(data.userEmail) !== normalizeEmail(invite.email)) {
    throw new Error("Esta invitacion pertenece a otro usuario");
  }

  await ensureWorkspaceMember({
    workspaceId: invite.workspace_id,
    userId: data.userId,
    role: invite.role === "owner" ? "member" : "member",
  });

  await ensureOrganizationMemberForWorkspace({
    userId: data.userId,
    workspaceId: invite.workspace_id,
  });

  await updateWorkspaceInviteStatus({
    inviteId: invite.id,
    currentStatus: "pending",
    nextStatus: "accepted",
    acceptedAt: new Date(),
  });

  return invite.workspace_id;
}

async function ensureOrganizationMemberForWorkspace({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}) {
  const workspace = await prisma.workspaces.findUnique({
    where: {
      id: workspaceId,
    },
    select: {
      organization_id: true,
    },
  });

  if (!workspace?.organization_id) {
    return;
  }

  await prisma.organization_members.upsert({
    where: {
      organization_id_user_id: {
        organization_id: workspace.organization_id,
        user_id: userId,
      },
    },
    create: {
      organization_id: workspace.organization_id,
      user_id: userId,
      role: "member",
      status: "active",
      is_primary: false,
    },
    update: {
      status: "active",
      updated_at: new Date(),
    },
  });
}

export async function rejectWorkspaceInvite(data: {
  userId: string;
  userEmail: string;
  token: string;
}) {
  void data.userId;

  const invite = await findWorkspaceInviteByToken(data.token);

  if (!invite || invite.status !== "pending") {
    throw new Error("Invitacion no encontrada o no disponible");
  }

  if (invite.expires_at && invite.expires_at < new Date()) {
    throw new Error("La invitacion ha caducado");
  }

  if (normalizeEmail(data.userEmail) !== normalizeEmail(invite.email)) {
    throw new Error("Esta invitacion pertenece a otro usuario");
  }

  await updateWorkspaceInviteStatus({
    inviteId: invite.id,
    currentStatus: "pending",
    nextStatus: "rejected",
  });
}

export async function getInviteForAuthenticatedUser(data: {
  userEmail: string;
  token: string;
}) {
  const invite = await findWorkspaceInviteByToken(data.token);

  if (!invite) {
    return null;
  }

  const belongsToUser =
    normalizeEmail(invite.email) === normalizeEmail(data.userEmail);

  return {
    invite,
    belongsToUser,
    isExpired: Boolean(invite.expires_at && invite.expires_at < new Date()),
  };
}
