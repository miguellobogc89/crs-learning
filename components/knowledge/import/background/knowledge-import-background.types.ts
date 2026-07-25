// components/knowledge/import/background/knowledge-import-background.types.ts

import type {
  KnowledgeImportProgress,
} from "../knowledge-import-api";

export type BackgroundKnowledgeImportTask = {
  importId: string;
  progress: KnowledgeImportProgress | null;
  error: string | null;
  registeredAt: string;
  updatedAt: string;
};

export type KnowledgeImportBackgroundContextValue = {
  tasks: BackgroundKnowledgeImportTask[];
  activeTasks: BackgroundKnowledgeImportTask[];
  registerImport: (
    importId: string,
  ) => void;
  removeImport: (
    importId: string,
  ) => void;
  refreshImport: (
    importId: string,
  ) => Promise<void>;
};