// app/(app)/knowledge/layout.tsx
import { ReactNode } from "react";

import { auth } from "@/auth";
import { KnowledgeShell } from "@/components/knowledge/knowledge-shell";
import { listVisibleKnowledgeSources } from "@/lib/services/knowledge.service";
import { listKnowledgeLibraries } from "@/lib/services/knowledge-library.service";

export default async function KnowledgeLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  const knowledgeSources = await listVisibleKnowledgeSources(session!.user.id);
  const knowledgeLibraries = await listKnowledgeLibraries(session!.user.id);

  return (
    <KnowledgeShell
      knowledgeSources={knowledgeSources}
      knowledgeLibraries={knowledgeLibraries}
    >
      {children}
    </KnowledgeShell>
  );
}