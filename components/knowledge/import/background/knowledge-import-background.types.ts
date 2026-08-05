// components/knowledge/import/background/knowledge-import-background.types.ts

import type {
  ConfirmKnowledgeImportResult,
  KnowledgeImportProposal,
} from "@/lib/knowledge/import/types";
import type {
  KnowledgeImportFlowFile,
  KnowledgeImportFlowSummary,
} from "@/lib/knowledge/import-flow";

import type {
  KnowledgeImportProgress,
  KnowledgeImportProposalProgress,
} from "../knowledge-import-api";
import type {
  KnowledgeImportContext,
  KnowledgeImportModalStep,
} from "../modal/knowledge-import-modal.types";
import type {
  KnowledgeImportProcessingPhase,
} from "../modal/knowledge-import-processing.types";

export type BackgroundKnowledgeImportTask = {
  importId: string;
  context: KnowledgeImportContext | null;
  displayMode: "modal" | "widget";
  detailHost: "local" | "global";
  label: string | null;
  step: KnowledgeImportModalStep;
  phase: KnowledgeImportProcessingPhase;
  status: string;
  progress: KnowledgeImportProgress | null;
  summary: KnowledgeImportFlowSummary;
  files: KnowledgeImportFlowFile[];
  error: string | null;
  proposal: KnowledgeImportProposal | null;
  proposalProgress: KnowledgeImportProposalProgress | null;
  completionResult: ConfirmKnowledgeImportResult | null;
  isAnalyzing: boolean;
  isConfirming: boolean;
  isCancelling: boolean;
  registeredAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type KnowledgeImportNextAction =
  | "generate_proposal"
  | "confirm_proposal"
  | null;

export type KnowledgeImportCurrentAction =
  | "uploading"
  | "analyzing"
  | "extracting"
  | "generating_proposal"
  | "confirming"
  | "cancelling"
  | null;

export type KnowledgeImportSharedState = {
  importId: string;
  currentStep: KnowledgeImportModalStep;
  processingPhase: KnowledgeImportProcessingPhase;
  status: string;
  currentAction: KnowledgeImportCurrentAction;
  nextAction: KnowledgeImportNextAction;
  canContinue: boolean;
  canContinueInBackground: boolean;
  isBusy: boolean;
  isWaitingUser: boolean;
  hasProposal: boolean;
  hasCompletionResult: boolean;
  progress: KnowledgeImportProgress | null;
  progressSummary: KnowledgeImportFlowSummary;
  fileProgress: KnowledgeImportFlowFile[];
  error: string | null;
};

export type KnowledgeImportTaskPatch =
  Partial<
    Omit<
      BackgroundKnowledgeImportTask,
      "importId" | "registeredAt"
    >
  >;

export type KnowledgeImportBackgroundContextValue = {
  tasks: BackgroundKnowledgeImportTask[];
  activeTasks: BackgroundKnowledgeImportTask[];
  currentTask: BackgroundKnowledgeImportTask | null;
  widgetTask: BackgroundKnowledgeImportTask | null;
  registerImport: (
    importId: string,
    patch?: KnowledgeImportTaskPatch,
  ) => void;
  updateImport: (
    importId: string,
    patch: KnowledgeImportTaskPatch,
  ) => void;
  removeImport: (
    importId: string,
  ) => void;
  refreshImport: (
    importId: string,
  ) => Promise<void>;
  getImportState: (
    importId: string,
  ) => KnowledgeImportSharedState | null;
  continueWithValidDocuments: (
    importId: string,
  ) => Promise<void>;
  confirmProposal: (
    importId: string,
  ) => Promise<ConfirmKnowledgeImportResult | null>;
  continueInBackground: (
    importId: string,
  ) => void;
  showImportDetail: (
    importId: string,
  ) => void;
  cancelImport: (
    importId: string,
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
  finishImport: (
    importId: string,
  ) => void;
};
