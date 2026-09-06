// app/actions/knowledge/team.actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  addMemberToTeam,
  createTeam,
  removeTeamShareFromLibrary,
  shareLibraryWithKnowledgeTeam,
} from "@/lib/services/knowledge-team.service";
import {
  serializePlanLimitError,
  type PlanLimitErrorPayload,
} from "@/lib/services/entitlements.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export async function shareKnowledgeLibraryWithTeamAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const libraryId = String(
    formData.get("libraryId") ?? "",
  ).trim();

  const teamId = String(
    formData.get("teamId") ?? "",
  ).trim();

  const accessLevel = String(
    formData.get("accessLevel") ?? "read",
  ) as "read" | "edit" | "owner";

  if (!libraryId || !teamId) {
    return;
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  await shareLibraryWithKnowledgeTeam({
    libraryId,
    teamId,
    ownerUserId: session.user.id,
    workspaceId: activeWorkspace.id,
    accessLevel,
  });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/library/${libraryId}`);
}

export async function createKnowledgeTeamAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const name = String(
    formData.get("name") ?? "",
  ).trim();

  const description = String(
    formData.get("description") ?? "",
  ).trim();

  if (!name) {
    return;
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  try {
    await createTeam({
      ownerUserId: session.user.id,
      workspaceId: activeWorkspace.id,
      name,
      description,
    });

    revalidatePath("/my-space");
    revalidatePath(`/my-space/workspaces/${activeWorkspace.id}`);

    return {
      ok: true as const,
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

export async function addKnowledgeTeamMemberAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const teamId = String(
    formData.get("teamId") ?? "",
  ).trim();

  const email = String(
    formData.get("email") ?? "",
  ).trim();

  if (!teamId || !email) {
    return;
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  await addMemberToTeam({
    teamId,
    workspaceId: activeWorkspace.id,
    email,
  });

  revalidatePath("/my-space");
}

export async function removeKnowledgeLibraryTeamShareAction(
  formData: FormData,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const libraryId = String(
    formData.get("libraryId") ?? "",
  ).trim();

  const teamId = String(
    formData.get("teamId") ?? "",
  ).trim();

  if (!libraryId || !teamId) {
    return;
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  await removeTeamShareFromLibrary({
    libraryId,
    teamId,
    ownerUserId: session.user.id,
    workspaceId: activeWorkspace.id,
  });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/library/${libraryId}`);
}

export type KnowledgeTeamActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      planLimit: PlanLimitErrorPayload;
    };
