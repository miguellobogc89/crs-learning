// components/knowledge/intake/modal/knowledge-intake-modal.types.ts

import type { ConfirmKnowledgeIntakeResult } from "@/lib/knowledge/intake/types";

export type KnowledgeIntakeOrigin = "root" | "folder" | "article";

export type KnowledgeIntakeContext =
  | { origin: "root"; libraryId: string; articleId?: never }
  | { origin: "folder"; libraryId: string; articleId?: never }
  | { origin: "article"; libraryId: string; articleId: string };

export type KnowledgeIntakeModalStep =
  | "upload"
  | "analyzing"
  | "proposal"
  | "completed";

export type KnowledgeIntakeModalProps = {
  open: boolean;
  context: KnowledgeIntakeContext | null;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (result: ConfirmKnowledgeIntakeResult) => void;
  selectedFiles?: File[];
};
