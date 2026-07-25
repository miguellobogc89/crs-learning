// components/knowledge/intake/modal/knowledge-import-modal.tsx

"use client";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

import { useKnowledgeImport } from "../hooks/use-knowledge-import";
import { KnowledgeImportModalHeader } from "./knowledge-import-modal-header";
import { KnowledgeImportModalProgress } from "./knowledge-import-modal-progress";
import { KnowledgeImportModalFooter } from "./knowledge-import-modal-footer";
import { KnowledgeImportUploadStep } from "./knowledge-import-upload-step";
import { KnowledgeImportProcessingStep } from "./knowledge-import-processing-step";
import { KnowledgeImportProposalStep } from "./knowledge-import-proposal-step";
import { KnowledgeImportCompletedStep } from "./knowledge-import-completed-step";
import { KnowledgeImportCloseGuard } from "./knowledge-import-close-guard";
import { KnowledgeImportLoadingOverlay } from "./knowledge-import-loading-overlay";

import type { KnowledgeImportModalProps } from "./knowledge-import-modal.types";

function getFilesSelectionKey(
  files: File[] | undefined,
) {
  if (!files?.length) {
    return null;
  }

  return files
    .map((file) =>
      [
        file.name,
        file.size,
        file.lastModified,
      ].join(":"),
    )
    .join("|");
}

export function KnowledgeImportModal({
  open,
  context,
  onOpenChange,
  onCompleted,
  selectedFiles,
}: KnowledgeImportModalProps) {
  const [
    closeGuardOpen,
    setCloseGuardOpen,
  ] = useState(false);

  const startedSelectionKeyRef =
    useRef<string | null>(null);

  const intake = useKnowledgeImport({
    context: context!,
    onCompleted,
  });

  const selectionKey =
    getFilesSelectionKey(
      selectedFiles,
    );

  const isWaitingToStart =
    open &&
    Boolean(selectedFiles?.length) &&
    intake.step === "upload" &&
    intake.files.length === 0;

  const duplicateFileCount =
    intake.fileProgress.filter(
      (file) =>
        file.status === "duplicate",
    ).length;

  useEffect(() => {
    if (!open) {
      startedSelectionKeyRef.current =
        null;
      return;
    }

    if (
      !selectedFiles?.length ||
      intake.files.length > 0
    ) {
      return;
    }

    intake.handleFilesChange(
      selectedFiles,
    );
  }, [
    open,
    selectedFiles,
    intake.files.length,
    intake.handleFilesChange,
  ]);

  useEffect(() => {
    if (
      !open ||
      !selectionKey ||
      intake.step !== "upload" ||
      intake.files.length === 0 ||
      startedSelectionKeyRef.current ===
        selectionKey
    ) {
      return;
    }

    startedSelectionKeyRef.current =
      selectionKey;

    void intake.analyzeDocuments();
  }, [
    open,
    selectionKey,
    intake.step,
    intake.files.length,
    intake.analyzeDocuments,
  ]);

  if (!context) {
    return null;
  }

  function requestClose() {
    if (
      intake.hasUnsavedProgress
    ) {
      setCloseGuardOpen(true);
      return;
    }

    intake.reset();
    startedSelectionKeyRef.current =
      null;
    onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            requestClose();
          }
        }}
      >
        <DialogContent
          showCloseButton
          style={{
            width: "900px",
            maxWidth: "92vw",
            height: "680px",
            maxHeight: "88vh",
          }}
          className="flex flex-col gap-0 overflow-hidden p-0"
        >
          <KnowledgeImportModalHeader
            context={context}
          />

          <KnowledgeImportModalProgress
            currentStep={
              isWaitingToStart
                ? "analyzing"
                : intake.step
            }
          />

          <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
            {isWaitingToStart ? (
              <KnowledgeImportProcessingStep
                phase="uploading"
                files={
                  intake.fileProgress
                }
                summary={{
                  totalFiles:
                    selectedFiles?.length ??
                    0,
                  completedFiles: 0,
                  duplicateFiles: 0,
                  failedFiles: 0,
                  processedFiles: 0,
                  pendingFiles:
                    selectedFiles?.length ??
                    0,
                  progressPercentage: 0,
                  currentFileName: null,
                }}
              />
            ) : null}

            {!isWaitingToStart &&
            intake.step === "upload" ? (
              <KnowledgeImportUploadStep
                files={intake.files}
                isAnalyzing={
                  intake.isAnalyzing
                }
                error={intake.error}
                onFilesChange={
                  intake.handleFilesChange
                }
              />
            ) : null}

            {!isWaitingToStart &&
            intake.step ===
              "analyzing" ? (
              <KnowledgeImportProcessingStep
                phase={
                  intake.processingPhase
                }
                files={
                  intake.fileProgress
                }
                summary={{
                  ...intake.progressSummary,
                  duplicateFiles:
                    duplicateFileCount,
                }}
                proposalProgress={
                  intake.proposalProgress
                }
              />
            ) : null}

            {intake.step ===
              "proposal" &&
            intake.proposal ? (
              intake.isConfirming ? (
                <KnowledgeImportLoadingOverlay />
              ) : (
                <KnowledgeImportProposalStep
                  proposal={
                    intake.proposal
                  }
                  isConfirming={
                    intake.isConfirming
                  }
                  error={intake.error}
                  onBack={
                    intake.goBackToUpload
                  }
                  onConfirm={
                    intake.confirmProposal
                  }
                />
              )
            ) : null}

            {intake.step ===
              "completed" &&
            intake.completionResult ? (
              <KnowledgeImportCompletedStep
                result={
                  intake.completionResult
                }
                onReset={
                  intake.reset
                }
                onClose={() => {
                  intake.reset();
                  startedSelectionKeyRef.current =
                    null;
                  onOpenChange(false);
                }}
              />
            ) : null}
          </div>

          {!isWaitingToStart ? (
            <KnowledgeImportModalFooter
              step={intake.step}
              fileCount={
                intake.progressSummary
                  .totalFiles ||
                intake.files.length
              }
              validFileCount={
                intake.progressSummary
                  .completedFiles
              }
              duplicateFileCount={
                duplicateFileCount
              }
              failedFileCount={
                intake.progressSummary
                  .failedFiles
              }
              isAnalyzing={
                intake.isAnalyzing
              }
              isConfirming={
                intake.isConfirming
              }
              onCancel={
                requestClose
              }
              onBack={
                intake.goBackToUpload
              }
              onAnalyze={
                intake.analyzeDocuments
              }
              onContinueAnalysis={
                intake.continueWithValidDocuments
              }
              onConfirm={
                intake.confirmProposal
              }
              onReset={intake.reset}
              onClose={() => {
                intake.reset();
                startedSelectionKeyRef.current =
                  null;
                onOpenChange(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <KnowledgeImportCloseGuard
        open={closeGuardOpen}
        onOpenChange={
          setCloseGuardOpen
        }
        onConfirmClose={() => {
          setCloseGuardOpen(false);
          intake.reset();
          startedSelectionKeyRef.current =
            null;
          onOpenChange(false);
        }}
      />
    </>
  );
}
