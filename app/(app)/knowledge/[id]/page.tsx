// app/(app)/knowledge/[id]/page.tsx
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { KnowledgeDetailClient } from "@/components/knowledge/knowledge-detail-client";
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
  const knowledge = await findKnowledgeSource(id);

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

  return (
    <main className="h-full overflow-y-auto bg-background">
      <KnowledgeDetailClient knowledge={knowledge} />
    </main>
  );
}