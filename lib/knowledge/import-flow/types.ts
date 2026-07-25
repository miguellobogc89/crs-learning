
export type KnowledgeImportFileStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "processing"
  | "completed"
  | "duplicate"
  | "error";

export type KnowledgeImportFlowFile = {
  id: string;
  name: string;
  size?: number;
  fileType?: string;
  status: KnowledgeImportFileStatus;
  relativePath?: string;
  processingOrder?: number | null;
  processingStep?: string | null;
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
  error: string | null;
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

export type DuplicateFileSnapshot = {
  name: string;
  relativePath: string;
  size: number;
  existingFileId: string;
  existingArticleId: string;
  existingArticleTitle: string;
};
