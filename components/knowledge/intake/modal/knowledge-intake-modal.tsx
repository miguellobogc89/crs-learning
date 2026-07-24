// components/knowledge/intake/modal/knowledge-intake-modal.tsx

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

import { useKnowledgeIntake } from "../hooks/use-knowledge-intake";
import { KnowledgeIntakeModalHeader } from "./knowledge-intake-modal-header";
import { KnowledgeIntakeModalProgress } from "./knowledge-intake-modal-progress";
import { KnowledgeIntakeModalFooter } from "./knowledge-intake-modal-footer";
import { KnowledgeIntakeUploadStep } from "./knowledge-intake-upload-step";
import { KnowledgeIntakeProcessingStep } from "./knowledge-intake-processing-step";
import { KnowledgeIntakeProposalStep } from "./knowledge-intake-proposal-step";
import { KnowledgeIntakeCompletedStep } from "./knowledge-intake-completed-step";
import { KnowledgeIntakeCloseGuard } from "./knowledge-intake-close-guard";
import { KnowledgeIntakeLoadingOverlay } from "./knowledge-intake-loading-overlay";

import type { KnowledgeIntakeModalProps } from "./knowledge-intake-modal.types";

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

export function KnowledgeIntakeModal({
  open,
  context,
  onOpenChange,
  onCompleted,
  selectedFiles,
}: KnowledgeIntakeModalProps) {
  const [
    closeGuardOpen,
    setCloseGuardOpen,
  ] = useState(false);

  const startedSelectionKeyRef =
    useRef<string | null>(null);

  const intake = useKnowledgeIntake({
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
    intake.step === "upload";

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
          <KnowledgeIntakeModalHeader
            context={context}
          />

          <KnowledgeIntakeModalProgress
            currentStep={
              isWaitingToStart
                ? "analyzing"
                : intake.step
            }
          />

          <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
            {isWaitingToStart ? (
              <KnowledgeIntakeProcessingStep
                phase="uploading"
                files={
                  intake.fileProgress
                }
                summary={{
                  totalFiles:
                    selectedFiles?.length ??
                    0,
                  completedFiles: 0,
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
              <KnowledgeIntakeUploadStep
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
              <KnowledgeIntakeProcessingStep
                phase={
                  intake.processingPhase
                }
                files={
                  intake.fileProgress
                }
                summary={
                  intake.progressSummary
                }
              />
            ) : null}

            {intake.step ===
              "proposal" &&
            intake.proposal ? (
              intake.isConfirming ? (
                <KnowledgeIntakeLoadingOverlay />
              ) : (
                <KnowledgeIntakeProposalStep
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
              <KnowledgeIntakeCompletedStep
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
            <KnowledgeIntakeModalFooter
              step={intake.step}
              fileCount={
                intake.files.length
              }
              validFileCount={
                intake.progressSummary
                  .completedFiles
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

      <KnowledgeIntakeCloseGuard
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