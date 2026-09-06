import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import {
  ensureWorkspaceMember,
  getAccessibleWorkspaceById,
  listAccessibleWorkspaces,
  upsertPersonalWorkspace,
  type AccessibleWorkspace,
} from "@/lib/repositories/workspace.repository";
import { getActiveOrganizationForUser } from "@/lib/services/organization.service";

export const ACTIVE_WORKSPACE_COOKIE = "crs_active_workspace_id";

export type ActiveWorkspaceContext = {
  activeWorkspace: AccessibleWorkspace;
  workspaces: AccessibleWorkspace[];
};

function slugifyWorkspaceName(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "workspace";
}

async function getAvailablePersonalWorkspaceSlug(
  userId: string,
  baseName: string,
) {
  const baseSlug = slugifyWorkspaceName(baseName);
  let slug = baseSlug;
  let suffix = 2;

  while (
    await prisma.workspaces.findFirst({
      where: {
        owner_user_id: userId,
        organization_id: null,
        slug,
      },
      select: {
        id: true,
      },
    })
  ) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function rootLibraryNameForWorkspace(
  workspaceName: string,
  isBootstrapWorkspace: boolean,
) {
  return isBootstrapWorkspace
    ? "Mi biblioteca"
    : `Biblioteca ${workspaceName}`.slice(0, 120);
}

async function ensureRootLibraryForWorkspace(data: {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  isBootstrapWorkspace: boolean;
}) {
  const existing = await prisma.knowledge_libraries.findFirst({
    where: {
      owner_user_id: data.userId,
      parent_id: null,
      workspace_id: data.workspaceId,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return existing;
  }

  const fallbackName = rootLibraryNameForWorkspace(
    data.workspaceName,
    data.isBootstrapWorkspace,
  );

  const existingName = await prisma.knowledge_libraries.findFirst({
    where: {
      owner_user_id: data.userId,
      name: fallbackName,
      parent_id: null,
    },
    select: {
      id: true,
    },
  });

  return prisma.knowledge_libraries.create({
    data: {
      owner_user_id: data.userId,
      parent_id: null,
      workspace_id: data.workspaceId,
      name: existingName
        ? `${fallbackName} ${data.workspaceId.slice(0, 8)}`
        : fallbackName,
      position: 0,
      visibility: "restricted",
      created_by_user_id: data.userId,
      updated_by_user_id: data.userId,
    },
    select: {
      id: true,
    },
  });
}

async function bootstrapPersonalWorkspace(userId: string) {
  const workspace = await upsertPersonalWorkspace({
    userId,
    name: "Mi espacio",
    slug: "mi-espacio",
  });

  await ensureWorkspaceMember({
    workspaceId: workspace.id,
    userId,
    role: "owner",
  });

  await prisma.knowledge_libraries.updateMany({
    where: {
      owner_user_id: userId,
      workspace_id: null,
      organization_id: null,
    },
    data: {
      workspace_id: workspace.id,
      updated_at: new Date(),
      updated_by_user_id: userId,
    },
  });

  await ensureRootLibraryForWorkspace({
    userId,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    isBootstrapWorkspace: true,
  });

  return workspace;
}

export async function ensureWorkspaceBootstrap(userId: string) {
  await getActiveOrganizationForUser(userId);
  let workspaces = await listAccessibleWorkspaces(userId);

  const personalWorkspaces =
    await prisma.workspaces.findMany({
      where: {
        owner_user_id: userId,
        organization_id: null,
        status: "active",
      },
      orderBy: [
        {
          created_at: "asc",
        },
        {
          name: "asc",
        },
      ],
      select: {
        id: true,
        name: true,
        slug: true,
        owner_user_id: true,
        organization_id: true,
      },
    });

  if (personalWorkspaces.length === 0) {
    await bootstrapPersonalWorkspace(userId);
    workspaces = await listAccessibleWorkspaces(userId);
  } else {
    const oldestPersonalWorkspace = personalWorkspaces[0];

    await ensureWorkspaceMember({
      workspaceId: oldestPersonalWorkspace.id,
      userId,
      role: "owner",
    });

    await prisma.knowledge_libraries.updateMany({
      where: {
        owner_user_id: userId,
        workspace_id: null,
        organization_id: null,
      },
      data: {
        workspace_id: oldestPersonalWorkspace.id,
        updated_at: new Date(),
        updated_by_user_id: userId,
      },
    });

    workspaces = await listAccessibleWorkspaces(userId);
  }

  return workspaces;
}

export async function getActiveWorkspaceContext(
  userId: string,
): Promise<ActiveWorkspaceContext> {
  const cookieStore = await cookies();
  const cookieWorkspaceId = cookieStore.get(
    ACTIVE_WORKSPACE_COOKIE,
  )?.value;

  let workspaces = await ensureWorkspaceBootstrap(userId);

  let activeWorkspace =
    cookieWorkspaceId
      ? workspaces.find(
          (workspace) => workspace.id === cookieWorkspaceId,
        )
      : undefined;

  if (!activeWorkspace && cookieWorkspaceId) {
    const accessibleWorkspace =
      await getAccessibleWorkspaceById(
        userId,
        cookieWorkspaceId,
      );

    if (accessibleWorkspace) {
      activeWorkspace = {
        ...accessibleWorkspace,
        role: "member",
      };
    }
  }

  if (!activeWorkspace) {
    activeWorkspace = workspaces[0];
  }

  if (!activeWorkspace) {
    await bootstrapPersonalWorkspace(userId);
    workspaces = await listAccessibleWorkspaces(userId);
    activeWorkspace = workspaces[0];
  }

  if (!activeWorkspace) {
    throw new Error("No se ha podido resolver el workspace activo");
  }

  return {
    activeWorkspace,
    workspaces,
  };
}

export async function assertWorkspaceAccess(
  userId: string,
  workspaceId: string,
) {
  const workspace = await getAccessibleWorkspaceById(
    userId,
    workspaceId,
  );

  if (!workspace) {
    throw new Error("Workspace no encontrado");
  }

  return workspace;
}

export async function createPersonalWorkspace(data: {
  userId: string;
  name: string;
}) {
  const normalizedName = data.name.trim();

  if (!normalizedName) {
    throw new Error("El nombre del workspace es obligatorio");
  }

  await getActiveOrganizationForUser(data.userId);
  const slug = await getAvailablePersonalWorkspaceSlug(
    data.userId,
    normalizedName,
  );

  const workspace = await upsertPersonalWorkspace({
    userId: data.userId,
    name: normalizedName,
    slug,
  });

  await ensureWorkspaceMember({
    workspaceId: workspace.id,
    userId: data.userId,
    role: "owner",
  });

  await ensureRootLibraryForWorkspace({
    userId: data.userId,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    isBootstrapWorkspace: false,
  });

  return workspace;
}
