// app/(app)/layout.tsx


import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { KnowledgeShell } from "@/components/knowledge/knowledge-shell";
import { listVisibleKnowledgeSources } from "@/lib/services/knowledge.service";
import { listKnowledgeLibraries } from "@/lib/services/knowledge-library.service";
import { listTeams } from "@/lib/services/knowledge-team.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export default async function KnowledgeLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const userId = session.user.id;

  const {
    activeWorkspace,
    workspaces,
  } = await getActiveWorkspaceContext(userId);

  const [
    knowledgeSources,
    knowledgeLibraries,
    knowledgeTeams,
  ] = await Promise.all([
    listVisibleKnowledgeSources(
      userId,
      activeWorkspace.id,
    ),

    listKnowledgeLibraries(
      userId,
      activeWorkspace.id,
    ),

    listTeams({
      userId,
      workspaceId: activeWorkspace.id,
    }),
  ]);

  const rootLibrary = knowledgeLibraries.find(
    (library) =>
      library.owner_user_id === userId &&
      library.parent_id === null,
  );

  return (
    <KnowledgeShell
      knowledgeSources={knowledgeSources}
      knowledgeLibraries={knowledgeLibraries}
      knowledgeTeams={knowledgeTeams}
      defaultLibraryId={rootLibrary?.id ?? null}
      activeWorkspace={activeWorkspace}
      workspaces={workspaces}
    >
      {children}
    </KnowledgeShell>
  );
}