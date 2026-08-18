// components/knowledge/import/modal/knowledge-import-modal.tsx

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

  const [
    isCancellingClose,
    setIsCancellingClose,
  ] = useState(false);

  const [
    closeGuardError,
    setCloseGuardError,
  ] = useState<string | null>(null);

  const startedSelectionKeyRef =
    useRef<string | null>(null);

  const knowledgeImport = useKnowledgeImport({
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
    knowledgeImport.step === "upload" &&
    knowledgeImport.files.length === 0;

  const duplicateFileCount =
    knowledgeImport.fileProgress.filter(
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
      knowledgeImport.files.length > 0
    ) {
      return;
    }

    knowledgeImport.handleFilesChange(
      selectedFiles,
    );
  }, [
    open,
    selectedFiles,
    knowledgeImport.files.length,
    knowledgeImport.handleFilesChange,
  ]);

  useEffect(() => {
    if (
      !open ||
      !selectionKey ||
      knowledgeImport.step !== "upload" ||
      knowledgeImport.files.length === 0 ||
      startedSelectionKeyRef.current ===
        selectionKey
    ) {
      return;
    }

    startedSelectionKeyRef.current =
      selectionKey;

    void knowledgeImport.analyzeDocuments();
  }, [
    open,
    selectionKey,
    knowledgeImport.step,
    knowledgeImport.files.length,
    knowledgeImport.analyzeDocuments,
  ]);

  if (!context) {
    return null;
  }

  function requestClose() {
    if (knowledgeImport.step === "completed") {
      knowledgeImport.finishActiveImport();
      startedSelectionKeyRef.current =
        null;
      onOpenChange(false);
      return;
    }

    if (
      knowledgeImport.hasUnsavedProgress
    ) {
      setCloseGuardError(null);
      setCloseGuardOpen(true);
      return;
    }

    knowledgeImport.reset();
    startedSelectionKeyRef.current =
      null;
    onOpenChange(false);
  }

  function handleCloseGuardOpenChange(
    nextOpen: boolean,
  ) {
    if (
      isCancellingClose &&
      !nextOpen
    ) {
      return;
    }

    if (!nextOpen) {
      setCloseGuardError(null);
    }

    setCloseGuardOpen(nextOpen);
  }

  async function confirmCloseWithoutSaving() {
    setIsCancellingClose(true);
    setCloseGuardError(null);

    const result =
      await knowledgeImport.cancelActiveImport();

    if (!result.success) {
      setCloseGuardError(
        result.error ??
          "No se ha podido cancelar la importacion",
      );
      setIsCancellingClose(false);
      return;
    }

    setCloseGuardOpen(false);
    setIsCancellingClose(false);
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
                : knowledgeImport.step
            }
          />

          <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
            {isWaitingToStart ? (
              <KnowledgeImportProcessingStep
                phase="uploading"
                files={
                  knowledgeImport.fileProgress
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
            knowledgeImport.step === "upload" ? (
              <KnowledgeImportUploadStep
                files={knowledgeImport.files}
                isAnalyzing={
                  knowledgeImport.isAnalyzing
                }
                error={knowledgeImport.error}
                onFilesChange={
                  knowledgeImport.handleFilesChange
                }
              />
            ) : null}

            {!isWaitingToStart &&
            knowledgeImport.step ===
              "analyzing" ? (
              <KnowledgeImportProcessingStep
                phase={
                  knowledgeImport.processingPhase
                }
                files={
                  knowledgeImport.fileProgress
                }
                summary={{
                  ...knowledgeImport.progressSummary,
                  duplicateFiles:
                    duplicateFileCount,
                }}
                proposalProgress={
                  knowledgeImport.proposalProgress
                }
              />
            ) : null}

            {knowledgeImport.step ===
              "proposal" &&
            knowledgeImport.proposal ? (
              knowledgeImport.isConfirming ? (
                <KnowledgeImportLoadingOverlay />
              ) : (
                <KnowledgeImportProposalStep
                  proposal={
                    knowledgeImport.proposal
                  }
                  isConfirming={
                    knowledgeImport.isConfirming
                  }
                  error={knowledgeImport.error}
                  onBack={
                    knowledgeImport.goBackToUpload
                  }
                  onConfirm={
                    knowledgeImport.confirmProposal
                  }
                />
              )
            ) : null}

            {knowledgeImport.step ===
              "completed" &&
            knowledgeImport.completionResult ? (
              <KnowledgeImportCompletedStep
                result={
                  knowledgeImport.completionResult
                }
                onClose={() => {
                  knowledgeImport.finishActiveImport();
                  startedSelectionKeyRef.current =
                    null;
                  onOpenChange(false);
                }}
              />
            ) : null}
          </div>

          {!isWaitingToStart ? (
            <KnowledgeImportModalFooter
              step={knowledgeImport.step}
              fileCount={
                knowledgeImport.progressSummary
                  .totalFiles ||
                knowledgeImport.files.length
              }
              validFileCount={
                knowledgeImport.progressSummary
                  .completedFiles
              }
              duplicateFileCount={
                duplicateFileCount
              }
              failedFileCount={
                knowledgeImport.progressSummary
                  .failedFiles
              }
              isAnalyzing={
                knowledgeImport.isAnalyzing
              }
              isConfirming={
                knowledgeImport.isConfirming
              }
              canContinue={
                knowledgeImport.canContinue
              }
              canContinueInBackground={
                knowledgeImport.canContinueInBackground
              }
              onCancel={
                requestClose
              }
              onBack={
                knowledgeImport.goBackToUpload
              }
              onAnalyze={
                knowledgeImport.analyzeDocuments
              }
              onContinueAnalysis={
                knowledgeImport.continueWithValidDocuments
              }
              onContinueInBackground={() => {
                const started =
                  knowledgeImport.continueInBackground();

                if (!started) {
                  return;
                }

                startedSelectionKeyRef.current =
                  null;
                onOpenChange(false);
              }}
              onConfirm={
                knowledgeImport.confirmProposal
              }
              onClose={() => {
                knowledgeImport.finishActiveImport();
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
          handleCloseGuardOpenChange
        }
        onConfirmClose={
          confirmCloseWithoutSaving
        }
        isConfirming={
          isCancellingClose
        }
        error={closeGuardError}
      />
    </>
  );
}
