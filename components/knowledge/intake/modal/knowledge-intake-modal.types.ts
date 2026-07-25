// components/knowledge/intake/modal/knowledge-intake-modal.types.ts

import type { ConfirmKnowledgeImportResult } from "@/lib/knowledge/import/types";

export type KnowledgeIntakeOrigin =
  | "root"
  | "folder"
  | "article";

export type KnowledgeIntakeContext =
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

export type KnowledgeIntakeModalStep =
  | "upload"
  | "analyzing"
  | "analysis_result"
  | "proposal"
  | "completed";

export type KnowledgeIntakeModalProps = {
  open: boolean;
  context: KnowledgeIntakeContext | null;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (
    result: ConfirmKnowledgeImportResult,
  ) => void;
  selectedFiles?: File[];
};
