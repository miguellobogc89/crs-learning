// components/knowledge/import/hooks/use-knowledge-import.ts

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  useBackgroundImports,
} from "@/components/knowledge/import/background/use-background-imports";

import type {
  ConfirmKnowledgeImportResult,
  KnowledgeImportProposal,
} from "@/lib/knowledge/import/types";
import {
  createEmptyImportSummary,
  createFilesFromAnalysisSnapshot,
  createInitialImportFiles,
  createInitialImportSummary,
  createSummaryFromAnalysisSnapshot,
  deduplicateBrowserFiles,
  finalizeImportAnalysis,
  finalizeImportFiles,
  getBrowserFileRelativePath,
  getBrowserImportMode,
  markFilesUploaded,
  markFilesUploading,
  type KnowledgeImportFlowFile,
  type KnowledgeImportFlowSummary,
} from "@/lib/knowledge/import-flow";

import type {
  KnowledgeImportContext,
  KnowledgeImportModalStep,
} from "../modal/knowledge-import-modal.types";
import type {
  KnowledgeImportProcessingPhase,
} from "../modal/knowledge-import-processing.types";

import {
  runKnowledgeImportAnalysis,
  type KnowledgeImportProposalProgress,
} from "../knowledge-import-api";
import {
  createSelectedDocuments,
  type SelectedKnowledgeDocument,
} from "../../services/create-selected-documents";
import { readErrorMessage } from "../../services/read-error-message";

type useKnowledgeImportParams = {
  context: KnowledgeImportContext;
  onCompleted?: (
    result: ConfirmKnowledgeImportResult,
  ) => void;
};

type UploadKnowledgeImportResult = {
  importId: string;
  status: "uploaded";
  mode: "files" | "folder" | "zip";
  fileCount: number;
  totalSize: number;
};

export function useKnowledgeImport({
  context,
  onCompleted,
}: useKnowledgeImportParams) {
  const {
  registerImport,
  updateImport,
  currentTask,
  getImportState,
  continueWithValidDocuments:
    continueSharedImport,
  confirmProposal:
    confirmSharedProposal,
  continueInBackground:
    continueSharedInBackground,
  cancelImport,
  finishImport,
} = useBackgroundImports();

  const [step, setStep] =
    useState<KnowledgeImportModalStep>(
      "upload",
    );

  const [
    selectedDocuments,
    setSelectedDocuments,
  ] = useState<
    SelectedKnowledgeDocument[]
  >([]);

  const [importId, setImportId] =
    useState<string | null>(null);

  const [proposal, setProposal] =
    useState<KnowledgeImportProposal | null>(
      null,
    );

  const [
    completionResult,
    setCompletionResult,
  ] =
    useState<ConfirmKnowledgeImportResult | null>(
      null,
    );

  const [error, setError] =
    useState<string | null>(null);

  const [
    isAnalyzing,
    setIsAnalyzing,
  ] = useState(false);

  const [
    isConfirming,
    setIsConfirming,
  ] = useState(false);

  const [
    processingPhase,
    setProcessingPhase,
  ] =
    useState<KnowledgeImportProcessingPhase>(
      "uploading",
    );

  const [
    fileProgress,
    setFileProgress,
  ] = useState<
    KnowledgeImportFlowFile[]
  >([]);

  const [
    proposalProgress,
    setProposalProgress,
  ] =
    useState<KnowledgeImportProposalProgress | null>(
      null,
    );

const [
    progressSummary,
    setProgressSummary,
  ] = useState<KnowledgeImportFlowSummary>(
    createEmptyImportSummary(),
  );

  const latestFileProgressRef =
    useRef<KnowledgeImportFlowFile[]>(
      [],
    );

  const activeOperationRef =
    useRef(0);

  const files = useMemo(
    () =>
      selectedDocuments.map(
        (document) => document.file,
      ),
    [selectedDocuments],
  );

  const sharedTask =
    importId &&
    currentTask?.importId === importId
      ? currentTask
      : !importId &&
          selectedDocuments.length === 0
          && currentTask &&
          (currentTask.step !==
            "completed" ||
            currentTask.detailHost ===
              "global")
        ? currentTask
        : null;

  const sharedState =
    sharedTask
      ? getImportState(
          sharedTask.importId,
        )
      : null;

  useEffect(() => {
    if (
      importId ||
      selectedDocuments.length > 0 ||
      !currentTask ||
      (currentTask.step ===
        "completed" &&
        currentTask.detailHost !==
          "global")
    ) {
      return;
    }

    setImportId(currentTask.importId);
    setStep(currentTask.step);
    setProcessingPhase(
      currentTask.phase,
    );
    setFileProgress(
      currentTask.files,
    );
    setProgressSummary(
      currentTask.summary,
    );
    setError(currentTask.error);
    setProposal(currentTask.proposal);
    setProposalProgress(
      currentTask.proposalProgress,
    );
    setCompletionResult(
      currentTask.completionResult,
    );
    setIsAnalyzing(
      currentTask.isAnalyzing,
    );
    setIsConfirming(
      currentTask.isConfirming,
    );
  }, [
    currentTask,
    importId,
    selectedDocuments.length,
  ]);

  const visibleStep =
    sharedTask?.step ?? step;
  const visiblePhase =
    sharedTask?.phase ??
    processingPhase;
  const visibleFileProgress =
    sharedTask?.files ??
    fileProgress;
  const visibleProgressSummary =
    sharedTask?.summary ??
    progressSummary;
  const visibleProposal =
    sharedTask?.proposal ??
    proposal;
  const visibleProposalProgress =
    sharedTask?.proposalProgress ??
    proposalProgress;
  const visibleCompletionResult =
    sharedTask?.completionResult ??
    completionResult;
  const visibleError =
    sharedTask?.error ?? error;
  const visibleIsAnalyzing =
    sharedTask?.isAnalyzing ??
    isAnalyzing;
  const visibleIsConfirming =
    sharedTask?.isConfirming ??
    isConfirming;

  useEffect(() => {
    latestFileProgressRef.current =
      visibleFileProgress;
  }, [
    visibleFileProgress,
  ]);

  const canContinueInBackground =
    sharedState?.canContinueInBackground ??
    Boolean(
      importId ??
        sharedTask?.importId,
    );

  const hasUnsavedProgress =
    selectedDocuments.length > 0 ||
    visibleProposal !== null ||
    visibleStep !== "upload";

  const handleFilesChange =
    useCallback(
      (nextFiles: File[]) => {
        setError(null);

        const {
          uniqueFiles,
          duplicateFiles,
        } =
          deduplicateBrowserFiles(
            nextFiles,
          );

        if (
          duplicateFiles.length > 0
        ) {
          const duplicateNames =
            Array.from(
              new Set(
                duplicateFiles.map(
                  (file) => file.name,
                ),
              ),
            );

          toast.warning(
            duplicateFiles.length === 1
              ? "Archivo duplicado"
              : `${duplicateFiles.length} archivos duplicados`,
            {
              description:
                duplicateNames.length ===
                1
                  ? `"${duplicateNames[0]}" ya estaba seleccionado y no se ha vuelto a añadir.`
                  : "Los archivos repetidos ya estaban seleccionados y no se han vuelto a añadir.",
            },
          );
        }

        setSelectedDocuments(
          (currentDocuments) =>
            createSelectedDocuments(
              uniqueFiles,
              currentDocuments,
            ),
        );
      },
      [],
    );

  const analyzeDocuments =
    useCallback(async () => {
      if (
        selectedDocuments.length === 0
      ) {
        setError(
          "Selecciona al menos un documento",
        );
        return;
      }

      const operationId =
        activeOperationRef.current + 1;

      activeOperationRef.current =
        operationId;

      const isCurrentOperation = () =>
        activeOperationRef.current ===
        operationId;

      setIsAnalyzing(true);
      setError(null);
      setStep("analyzing");
      setProcessingPhase(
        "uploading",
      );

setProgressSummary(
        createInitialImportSummary(
          selectedDocuments.length,
        ),
      );

      setFileProgress(
        createInitialImportFiles(
          selectedDocuments,
        ),
      );

      let activeImportId:
        | string
        | null = null;

      try {
        const selectedFiles =
          selectedDocuments.map(
            (document) =>
              document.file,
          );

        const formData =
          new FormData();

        formData.set(
          "libraryId",
          context.libraryId,
        );

        formData.set(
          "mode",
          getBrowserImportMode(
            selectedFiles,
          ),
        );

        formData.set(
          "relativePaths",
          JSON.stringify(
            selectedFiles.map(
              getBrowserFileRelativePath,
            ),
          ),
        );

        for (
          const file of selectedFiles
        ) {
          formData.append(
            "files",
            file,
          );
        }

        const uploadingFiles =
          markFilesUploading(
            createInitialImportFiles(
              selectedDocuments,
            ),
          );

        setFileProgress(
          uploadingFiles,
        );
        latestFileProgressRef.current =
          uploadingFiles;

        const uploadResponse =
          await fetch(
            "/api/knowledge/import/upload",
            {
              method: "POST",
              body: formData,
            },
          );

        if (!isCurrentOperation()) {
          return;
        }

        if (!uploadResponse.ok) {
          throw new Error(
            await readErrorMessage(
              uploadResponse,
              "No se han podido subir los documentos",
            ),
          );
        }

        const uploadResult =
          (await uploadResponse.json()) as UploadKnowledgeImportResult;

        if (!isCurrentOperation()) {
          return;
        }

        activeImportId =
          uploadResult.importId;

        setImportId(
          uploadResult.importId,
        );

        const uploadedFiles =
          markFilesUploaded(
            uploadingFiles,
          );

        setFileProgress(
          uploadedFiles,
        );
        latestFileProgressRef.current =
          uploadedFiles;

        registerImport(
          uploadResult.importId,
          {
            context,
            displayMode: "modal",
            detailHost: "local",
            label:
              selectedDocuments[0]?.file
                .name ?? null,
            step: "analyzing",
            phase: "preparing",
            status: "uploaded",
            files: uploadedFiles,
            summary:
              createInitialImportSummary(
                selectedDocuments.length,
              ),
            error: null,
            isAnalyzing: true,
            isConfirming: false,
          },
        );

        setProcessingPhase(
          "preparing",
        );

        const analysisResult =
          await runKnowledgeImportAnalysis(
            uploadResult.importId,
            {
              onStageChange:
                (stage) => {
                  if (!isCurrentOperation()) {
                    return;
                  }

                  if (
                    stage ===
                    "analyzing"
                  ) {
                    setProcessingPhase(
                      "preparing",
                    );
                    updateImport(
                      uploadResult.importId,
                      {
                        phase:
                          "preparing",
                        status:
                          "analyzing",
                        isAnalyzing:
                          true,
                      },
                    );
                    return;
                  }

                  setProcessingPhase(
                    "extracting",
                  );
                  updateImport(
                    uploadResult.importId,
                    {
                      phase:
                        "extracting",
                      status:
                        "extracting_text",
                      isAnalyzing:
                        true,
                    },
                  );
                },

              onAnalysisReady:
                (analysis) => {
                  if (!isCurrentOperation()) {
                    return;
                  }

                  const analyzedFiles =
                    createFilesFromAnalysisSnapshot(
                      analysis.files,
                    );

                  setFileProgress(
                    analyzedFiles,
                  );
                  latestFileProgressRef.current =
                    analyzedFiles;

                  setProgressSummary(
                    createSummaryFromAnalysisSnapshot(
                      analyzedFiles,
                    ),
                  );

                  updateImport(
                    uploadResult.importId,
                    {
                      files:
                        analyzedFiles,
                      summary:
                        createSummaryFromAnalysisSnapshot(
                          analyzedFiles,
                        ),
                      status:
                        analysis.status,
                      error: null,
                    },
                  );
                },
            },
          );

        if (!isCurrentOperation()) {
          return;
        }

const duplicateFiles =
          analysisResult.extraction
            .duplicateFiles;

        const finalizedFiles =
          finalizeImportFiles(
            latestFileProgressRef.current,
            analysisResult
              .textExtraction
              .successfulFiles,
            analysisResult
              .textExtraction
              .failedFiles,
          );

        const finalizedSummary =
          finalizeImportAnalysis(
            finalizedFiles,
            analysisResult
              .textExtraction
              .successfulFiles,
            analysisResult
              .textExtraction
              .failedFiles,
          );

        latestFileProgressRef.current =
          finalizedFiles;

        setFileProgress(
          finalizedFiles,
        );

        setProgressSummary(
          finalizedSummary,
        );

        updateImport(
          uploadResult.importId,
          {
            files: finalizedFiles,
            summary:
              finalizedSummary,
            status:
              analysisResult
                .textExtraction
                .status,
            isAnalyzing: false,
          },
        );

        if (
          duplicateFiles.length > 0
        ) {
          toast.warning(
            duplicateFiles.length === 1
              ? "Se ha detectado un documento duplicado"
              : `Se han detectado ${duplicateFiles.length} documentos duplicados`,
            {
              description:
                "Los duplicados se mostrarán en amarillo y no se incluirán en la propuesta.",
            },
          );
        }

        if (
          analysisResult.textExtraction
            .successfulFiles === 0 &&
          analysisResult.extraction
            .duplicateCount === 0
        ) {
          setError(
            "No se ha podido obtener texto de ninguno de los documentos",
          );
        }
      } catch (caughtError) {
        if (!isCurrentOperation()) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se han podido analizar los documentos",
        );

        if (activeImportId) {
          updateImport(activeImportId, {
            error:
              caughtError instanceof Error
                ? caughtError.message
                : "No se han podido analizar los documentos",
            isAnalyzing: false,
          });
        }

        setStep("upload");
      } finally {
        if (isCurrentOperation()) {
          setIsAnalyzing(false);
        }
      }
    }, [
      context,
      context.libraryId,
      importId,
      registerImport,
      selectedDocuments,
      updateImport,
    ]);

  const continueWithValidDocuments =
    useCallback(async () => {
      if (!importId) {
        setError(
          "No se ha encontrado la importacion",
        );
        return;
      }

      if (!sharedState?.canContinue) {
        setError(
          "No hay documentos validos con los que generar una propuesta",
        );
        return;
      }

      await continueSharedImport(
        importId,
      );
    }, [
      continueSharedImport,
      importId,
      sharedState?.canContinue,
    ]);
  const confirmProposal =
    useCallback(async () => {
      if (
        !visibleProposal ||
        !importId
      ) {
        return;
      }

      const result =
        await confirmSharedProposal(
          importId,
        );

      if (result) {
        onCompleted?.(result);
      }
    }, [
      confirmSharedProposal,
      importId,
      onCompleted,
      visibleProposal,
    ]);
  const continueInBackground =
    useCallback(() => {
      const activeImportId =
        importId ??
        sharedTask?.importId ??
        null;

      if (!activeImportId) {
        return false;
      }

      continueSharedInBackground(
        activeImportId,
      );

      return true;
    }, [
      continueSharedInBackground,
      importId,
      sharedTask?.importId,
    ]);
  const goBackToUpload =
    useCallback(() => {
      setError(null);
      setStep("upload");
      if (importId) {
        updateImport(importId, {
          step: "upload",
          error: null,
        });
      }
    }, [
      importId,
      updateImport,
    ]);

  const reset = useCallback(() => {
    activeOperationRef.current += 1;
    latestFileProgressRef.current =
      [];
    setStep("upload");
    setSelectedDocuments([]);
    setImportId(null);
    setProposal(null);
    setCompletionResult(null);
    setError(null);
    setIsAnalyzing(false);
    setIsConfirming(false);

    setProcessingPhase(
      "uploading",
    );

    setFileProgress([]);
    setProposalProgress(null);

setProgressSummary(
      createEmptyImportSummary(),
    );
  }, []);

  const cancelActiveImport =
    useCallback(async () => {
      const activeImportId =
        importId ??
        sharedTask?.importId ??
        null;

      if (!activeImportId) {
        reset();
        return {
          success: true,
        };
      }

      activeOperationRef.current += 1;
      setError(null);

      const result =
        await cancelImport(activeImportId);

      if (result.success) {
        reset();
        return result;
      }

      if (result.error) {
        setError(result.error);
      }

      return result;
    }, [
      cancelImport,
      importId,
      reset,
      sharedTask?.importId,
    ]);

  const finishActiveImport =
    useCallback(() => {
      const activeImportId =
        importId ??
        sharedTask?.importId ??
        null;

      if (activeImportId) {
        finishImport(activeImportId);
      }

      reset();
    }, [
      finishImport,
      importId,
      reset,
      sharedTask?.importId,
    ]);
  return {
    step: visibleStep,
    files,
    proposal: visibleProposal,
    completionResult:
      visibleCompletionResult,
    error: visibleError,
    isAnalyzing:
      visibleIsAnalyzing,
    isConfirming:
      visibleIsConfirming,
    currentStep:
      sharedState?.currentStep ??
      visibleStep,
    currentAction:
      sharedState?.currentAction ??
      null,
    nextAction:
      sharedState?.nextAction ??
      null,
    canContinue:
      sharedState?.canContinue ??
      false,
    isBusy:
      sharedState?.isBusy ??
      visibleIsAnalyzing ??
      visibleIsConfirming,
    isWaitingUser:
      sharedState?.isWaitingUser ??
      false,
    hasProposal:
      sharedState?.hasProposal ??
      visibleProposal !== null,
    hasCompletionResult:
      sharedState?.hasCompletionResult ??
      visibleCompletionResult !== null,
    hasUnsavedProgress,
    canContinueInBackground,
    processingPhase:
      visiblePhase,
    fileProgress:
      visibleFileProgress,
    progressSummary:
      visibleProgressSummary,
    proposalProgress:
      visibleProposalProgress,

    handleFilesChange,
    analyzeDocuments,
    continueWithValidDocuments,
    confirmProposal,
    continueInBackground,
    goBackToUpload,
    cancelActiveImport,
    finishActiveImport,
    reset,
  };
}
