
export type KnowledgeImportFileStatus =
  | "ready"
  | "pending"
  | "uploading"
  | "uploaded"
  | "processing"
  | "completed"
  | "duplicate"
  | "unsupported"
  | "error";

export type KnowledgeImportFlowFile = {
  id: string;
  name: string;
  size?: number;
  fileType?: string;
  status: KnowledgeImportFileStatus;
  relativePath?: string;
  processingOrder?: number | null;
  processingStatus?: string | null;
  processingStep?: string | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  error?: string;
  duplicateOf?: {
    fileId: string;
    articleId: string;
    articleTitle: string;
  };
};

export type KnowledgeImportFlowSummary = {
  totalFiles: number;
  completedFiles: number;
  duplicateFiles: number;
  failedFiles: number;
  processedFiles: number;
  pendingFiles: number;
  progressPercentage: number;
  currentFileName: string | null;
};

export type BrowserFileInput = {
  id: string;
  file: File;
};

export type ServerProgressFile = {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  status: string;
  processingOrder: number | null;
  processingStatus: string | null;
  processingStep: string | null;
  fileType?: string | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  error: string | null;
};

export type AnalyzeImportFlowFile = {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  fileType?: string | null;
  status:
    | "ready"
    | "duplicate"
    | "unsupported";
  processingOrder?: number | null;
  processingStatus?: string | null;
  processingStep?: string | null;
  error?: string | null;
  duplicateOf?: {
    fileId: string;
    articleId: string;
    articleTitle: string;
  };
};

export type ServerProgressSnapshot = {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  processedFiles: number;
  pendingFiles: number;
  progressPercentage: number;
  currentFile: {
    name: string;
  } | null;
  files: ServerProgressFile[];
};
