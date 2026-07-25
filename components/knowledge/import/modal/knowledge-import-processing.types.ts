
export type {
  KnowledgeImportFileStatus as KnowledgeImportFileProgressStatus,
  KnowledgeImportFlowFile as KnowledgeImportFileProgress,
  KnowledgeImportFlowSummary as KnowledgeImportProgressSummary,
} from "@/lib/knowledge/import-flow";

export type KnowledgeImportProcessingPhase =
  | "uploading"
  | "preparing"
  | "extracting"
  | "generating_proposal";
