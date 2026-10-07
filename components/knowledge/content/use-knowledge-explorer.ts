// components/knowledge/content/use-knowledge-explorer.ts

"use client";

import { useMemo } from "react";

import type {
  ExplorerState,
  ExplorerStatus,
} from "./toolbar/types";

export const KNOWLEDGE_PAGE_SIZE = 12;

export type UpdatedByUser = {
  id: string;
  name: string | null;
  email?: string | null;
  image?: string | null;
};

export type KnowledgeSource = {
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

  _count?: {
    knowledge_files: number;
  };

  users_knowledge_sources_updated_by_user_idTousers?:
    | UpdatedByUser
    | null;
};

export type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
  is_shared?: boolean;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  article_count?: number;
  folder_count?: number;
  file_count?: number;

  users_knowledge_libraries_updated_by_user_idTousers?:
    | UpdatedByUser
    | null;
};

type Props = {
  knowledgeSources: KnowledgeSource[];
  knowledgeLibraries: KnowledgeLibrary[];
  currentFolderId: string | null;
  selectedView: string;
  explorerState: ExplorerState;
  page: number;
};

function normalizeSearchValue(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (
        item &&
        typeof item === "object" &&
        "name" in item
      ) {
        return String(item.name);
      }

      return "";
    })
    .join(" ");
}

function normalizeArticleStatus(
  status: string | null | undefined,
): ExplorerStatus {
  if (
    status === "ready" ||
    status === "processed"
  ) {
    return "ready";
  }

  if (status === "processing") {
    return "processing";
  }

  if (status === "error") {
    return "error";
  }

  return "draft";
}

function getDateTimestamp(
  value: Date | string | null | undefined,
) {
  if (!value) {
    return 0;
  }

  const timestamp =
    new Date(value).getTime();

  return Number.isNaN(timestamp)
    ? 0
    : timestamp;
}

export function useKnowledgeExplorer({
  knowledgeSources,
  knowledgeLibraries,
  currentFolderId,
  selectedView,
  explorerState,
  page,
}: Props) {
  const baseChildLibraries =
    useMemo(() => {
      if (selectedView === "shared") {
        return knowledgeLibraries.filter(
          (library) =>
            library.is_shared,
        );
      }

      return knowledgeLibraries.filter(
        (library) => {
          if (library.is_shared) {
            return false;
          }

          return (
            library.parent_id ===
            currentFolderId
          );
        },
      );
    }, [
      knowledgeLibraries,
      currentFolderId,
      selectedView,
    ]);

  const processedLibraries =
    useMemo(() => {
      if (
        explorerState.itemType ===
          "articles" ||
        explorerState.status !== "all"
      ) {
        return [];
      }

      const searchValue =
        explorerState.search
          .trim()
          .toLocaleLowerCase("es");

      const filtered =
        baseChildLibraries.filter(
          (library) => {
            if (!searchValue) {
              return true;
            }

            return library.name
              .toLocaleLowerCase("es")
              .includes(searchValue);
          },
        );

      return [...filtered].sort(
        (first, second) => {
          if (
            explorerState.sort ===
            "name_asc"
          ) {
            return first.name.localeCompare(
              second.name,
              "es",
              {
                sensitivity: "base",
              },
            );
          }

          if (
            explorerState.sort ===
            "name_desc"
          ) {
            return second.name.localeCompare(
              first.name,
              "es",
              {
                sensitivity: "base",
              },
            );
          }

          const firstDate =
            getDateTimestamp(
              first.updated_at,
            );

          const secondDate =
            getDateTimestamp(
              second.updated_at,
            );

          if (
            explorerState.sort ===
            "updated_asc"
          ) {
            return (
              firstDate - secondDate
            );
          }

          return (
            secondDate - firstDate
          );
        },
      );
    }, [
      baseChildLibraries,
      explorerState.itemType,
      explorerState.search,
      explorerState.sort,
      explorerState.status,
    ]);

  const processedKnowledge =
    useMemo(() => {
      if (
        explorerState.itemType ===
        "folders"
      ) {
        return [];
      }

      const searchValue =
        explorerState.search
          .trim()
          .toLocaleLowerCase("es");

      const filtered =
        knowledgeSources.filter(
          (item) => {
            const normalizedStatus =
              normalizeArticleStatus(
                item.status,
              );

            if (
              explorerState.status !==
                "all" &&
              normalizedStatus !==
                explorerState.status
            ) {
              return false;
            }

            if (!searchValue) {
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
              item.knowledge_type,
              item.visibility,
              normalizeSearchValue(
                item.tags,
              ),
              normalizeSearchValue(
                item.keywords,
              ),
              normalizeSearchValue(
                item.entities,
              ),
            ]
              .filter(Boolean)
              .join(" ")
              .toLocaleLowerCase("es");

            return searchableText.includes(
              searchValue,
            );
          },
        );

      return [...filtered].sort(
        (first, second) => {
          if (
            explorerState.sort ===
            "name_asc"
          ) {
            return first.title.localeCompare(
              second.title,
              "es",
              {
                sensitivity: "base",
              },
            );
          }

          if (
            explorerState.sort ===
            "name_desc"
          ) {
            return second.title.localeCompare(
              first.title,
              "es",
              {
                sensitivity: "base",
              },
            );
          }

          if (
            explorerState.sort ===
            "status"
          ) {
            return normalizeArticleStatus(
              first.status,
            ).localeCompare(
              normalizeArticleStatus(
                second.status,
              ),
              "es",
            );
          }

          const firstDate =
            getDateTimestamp(
              first.updated_at,
            );

          const secondDate =
            getDateTimestamp(
              second.updated_at,
            );

          if (
            explorerState.sort ===
            "updated_asc"
          ) {
            return (
              firstDate - secondDate
            );
          }

          return (
            secondDate - firstDate
          );
        },
      );
    }, [
      knowledgeSources,
      explorerState.itemType,
      explorerState.search,
      explorerState.sort,
      explorerState.status,
    ]);

  const totalItems =
    processedLibraries.length +
    processedKnowledge.length;

  const totalPages = Math.max(
    1,
    Math.ceil(
      totalItems /
        KNOWLEDGE_PAGE_SIZE,
    ),
  );

  const currentPage = Math.min(
    page,
    totalPages,
  );

  const paginatedItems =
    useMemo(() => {
      const start =
        (currentPage - 1) *
        KNOWLEDGE_PAGE_SIZE;

      const end =
        start +
        KNOWLEDGE_PAGE_SIZE;

      const visibleFolders =
        processedLibraries.slice(
          start,
          end,
        );

      const documentStart =
        Math.max(
          0,
          start -
            processedLibraries.length,
        );

      const remainingSlots =
        KNOWLEDGE_PAGE_SIZE -
        visibleFolders.length;

      const visibleKnowledge =
        remainingSlots > 0
          ? processedKnowledge.slice(
              documentStart,
              documentStart +
                remainingSlots,
            )
          : [];

      return {
        folders: visibleFolders,
        knowledgeSources:
          visibleKnowledge,
      };
    }, [
      currentPage,
      processedLibraries,
      processedKnowledge,
    ]);

  const visibleItems =
    explorerState.viewMode === "list"
      ? {
          folders:
            processedLibraries,
          knowledgeSources:
            processedKnowledge,
        }
      : paginatedItems;

  return {
    visibleItems,
    totalItems,
    totalPages,
    currentPage,
  };
}