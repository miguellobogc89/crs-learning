// components/knowledge/intake/modal/knowledge-intake-processing.types.ts

export type KnowledgeIntakeProcessingPhase =
  | "uploading"
  | "preparing"
  | "extracting"
  | "generating_proposal";

export type KnowledgeIntakeFileProgressStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "processing"
  | "completed"
  | "error";

export type KnowledgeIntakeFileProgress = {
  id: string;
  name: string;
  size?: number;
  fileType?: string;
  status: KnowledgeIntakeFileProgressStatus;
  relativePath?: string;
  processingOrder?: number | null;
  processingStep?: string | null;
  error?: string;
};

export type KnowledgeIntakeProgressSummary = {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  processedFiles: number;
  pendingFiles: number;
  progressPercentage: number;
  currentFileName?: string | null;
};