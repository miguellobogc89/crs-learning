// components/knowledge/content/knowledge-content.tsx
"use client";

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
    <KnowledgeToolbar
        search={search}
        onSearchChange={setSearch}
        breadcrumb={
            <KnowledgeLibraryBreadcrumb path={libraryPath} />
        }
        />

    <KnowledgeExplorer
      folders={childLibraries}
      knowledgeSources={filteredKnowledge}
    />
  </>
);
}