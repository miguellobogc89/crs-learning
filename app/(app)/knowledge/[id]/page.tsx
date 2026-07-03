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

  if (
    knowledge.owner_user_id !== session.user.id &&
    knowledge.visibility !== "public"
  ) {
    notFound();
  }

  return (
    <main className="h-full overflow-y-auto bg-background">
      <KnowledgeDetailClient knowledge={knowledge} />
    </main>
  );
}