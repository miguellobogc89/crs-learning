// components/knowledge/content/knowledge-explorer.tsx
"use client";

import { KnowledgeCard } from "./knowledge-card";
import { KnowledgeFolderCard } from "./knowledge-folder-card";

type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
};

type KnowledgeSource = {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  status?: string | null;
  visibility?: string | null;
  updated_at?: Date | string | null;
};

type Props = {
  folders: KnowledgeLibrary[];
  knowledgeSources: KnowledgeSource[];
};

export function KnowledgeExplorer({
  folders,
  knowledgeSources,
}: Props) {
  if (folders.length === 0 && knowledgeSources.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-card text-center">
        <p className="text-sm text-muted-foreground">
          Esta biblioteca está vacía.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {folders.map((folder) => (
        <KnowledgeFolderCard key={folder.id} folder={folder} />
      ))}

      {knowledgeSources.map((knowledge) => (
        <KnowledgeCard key={knowledge.id} knowledge={knowledge} />
      ))}
    </div>
  );
}