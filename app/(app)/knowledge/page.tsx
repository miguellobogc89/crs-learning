// app/(app)/knowledge/page.tsx
import { redirect } from "next/navigation";

import { KnowledgeContent } from "@/components/knowledge/content/knowledge-content";
import { auth } from "@/auth";
import { listVisibleKnowledgeSources } from "@/lib/services/knowledge.service";
import { listKnowledgeLibraries } from "@/lib/services/knowledge-library.service";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ library?: string; view?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const params = await searchParams;
  const selectedLibraryId = params.library ?? null;
  const selectedView = params.view ?? "all";

  const allKnowledgeSources = await listVisibleKnowledgeSources(session.user.id);
  const knowledgeLibraries = await listKnowledgeLibraries(session.user.id);

  const sharedLibraryIds = knowledgeLibraries
    .filter((library) => library.is_shared)
    .map((library) => library.id);

  const knowledgeSources = allKnowledgeSources.filter((knowledge) => {
    if (selectedView === "shared") {
      if (!knowledge.library_id) {
        return false;
      }

      return sharedLibraryIds.includes(knowledge.library_id);
    }

    if (selectedLibraryId && knowledge.library_id !== selectedLibraryId) {
      return false;
    }

    if (selectedView === "public") {
      return knowledge.visibility === "public";
    }

    if (selectedView === "private") {
      return knowledge.visibility !== "public";
    }

    return true;
  });

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl px-8 py-6">
        <KnowledgeContent
          knowledgeSources={knowledgeSources}
          knowledgeLibraries={knowledgeLibraries}
          selectedLibraryId={selectedLibraryId}
          selectedView={selectedView}
        />
      </div>
    </div>
  );
}