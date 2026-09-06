"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  serializePlanLimitError,
  type PlanLimitErrorPayload,
} from "@/lib/services/entitlements.service";
import {
  acceptWorkspaceInvite,
  cancelWorkspaceInvite,
  deleteWorkspace,
  inviteWorkspaceMember,
  leaveWorkspace,
  rejectWorkspaceInvite,
  removeWorkspaceMember,
  updateWorkspaceGeneral,
  updateWorkspaceMemberRole,
} from "@/lib/services/workspace-admin.service";

async function getAuthenticatedUser() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  return session.user;
}

export async function updateWorkspaceGeneralAction(
  formData: FormData,
) {
  const user = await getAuthenticatedUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");

  await updateWorkspaceGeneral({
    userId: user.id,
    workspaceId,
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });

  revalidatePath("/my-space/workspaces");
  revalidatePath(`/my-space/workspaces/${workspaceId}`);
}

export async function inviteWorkspaceMemberAction(formData: FormData) {
  const user = await getAuthenticatedUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await inviteWorkspaceMember({
      userId: user.id,
      workspaceId,
      email: String(formData.get("email") ?? ""),
    });
  } catch (error) {
    const planLimit = serializePlanLimitError(error);

    if (planLimit) {
      return {
        ok: false as const,
        planLimit,
      };
    }

    throw error;
  }

  revalidatePath(`/my-space/workspaces/${workspaceId}`);

  return {
    ok: true as const,
  };
}

export type WorkspaceInviteActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      planLimit: PlanLimitErrorPayload;
    };

export async function cancelWorkspaceInviteAction(formData: FormData) {
  const user = await getAuthenticatedUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");

  await cancelWorkspaceInvite({
    userId: user.id,
    workspaceId,
    inviteId: String(formData.get("inviteId") ?? ""),
  });

  revalidatePath(`/my-space/workspaces/${workspaceId}`);
}

export async function removeWorkspaceMemberAction(formData: FormData) {
  const user = await getAuthenticatedUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");

  await removeWorkspaceMember({
    userId: user.id,
    workspaceId,
    memberId: String(formData.get("memberId") ?? ""),
  });

  revalidatePath(`/my-space/workspaces/${workspaceId}`);
}

export async function updateWorkspaceMemberRoleAction(
  formData: FormData,
) {
  const user = await getAuthenticatedUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");

  await updateWorkspaceMemberRole({
    userId: user.id,
    workspaceId,
    memberId: String(formData.get("memberId") ?? ""),
    role: String(formData.get("role") ?? ""),
  });

  revalidatePath(`/my-space/workspaces/${workspaceId}`);
}

export async function leaveWorkspaceAction(formData: FormData) {
  const user = await getAuthenticatedUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");

  await leaveWorkspace({
    userId: user.id,
    workspaceId,
  });

  revalidatePath("/", "layout");
  redirect("/my-space/workspaces");
}

export async function deleteWorkspaceAction(formData: FormData) {
  const user = await getAuthenticatedUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");

  await deleteWorkspace({
    userId: user.id,
    workspaceId,
    confirmation: String(formData.get("confirmation") ?? ""),
  });

  revalidatePath("/", "layout");
  redirect("/my-space/workspaces");
}

export async function acceptWorkspaceInviteAction(formData: FormData) {
  const user = await getAuthenticatedUser();

  if (!user.email) {
    throw new Error("La sesion no tiene email");
  }

  const workspaceId = await acceptWorkspaceInvite({
    userId: user.id,
    userEmail: user.email,
    token: String(formData.get("token") ?? ""),
  });

  revalidatePath("/", "layout");
  redirect(`/my-space/workspaces/${workspaceId}`);
}

export async function rejectWorkspaceInviteAction(formData: FormData) {
  const user = await getAuthenticatedUser();

  if (!user.email) {
    throw new Error("La sesion no tiene email");
  }

  await rejectWorkspaceInvite({
    userId: user.id,
    userEmail: user.email,
    token: String(formData.get("token") ?? ""),
  });

  revalidatePath("/notifications");
  redirect("/my-space/workspaces");
}
