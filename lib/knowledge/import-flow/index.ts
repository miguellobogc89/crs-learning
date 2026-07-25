export {
  adaptConfirmationResult,
  adaptImportProposal,
} from "./proposal-adapter";


export {
  deduplicateBrowserFiles,
  getBrowserFileRelativePath,
  getBrowserImportMode,
} from "./file-selection";

export {
  applyDuplicateSnapshot,
  createEmptyImportSummary,
  createInitialImportFiles,
  createInitialImportSummary,
  finalizeImportAnalysis,
  finalizeImportFiles,
  markFilesUploaded,
  markFilesUploading,
  mergeServerProgress,
} from "./progress";

export type {
  BrowserFileInput,
  DuplicateFileSnapshot,
  KnowledgeImportFileStatus,
  KnowledgeImportFlowFile,
  KnowledgeImportFlowSummary,
  ServerProgressFile,
  ServerProgressSnapshot,
} from "./types";
