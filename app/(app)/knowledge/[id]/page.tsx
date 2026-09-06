// app/(app)/knowledge/[id]/page.tsx
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { KnowledgeDetailClient } from "@/components/knowledge/detail/knowledge-detail-client";
import {
  buildLibraryTree,
  getLibraryPath,
} from "@/components/knowledge/sidebar/tree-utils";
import { listKnowledgeLibraries } from "@/lib/services/knowledge-library.service";
import { findAccessibleKnowledgeSource } from "@/lib/services/knowledge.service";
import {
  listTeams,
  listTeamSharesForLibrary,
} from "@/lib/services/knowledge-team.service";
import { recordResourceAccess } from "@/lib/services/resource-access.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export default async function KnowledgeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { id } = await params;
  const { activeWorkspace } = await getActiveWorkspaceContext(
    session.user.id,
  );

const [knowledge, libraries, teams] = await Promise.all([
  findAccessibleKnowledgeSource(id, session.user.id, activeWorkspace.id),
  listKnowledgeLibraries(session.user.id, activeWorkspace.id),
  listTeams(session.user.id),
]);

  if (!knowledge) {
    notFound();
  }

  await recordResourceAccess({
    userId: session.user.id,
    workspaceId: activeWorkspace.id,
    resourceType: "knowledge_source",
    resourceId: knowledge.id,
    interactionType: "viewed",
  });

const libraryShares = knowledge.library_id
  ? await listTeamSharesForLibrary({
      libraryId: knowledge.library_id,
      ownerUserId: session.user.id,
      workspaceId: activeWorkspace.id,
    })
  : [];

  const libraryTree = buildLibraryTree(libraries);

  const libraryPath = getLibraryPath(
    libraryTree,
    knowledge.library_id,
  );

  return (
    <main className="h-full overflow-hidden bg-background">
<KnowledgeDetailClient
  knowledge={knowledge}
  libraryPath={libraryPath}
  teams={teams}
  libraryShares={libraryShares}
/>
    </main>
  );
}
