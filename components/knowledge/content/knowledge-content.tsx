// components/knowledge/content/knowledge-content.tsx
"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { KnowledgeToolbar } from "./knowledge-toolbar";
import { KnowledgeExplorer } from "./knowledge-explorer";
import { KnowledgeLibraryBreadcrumb } from "./knowledge-library-breadcrumb";
import {
  buildLibraryTree,
  getLibraryPath,
} from "@/components/knowledge/sidebar/tree-utils";

type KnowledgeSource = {
  id: string;
  title: string;
  description?: string | null;
  content?: string |null;
  status?: string | null;
  visibility?: string | null;
  updated_at?: Date | string | null;
};

type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
};

type Props = {
  knowledgeSources: KnowledgeSource[];
  knowledgeLibraries: KnowledgeLibrary[];
  selectedLibraryId: string | null;
};

export function KnowledgeContent({
  knowledgeSources,
  knowledgeLibraries,
  selectedLibraryId,
}: Props) {
  const [search, setSearch] = useState("");

  const filteredKnowledge = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return knowledgeSources;
    }

    return knowledgeSources.filter((item) => {
      return (
        item.title.toLowerCase().includes(value) ||
        item.description?.toLowerCase().includes(value) ||
        item.content?.toLowerCase().includes(value)
      );
    });
  }, [knowledgeSources, search]);

  const childLibraries = knowledgeLibraries.filter(
  (library) => library.parent_id === selectedLibraryId,
);
const libraryTree = useMemo(
  () => buildLibraryTree(knowledgeLibraries),
  [knowledgeLibraries],
);

const libraryPath = useMemo(
  () => getLibraryPath(libraryTree, selectedLibraryId),
  [libraryTree, selectedLibraryId],
);

return (
  <>
<div className="mb-4 flex items-center justify-between gap-4">
  <KnowledgeLibraryBreadcrumb path={libraryPath} />

  <Link
    href={
      selectedLibraryId
        ? `/knowledge/new?library=${selectedLibraryId}`
        : "/knowledge/new"
    }
    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
  >
    <Plus className="h-4 w-4" />
    Nuevo
  </Link>
</div>

    <KnowledgeToolbar
      search={search}
      onSearchChange={setSearch}
    />

    <KnowledgeExplorer
      folders={childLibraries}
      knowledgeSources={filteredKnowledge}
    />
  </>
);
}