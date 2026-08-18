// components/knowledge/import/modal/knowledge-import-modal.types.ts

import type { ConfirmKnowledgeImportResult } from "@/lib/knowledge/import/types";

export type KnowledgeImportOrigin =
  | "root"
  | "folder"
  | "article";

export type KnowledgeImportContext =
  | {
      origin: "root";
      libraryId: string;
      articleId?: never;
    }
  | {
      origin: "folder";
      libraryId: string;
      articleId?: never;
    }
  | {
      origin: "article";
      libraryId: string;
      articleId: string;
    };

export type KnowledgeImportModalStep =
  | "upload"
  | "analyzing"
  | "analysis_result"
  | "proposal"
  | "completed";

export type KnowledgeImportModalProps = {
  open: boolean;
  context: KnowledgeImportContext | null;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (
    result: ConfirmKnowledgeImportResult,
  ) => void;
  selectedFiles?: File[];
};
