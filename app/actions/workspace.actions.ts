"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import {
  assertPlanAllows,
  canCreateWorkspace,
  serializePlanLimitError,
  type PlanLimitErrorPayload,
} from "@/lib/services/entitlements.service";
import {
  ACTIVE_WORKSPACE_COOKIE,
  assertWorkspaceAccess,
  createPersonalWorkspace,
} from "@/lib/services/workspace.service";

async function persistActiveWorkspace(workspaceId: string) {
  const cookieStore = await cookies();

  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function switchWorkspaceAction(workspaceId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const workspace = await assertWorkspaceAccess(
    session.user.id,
    workspaceId,
  );

  await persistActiveWorkspace(workspace.id);

  revalidatePath("/", "layout");
}

export async function createWorkspaceAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const name = String(formData.get("name") ?? "").trim();

  try {
    assertPlanAllows(
      await canCreateWorkspace(session.user.id),
    );

    const workspace = await createPersonalWorkspace({
      userId: session.user.id,
      name,
    });

    await persistActiveWorkspace(workspace.id);

    revalidatePath("/", "layout");

    return {
      ok: true as const,
      workspaceId: workspace.id,
    };
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
}

export type WorkspaceActionResult =
  | {
      ok: true;
      workspaceId: string;
    }
  | {
      ok: false;
      planLimit: PlanLimitErrorPayload;
    };
