// app/(app)/knowledge/layout.tsx
import { ReactNode } from "react";

import { auth } from "@/auth";
import { KnowledgeShell } from "@/components/knowledge/knowledge-shell";
import { listVisibleKnowledgeSources } from "@/lib/services/knowledge.service";
import { listKnowledgeLibraries } from "@/lib/services/knowledge-library.service";
import { listTeams } from "@/lib/services/knowledge-team.service";

export default async function KnowledgeLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  const knowledgeSources = await listVisibleKnowledgeSources(session!.user.id);
  const knowledgeLibraries = await listKnowledgeLibraries(session!.user.id);
  const knowledgeTeams = await listTeams(session!.user.id);

  const rootLibrary = knowledgeLibraries.find(
    (library) =>
      library.owner_user_id === session!.user.id && library.parent_id === null,
  );

  return (
    <KnowledgeShell
      knowledgeSources={knowledgeSources}
      knowledgeLibraries={knowledgeLibraries}
      knowledgeTeams={knowledgeTeams}
      defaultLibraryId={rootLibrary?.id ?? null}
    >
      {children}
    </KnowledgeShell>
  );
}