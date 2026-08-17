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

const [knowledge, libraries, teams] = await Promise.all([
  findAccessibleKnowledgeSource(id, session.user.id),
  listKnowledgeLibraries(session.user.id),
  listTeams(session.user.id),
]);

  if (!knowledge) {
    notFound();
  }

const libraryShares = knowledge.library_id
  ? await listTeamSharesForLibrary({
      libraryId: knowledge.library_id,
      ownerUserId: session.user.id,
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
