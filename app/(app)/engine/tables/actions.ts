"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { importKnowledgeIntoEngine } from "@/lib/engine/auto-import-knowledge.service";
import { reviewEngineRelation } from "@/lib/engine/review-record-relation.service";

export async function reviewEngineRelationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Authentication required.");
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const proposalId = formData.get("proposalId");
  const decision = formData.get("decision");
  if (typeof proposalId !== "string" || !/^[0-9a-f-]{36}$/i.test(proposalId) ||
      (decision !== "approve" && decision !== "reject")) {
    throw new Error("Invalid review input.");
  }
  await reviewEngineRelation({
    workspaceId: activeWorkspace.id, userId: session.user.id,
    proposalId, decision,
  });
  revalidatePath("/engine/tables");
}

/** Explicit, authorized re-analysis of an existing Knowledge file; never approves links. */
export async function analyzeEngineRelationsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Authentication required.");
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const knowledgeFileId = formData.get("knowledgeFileId");
  if (typeof knowledgeFileId !== "string" || !/^[0-9a-f-]{36}$/i.test(knowledgeFileId)) {
    throw new Error("Invalid Knowledge file.");
  }
  const result = await importKnowledgeIntoEngine({
    workspaceId: activeWorkspace.id, userId: session.user.id, knowledgeFileId,
  });
  revalidatePath("/engine/tables");
  const params = new URLSearchParams({
    importStatus: result.status,
    proposed: String("relationsProposed" in result ? result.relationsProposed : 0),
    issues: String(result.issues.length),
  });
  redirect("/engine/tables?" + params.toString());
}
