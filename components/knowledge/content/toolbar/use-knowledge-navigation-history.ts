// components/knowledge/content/toolbar/use-knowledge-navigation-history.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import type { KnowledgeNavigationHistory } from "./types";

const KNOWLEDGE_HISTORY_KEY =
  "knowledge-navigation-history";

const EMPTY_HISTORY: KnowledgeNavigationHistory = {
  entries: [],
  currentIndex: -1,
};

function isKnowledgeHref(href: string) {
  return (
    href === "/knowledge" ||
    href.startsWith("/knowledge?") ||
    href.startsWith("/knowledge/")
  );
}

function readKnowledgeHistory(): KnowledgeNavigationHistory {
  if (typeof window === "undefined") {
    return EMPTY_HISTORY;
  }

  const storedValue = window.sessionStorage.getItem(
    KNOWLEDGE_HISTORY_KEY,
  );

  if (!storedValue) {
    return EMPTY_HISTORY;
  }

  try {
    const parsedValue = JSON.parse(
      storedValue,
    ) as KnowledgeNavigationHistory;

    if (
      !Array.isArray(parsedValue.entries) ||
      typeof parsedValue.currentIndex !== "number"
    ) {
      throw new Error("Historial de navegación inválido");
    }

    const validEntries = parsedValue.entries.filter(
      (entry): entry is string => {
        return (
          typeof entry === "string" &&
          isKnowledgeHref(entry)
        );
      },
    );

    if (validEntries.length === 0) {
      return EMPTY_HISTORY;
    }

    const validIndex = Math.min(
      Math.max(parsedValue.currentIndex, 0),
      validEntries.length - 1,
    );

    return {
      entries: validEntries,
      currentIndex: validIndex,
    };
  } catch {
    window.sessionStorage.removeItem(
      KNOWLEDGE_HISTORY_KEY,
    );

    return EMPTY_HISTORY;
  }
}

function writeKnowledgeHistory(
  history: KnowledgeNavigationHistory,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    KNOWLEDGE_HISTORY_KEY,
    JSON.stringify(history),
  );
}

export function useKnowledgeNavigationHistory() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [navigationHistory, setNavigationHistory] =
    useState<KnowledgeNavigationHistory>(EMPTY_HISTORY);

  const currentHref = useMemo(() => {
    const query = searchParams.toString();

    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const canGoBack =
    navigationHistory.currentIndex > 0;

  const canGoForward =
    navigationHistory.currentIndex >= 0 &&
    navigationHistory.currentIndex <
      navigationHistory.entries.length - 1;

  useEffect(() => {
    if (!isKnowledgeHref(currentHref)) {
      return;
    }

    const storedHistory = readKnowledgeHistory();

    const storedCurrentHref =
      storedHistory.currentIndex >= 0
        ? storedHistory.entries[
            storedHistory.currentIndex
          ]
        : null;

    /*
     * Cuando navegamos mediante las flechas internas,
     * el índice ya está guardado antes de cambiar la URL.
     */
    if (storedCurrentHref === currentHref) {
      setNavigationHistory(storedHistory);
      return;
    }

    /*
     * Cuando se abre una carpeta mediante un enlace,
     * eliminamos el historial futuro y añadimos la ruta.
     */
    const previousEntries =
      storedHistory.currentIndex >= 0
        ? storedHistory.entries.slice(
            0,
            storedHistory.currentIndex + 1,
          )
        : [];

    const lastEntry =
      previousEntries[previousEntries.length - 1];

    const nextEntries =
      lastEntry === currentHref
        ? previousEntries
        : [...previousEntries, currentHref];

    const limitedEntries = nextEntries.slice(-50);

    const nextHistory: KnowledgeNavigationHistory = {
      entries: limitedEntries,
      currentIndex: limitedEntries.length - 1,
    };

    writeKnowledgeHistory(nextHistory);
    setNavigationHistory(nextHistory);
  }, [currentHref]);

  function goBack() {
    if (!canGoBack) {
      return;
    }

    const nextIndex =
      navigationHistory.currentIndex - 1;

    const targetHref =
      navigationHistory.entries[nextIndex];

    if (!targetHref) {
      return;
    }

    const nextHistory: KnowledgeNavigationHistory = {
      ...navigationHistory,
      currentIndex: nextIndex,
    };

    writeKnowledgeHistory(nextHistory);
    setNavigationHistory(nextHistory);
    router.push(targetHref);
  }

  function goForward() {
    if (!canGoForward) {
      return;
    }

    const nextIndex =
      navigationHistory.currentIndex + 1;

    const targetHref =
      navigationHistory.entries[nextIndex];

    if (!targetHref) {
      return;
    }

    const nextHistory: KnowledgeNavigationHistory = {
      ...navigationHistory,
      currentIndex: nextIndex,
    };

    writeKnowledgeHistory(nextHistory);
    setNavigationHistory(nextHistory);
    router.push(targetHref);
  }

  function navigateTo(href: string) {
    if (!isKnowledgeHref(href)) {
      return;
    }

    router.push(href);
  }

  return {
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    navigateTo,
  };
}