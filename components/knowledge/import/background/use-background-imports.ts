// components/knowledge/import/background/use-background-imports.ts

"use client";

import {
  useContext,
} from "react";

import {
  KnowledgeImportBackgroundContext,
} from "./knowledge-import-provider";

export function useBackgroundImports() {
  const context = useContext(
    KnowledgeImportBackgroundContext,
  );

  if (!context) {
    throw new Error(
      "useBackgroundImports debe utilizarse dentro de KnowledgeImportProvider",
    );
  }

  return context;
}