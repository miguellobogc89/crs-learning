// components/knowledge/intake/hooks/use-knowledge-intake.ts

"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type {
  ConfirmKnowledgeImportResult,
  KnowledgeImportProposal,
} from "@/lib/knowledge/import/types";
import type {
  ConfirmKnowledgeIntakeResult,
  KnowledgeIntakeProposal,
} from "@/lib/knowledge/intake/types";
import {
  adaptConfirmationResult,
  adaptImportProposal,
  applyDuplicateSnapshot,
  createEmptyImportSummary,
  createInitialImportFiles,
  createInitialImportSummary,
  deduplicateBrowserFiles,
  finalizeImportAnalysis,
  finalizeImportFiles,
  getBrowserFileRelativePath,
  getBrowserImportMode,
  markFilesUploaded,
  markFilesUploading,
  mergeServerProgress,
  type KnowledgeImportFlowFile,
  type KnowledgeImportFlowSummary,
} from "@/lib/knowledge/import-flow";

import type {
  KnowledgeIntakeContext,
  KnowledgeIntakeModalStep,
} from "../modal/knowledge-intake-modal.types";
import type {
  KnowledgeIntakeProcessingPhase,
} from "../modal/knowledge-intake-processing.types";

import {
  generateKnowledgeImportProposal,
  runKnowledgeImportAnalysis,
  type KnowledgeImportProgress,
  type KnowledgeImportProposalProgress,
} from "../../import/knowledge-import-api";
import {
  createSelectedDocuments,
  type SelectedKnowledgeDocument,
} from "../../services/create-selected-documents";
import { readErrorMessage } from "../../services/read-error-message";

type UseKnowledgeIntakeParams = {
  context: KnowledgeIntakeContext;
  onCompleted?: (
    result: ConfirmKnowledgeIntakeResult,
  ) => void;
};

type UploadKnowledgeImportResult = {
  importId: string;
  status: "uploaded";
  mode: "files" | "folder" | "zip";
  fileCount: number;
  totalSize: number;
};

export function useKnowledgeIntake({
  context,
  onCompleted,
}: UseKnowledgeIntakeParams) {
  const router = useRouter();

  const [step, setStep] =
    useState<KnowledgeIntakeModalStep>(
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

  const [
    importProposal,
    setImportProposal,
  ] =
    useState<KnowledgeImportProposal | null>(
      null,
    );

  const [proposal, setProposal] =
    useState<KnowledgeIntakeProposal | null>(
      null,
    );

  const [
    completionResult,
    setCompletionResult,
  ] =
    useState<ConfirmKnowledgeIntakeResult | null>(
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
    useState<KnowledgeIntakeProcessingPhase>(
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

  const files = useMemo(
    () =>
      selectedDocuments.map(
        (document) => document.file,
      ),
    [selectedDocuments],
  );

  const hasUnsavedProgress =
    selectedDocuments.length > 0 ||
    proposal !== null ||
    step !== "upload";

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

const applyServerProgress =
    useCallback(
      (
        progress: KnowledgeImportProgress,
      ) => {
        setFileProgress(
          (currentFiles) => {
            let nextFiles =
              currentFiles;

            setProgressSummary(
              (currentSummary) => {
                const merged =
                  mergeServerProgress(
                    currentFiles,
                    currentSummary,
                    progress,
                  );

                nextFiles =
                  merged.files;

                return merged.summary;
              },
            );

            return nextFiles;
          },
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

        setFileProgress(
          markFilesUploading,
        );

        const uploadResponse =
          await fetch(
            "/api/knowledge/import/upload",
            {
              method: "POST",
              body: formData,
            },
          );

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

        setImportId(
          uploadResult.importId,
        );

        setFileProgress(
          markFilesUploaded,
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
                  if (
                    stage ===
                    "analyzing"
                  ) {
                    setProcessingPhase(
                      "preparing",
                    );
                    return;
                  }

                  setProcessingPhase(
                    "extracting",
                  );
                },

              onProgress:
                applyServerProgress,
            },
          );

const duplicateFiles =
          analysisResult.extraction
            .duplicateFiles;

        setFileProgress(
          (currentFiles) => {
            const duplicated =
              applyDuplicateSnapshot(
                currentFiles,
                duplicateFiles,
              );

            const finalizedFiles =
              finalizeImportFiles(
                duplicated.files,
                analysisResult
                  .textExtraction
                  .successfulFiles,
                analysisResult
                  .textExtraction
                  .failedFiles,
              );

            setProgressSummary(
              finalizeImportAnalysis(
                finalizedFiles,
                analysisResult
                  .textExtraction
                  .successfulFiles,
                analysisResult
                  .textExtraction
                  .failedFiles,
              ),
            );

            return finalizedFiles;
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
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se han podido analizar los documentos",
        );

        setStep("upload");
      } finally {
        setIsAnalyzing(false);
      }
    }, [
      applyServerProgress,
      context.libraryId,
      selectedDocuments,
    ]);

  const continueWithValidDocuments =
    useCallback(async () => {
      if (!importId) {
        setError(
          "No se ha encontrado la importación",
        );
        return;
      }

      if (
        progressSummary.completedFiles ===
        0
      ) {
        setError(
          "No hay documentos válidos con los que generar una propuesta",
        );
        return;
      }

      setIsAnalyzing(true);
      setError(null);
      setProcessingPhase(
        "generating_proposal",
      );

      setProposalProgress({
        step: "preparing",
        progressPercentage: 0,
        message:
          "Preparando la generación de la propuesta",
      });

      setStep("analyzing");

      try {
        const proposalResult =
          await generateKnowledgeImportProposal(
            importId,
            {
              onProgress:
                setProposalProgress,
            },
          );

        setImportProposal(
          proposalResult.proposal,
        );

        setProposal(
          adaptImportProposal(
            proposalResult.proposal,
            context.libraryId,
          ),
        );

        setStep("proposal");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se ha podido generar la propuesta",
        );

        setStep(
          "analyzing",
        );
      } finally {
        setIsAnalyzing(false);
      }
    }, [
      context.libraryId,
      importId,
      progressSummary.completedFiles,
    ]);

  const confirmProposal =
    useCallback(async () => {
      if (
        !proposal ||
        !importProposal ||
        !importId
      ) {
        return;
      }

      setIsConfirming(true);
      setError(null);

      try {
        const response =
          await fetch(
            `/api/knowledge/import/${importId}/confirm`,
            {
              method: "POST",
            },
          );

        if (!response.ok) {
          throw new Error(
            await readErrorMessage(
              response,
              "No se ha podido aplicar la propuesta",
            ),
          );
        }

        const importResult =
          (await response.json()) as ConfirmKnowledgeImportResult;

        const result =
          adaptConfirmationResult(
            importResult,
            importProposal,
          );

        setCompletionResult(
          result,
        );

        setStep("completed");

        router.refresh();

        onCompleted?.(result);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se ha podido aplicar la propuesta",
        );
      } finally {
        setIsConfirming(false);
      }
    }, [
      importId,
      importProposal,
      onCompleted,
      proposal,
      router,
    ]);

  const goBackToUpload =
    useCallback(() => {
      setError(null);
      setStep("upload");
    }, []);

  const reset = useCallback(() => {
    setStep("upload");
    setSelectedDocuments([]);
    setImportId(null);
    setImportProposal(null);
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

  return {
    step,
    files,
    proposal,
    completionResult,
    error,
    isAnalyzing,
    isConfirming,
    hasUnsavedProgress,
    processingPhase,
    fileProgress,
    progressSummary,
    proposalProgress,

    handleFilesChange,
    analyzeDocuments,
    continueWithValidDocuments,
    confirmProposal,
    goBackToUpload,
    reset,
  };
}
