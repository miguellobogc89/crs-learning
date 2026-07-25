
export type {
  KnowledgeImportFileStatus as KnowledgeIntakeFileProgressStatus,
  KnowledgeImportFlowFile as KnowledgeIntakeFileProgress,
  KnowledgeImportFlowSummary as KnowledgeIntakeProgressSummary,
} from "@/lib/knowledge/import-flow";

export type KnowledgeIntakeProcessingPhase =
  | "uploading"
  | "preparing"
  | "extracting"
  | "generating_proposal";
