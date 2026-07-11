// app/(app)/knowledge/[id]/page.tsx
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { KnowledgeDetailClient } from "@/components/knowledge/knowledge-detail-client";
import {
  buildLibraryTree,
  getLibraryPath,
} from "@/components/knowledge/sidebar/tree-utils";
import { listKnowledgeLibraries } from "@/lib/services/knowledge-library.service";
import { findKnowledgeSource } from "@/lib/services/knowledge.service";

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

  const [knowledge, libraries] = await Promise.all([
    findKnowledgeSource(id),
    listKnowledgeLibraries(session.user.id),
  ]);

  if (!knowledge) {
    notFound();
  }

  const hasDirectPermission =
    knowledge.knowledge_libraries?.knowledge_library_permissions?.some(
      (permission) => permission.user_id === session.user.id,
    ) ?? false;

  const hasTeamPermission =
    knowledge.knowledge_libraries?.knowledge_library_team_permissions?.some(
      (permission) =>
        permission.knowledge_teams.knowledge_team_members.some(
          (member) => member.user_id === session.user.id,
        ),
    ) ?? false;

  const canView =
    knowledge.owner_user_id === session.user.id ||
    knowledge.visibility === "public" ||
    hasDirectPermission ||
    hasTeamPermission;

  if (!canView) {
    notFound();
  }

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
      />
    </main>
  );
}