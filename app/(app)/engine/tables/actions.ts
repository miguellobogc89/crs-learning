"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
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
