// lib/actions/knowledge-folder-recipients.actions.ts
"use server";

import { auth } from "@/auth";
import { getWorkspaceMembers } from "@/lib/repositories/workspace.repository";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export type FolderRecipient = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export async function getFolderRecipients(): Promise<
  FolderRecipient[]
> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const { activeWorkspace } =
    await getActiveWorkspaceContext(session.user.id);

  const members = await getWorkspaceMembers(
    activeWorkspace.id,
  );

  return members
    .filter(
      (member) =>
        member.user_id !== session.user.id,
    )
    .map((member) => ({
      id: member.users.id,
      name:
        member.users.name?.trim() ||
        member.users.email ||
        "Usuario",
      email: member.users.email ?? "",
      image: member.users.image,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    );
}