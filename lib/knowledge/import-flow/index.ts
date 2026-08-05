// lib/knowledge/import-flow
export {
  deduplicateBrowserFiles,
  getBrowserFileRelativePath,
  getBrowserImportMode,
} from "./file-selection";

export {
  getKnowledgeImportMimeType,
  isPlainTextKnowledgeDocument,
  isSupportedKnowledgeArchive,
  isSupportedKnowledgeDocument,
  KNOWLEDGE_IMPORT_ARCHIVE_ACCEPT,
  KNOWLEDGE_IMPORT_ARCHIVE_FORMATS,
  KNOWLEDGE_IMPORT_DOCUMENT_ACCEPT,
  KNOWLEDGE_IMPORT_DOCUMENT_FORMATS,
  KNOWLEDGE_IMPORT_UPLOAD_ACCEPT,
  KNOWLEDGE_IMPORT_ZIP_MIME_TYPES,
} from "./supported-formats";

export {
  createFilesFromAnalysisSnapshot,
  createEmptyImportSummary,
  createInitialImportFiles,
  createInitialImportSummary,
  createSummaryFromAnalysisSnapshot,
  finalizeImportAnalysis,
  finalizeImportFiles,
  markFilesUploaded,
  markFilesUploading,
  mergeServerProgress,
} from "./progress";

export type {
  AnalyzeImportFlowFile,
  BrowserFileInput,
  KnowledgeImportFileStatus,
  KnowledgeImportFlowFile,
  KnowledgeImportFlowSummary,
  ServerProgressFile,
  ServerProgressSnapshot,
} from "./types";
