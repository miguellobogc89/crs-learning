// components/knowledge/intake/modal/knowledge-intake-processing.types.ts

export type KnowledgeIntakeProcessingPhase =
  | "uploading"
  | "analyzing";

export type KnowledgeIntakeFileProgressStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "error";

export type KnowledgeIntakeFileProgress = {
  id: string;
  name: string;
  status: KnowledgeIntakeFileProgressStatus;
  error?: string;
};