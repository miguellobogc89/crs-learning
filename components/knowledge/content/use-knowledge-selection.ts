// components/knowledge/content/use-knowledge-selection.ts

"use client";

import { useState } from "react";

export function useKnowledgeSelection() {
  const [selectedArticleIds, setSelectedArticleIds] =
    useState<Set<string>>(new Set());

  const [selectedFolderIds, setSelectedFolderIds] =
    useState<Set<string>>(new Set());

  const selectedCount =
    selectedArticleIds.size +
    selectedFolderIds.size;

  function toggleArticleSelection(
    id: string,
    selected: boolean,
  ) {
    setSelectedArticleIds((current) => {
      const next = new Set(current);

      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  function toggleFolderSelection(
    id: string,
    selected: boolean,
  ) {
    setSelectedFolderIds((current) => {
      const next = new Set(current);

      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  function clearSelection() {
    setSelectedArticleIds(new Set());
    setSelectedFolderIds(new Set());
  }

  return {
    selectedArticleIds,
    selectedFolderIds,
    selectedCount,
    toggleArticleSelection,
    toggleFolderSelection,
    clearSelection,
  };
}