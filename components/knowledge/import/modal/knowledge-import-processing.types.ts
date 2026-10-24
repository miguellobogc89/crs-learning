
export type {
  KnowledgeImportFileStatus as KnowledgeImportFileProgressStatus,
  KnowledgeImportFlowFile as KnowledgeImportFileProgress,
  KnowledgeImportFlowSummary as KnowledgeImportProgressSummary,
} from "@/components/knowledge/import/types/import-flow.types";

export type KnowledgeImportProcessingPhase =
  | "uploading"
  | "preparing"
  | "extracting"
  | "reviewing_batch"
  | "generating_proposal";
