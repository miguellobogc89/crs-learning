// app/actions/knowledge/document.actions.ts
"use server";

import { deleteKnowledgeDocumentFile } from "@/lib/knowledge/delete-knowledge.service";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export async function deleteKnowledgeFileAction(
  knowledgeFileId: string,
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

  await deleteKnowledgeDocumentFile({ userId: session.user.id, workspaceId: activeWorkspace.id, fileId: knowledgeFileId });
  revalidatePath("/knowledge", "layout");
}
