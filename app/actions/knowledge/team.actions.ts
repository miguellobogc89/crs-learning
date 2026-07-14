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

  await shareLibraryWithKnowledgeTeam({
    libraryId,
    teamId,
    ownerUserId: session.user.id,
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

  await createTeam({
    ownerUserId: session.user.id,
    name,
    description,
  });

  revalidatePath("/my-space");
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

  await addMemberToTeam({
    teamId,
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

  await removeTeamShareFromLibrary({
    libraryId,
    teamId,
    ownerUserId: session.user.id,
  });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/library/${libraryId}`);
}