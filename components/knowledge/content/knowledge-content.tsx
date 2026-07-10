// components/knowledge/content/knowledge-content.tsx
"use client";

import { useMemo, useState } from "react";

import { KnowledgeExplorer } from "./knowledge-explorer";
import { KnowledgeLibraryBreadcrumb } from "./knowledge-library-breadcrumb";
import { KnowledgeToolbar } from "./knowledge-toolbar";
import {
  buildLibraryTree,
  getLibraryPath,
} from "@/components/knowledge/sidebar/tree-utils";

type KnowledgeSource = {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  summary?: string | null;
  language?: string | null;
  domain?: string | null;
  level?: string | null;
  tags?: unknown;
  keywords?: unknown;
  entities?: unknown;
  status?: string | null;
  visibility?: string | null;
  updated_at?: Date | string | null;
  knowledge_type?: string | null;
  confidence?: number | null;
  library_id?: string | null;
};

type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
  is_shared?: boolean;
};

type ExplorerState = {
  search: string;
  viewMode: "grid" | "list";
  sort: "updated_desc" | "updated_asc" | "name_asc" | "name_desc" | "status";
};

type Props = {
  knowledgeSources: KnowledgeSource[];
  knowledgeLibraries: KnowledgeLibrary[];
  selectedLibraryId: string | null;
  selectedView: string;
};

function normalizeSearchValue(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object" && "name" in item) {
        return String(item.name);
      }

      return "";
    })
    .join(" ");
}

export function KnowledgeContent({
  knowledgeSources,
  knowledgeLibraries,
  selectedLibraryId,
  selectedView,
}: Props) {
  const [explorerState, setExplorerState] = useState<ExplorerState>({
    search: "",
    viewMode: "grid",
    sort: "updated_desc",
  });

  const childLibraries = useMemo(() => {
    if (selectedView === "shared") {
      return knowledgeLibraries.filter((library) => library.is_shared);
    }

    return knowledgeLibraries.filter((library) => {
      if (library.is_shared) {
        return false;
      }

      return library.parent_id === selectedLibraryId;
    });
  }, [knowledgeLibraries, selectedLibraryId, selectedView]);

  const processedKnowledge = useMemo(() => {
    const value = explorerState.search.trim().toLowerCase();

    const filtered = knowledgeSources.filter((item) => {
      if (!value) {
        return true;
      }

      const searchableText = [
        item.title,
        item.description,
        item.content,
        item.summary,
        item.language,
        item.domain,
        item.level,
        normalizeSearchValue(item.tags),
        normalizeSearchValue(item.keywords),
        normalizeSearchValue(item.entities),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(value);
    });

    return [...filtered].sort((a, b) => {
      if (explorerState.sort === "name_asc") {
        return a.title.localeCompare(b.title);
      }

      if (explorerState.sort === "name_desc") {
        return b.title.localeCompare(a.title);
      }

      if (explorerState.sort === "status") {
        return (a.status ?? "").localeCompare(b.status ?? "");
      }

      const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;

      if (explorerState.sort === "updated_asc") {
        return dateA - dateB;
      }

      return dateB - dateA;
    });
  }, [knowledgeSources, explorerState.search, explorerState.sort]);

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
      <div className="mb-4">
        {selectedView === "shared" ? (
          <div className="text-sm text-muted-foreground">
            Compartido conmigo
          </div>
        ) : (
          <KnowledgeLibraryBreadcrumb path={libraryPath} />
        )}
      </div>

      <KnowledgeToolbar
        explorerState={explorerState}
        onExplorerStateChange={setExplorerState}
        selectedLibraryId={selectedLibraryId}
      />

      <KnowledgeExplorer
        folders={childLibraries}
        knowledgeSources={processedKnowledge}
        viewMode={explorerState.viewMode}
      />
    </>
  );
}