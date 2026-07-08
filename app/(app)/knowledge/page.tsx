// app/(app)/knowledge/page.tsx
import { redirect } from "next/navigation";

import { KnowledgeStats } from "@/components/knowledge/content/knowledge-stats";
import { KnowledgeContent } from "@/components/knowledge/content/knowledge-content";
import { auth } from "@/auth";
import { listVisibleKnowledgeSources } from "@/lib/services/knowledge.service";
import { listKnowledgeLibraries } from "@/lib/services/knowledge-library.service";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ library?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const params = await searchParams;
  const selectedLibraryId = params.library ?? null;

  const allKnowledgeSources = await listVisibleKnowledgeSources(session.user.id);

  const knowledgeSources = selectedLibraryId
    ? allKnowledgeSources.filter(
        (knowledge) => knowledge.library_id === selectedLibraryId,
      )
    : allKnowledgeSources;

  const knowledgeLibraries = await listKnowledgeLibraries(session.user.id);

  const totalPublic = knowledgeSources.filter(
    (knowledge) => knowledge.visibility === "public",
  ).length;

  const totalPrivate = knowledgeSources.length - totalPublic;

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <KnowledgeStats
          total={knowledgeSources.length}
          totalPrivate={totalPrivate}
          totalPublic={totalPublic}
        />

        <KnowledgeContent
          knowledgeSources={knowledgeSources}
          knowledgeLibraries={knowledgeLibraries}
          selectedLibraryId={selectedLibraryId}
        />
      </div>
    </div>
  );
}