// components/knowledge/intake/modal/knowledge-intake-modal.tsx
"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

import { useKnowledgeIntake } from "../hooks/use-knowledge-intake";
import { KnowledgeIntakeModalHeader } from "./knowledge-intake-modal-header";
import { KnowledgeIntakeModalProgress } from "./knowledge-intake-modal-progress";
import { KnowledgeIntakeAnalysisResultStep } from "./knowledge-intake-analysis-result-step";
import { KnowledgeIntakeModalFooter } from "./knowledge-intake-modal-footer";
import { KnowledgeIntakeUploadStep } from "./knowledge-intake-upload-step";
import { KnowledgeIntakeProcessingStep } from "./knowledge-intake-processing-step";
import { KnowledgeIntakeProposalStep } from "./knowledge-intake-proposal-step";
import { KnowledgeIntakeCompletedStep } from "./knowledge-intake-completed-step";
import { KnowledgeIntakeCloseGuard } from "./knowledge-intake-close-guard";
import { KnowledgeIntakeLoadingOverlay } from "./knowledge-intake-loading-overlay";

import type { KnowledgeIntakeModalProps } from "./knowledge-intake-modal.types";

export function KnowledgeIntakeModal({
  open,
  context,
  onOpenChange,
  onCompleted,
  selectedFiles,
}: KnowledgeIntakeModalProps) {
  const [closeGuardOpen, setCloseGuardOpen] =
    useState(false);

  const intake = useKnowledgeIntake({
    context: context!,
    onCompleted,
  });

useEffect(() => {
  if (
    !open ||
    !selectedFiles?.length ||
    intake.files.length > 0
  ) {
    return;
  }

  intake.handleFilesChange(selectedFiles);
}, [
  open,
  selectedFiles,
  intake.files.length,
  intake.handleFilesChange,
]);

  if (!context) {
    return null;
  }

function requestClose() {
  if (intake.hasUnsavedProgress) {
    setCloseGuardOpen(true);
    return;
  }

  intake.reset();
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
            width: "1100px",
            maxWidth: "90vw",
            height: "720px",
            maxHeight: "88vh",
          }}
          className="flex flex-col gap-0 overflow-hidden p-0"
        >
          <KnowledgeIntakeModalHeader
            context={context}
          />

          <KnowledgeIntakeModalProgress
            currentStep={intake.step}
          />

          
<div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
            {intake.step === "upload" ? (
              <KnowledgeIntakeUploadStep
                files={intake.files}
                isAnalyzing={intake.isAnalyzing}
                error={intake.error}
                onFilesChange={
                  intake.handleFilesChange
                }
              />
            ) : null}

{intake.step === "analyzing" ? (
<KnowledgeIntakeProcessingStep
  phase={intake.processingPhase}
  files={intake.fileProgress}
  summary={intake.progressSummary}
/>
) : null}

{intake.step ===
"analysis_result" ? (
  <KnowledgeIntakeAnalysisResultStep
    files={intake.fileProgress}
    summary={
      intake.progressSummary
    }
    error={intake.error}
  />
) : null}

            {intake.step === "proposal" &&
            intake.proposal ? (
              intake.isConfirming ? (
                <KnowledgeIntakeLoadingOverlay />
              ) : (
                <KnowledgeIntakeProposalStep
                  proposal={intake.proposal}
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

            {intake.step === "completed" &&
            intake.completionResult ? (
<KnowledgeIntakeCompletedStep
  result={intake.completionResult}
  onReset={intake.reset}
  onClose={() => {
    intake.reset();
    onOpenChange(false);
  }}
/>
            ) : null}
          </div>

<KnowledgeIntakeModalFooter
  step={intake.step}
  fileCount={intake.files.length}
  validFileCount={
    intake.progressSummary.completedFiles
  }
  failedFileCount={
    intake.progressSummary.failedFiles
  }
  isAnalyzing={intake.isAnalyzing}
  isConfirming={intake.isConfirming}
  onCancel={requestClose}
  onBack={intake.goBackToUpload}
  onAnalyze={intake.analyzeDocuments}
  onContinueAnalysis={
    intake.continueWithValidDocuments
  }
  onConfirm={intake.confirmProposal}
  onReset={intake.reset}
  onClose={() => {
    intake.reset();
    onOpenChange(false);
  }}
/>
        </DialogContent>
      </Dialog>

      <KnowledgeIntakeCloseGuard
        open={closeGuardOpen}
        onOpenChange={setCloseGuardOpen}
        onConfirmClose={() => {
          setCloseGuardOpen(false);
          intake.reset();
          onOpenChange(false);
        }}
      />
    </>
  );
}