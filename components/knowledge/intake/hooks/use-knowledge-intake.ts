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
  AnalyzeKnowledgeIntakeResult,
  ConfirmKnowledgeIntakeResult,
  KnowledgeIntakeDocumentInput,
  KnowledgeIntakeProposal,
} from "@/lib/knowledge/intake/types";

import type {
  KnowledgeIntakeContext,
  KnowledgeIntakeModalStep,
} from "../modal/knowledge-intake-modal.types";
import type {
  KnowledgeIntakeFileProgress,
  KnowledgeIntakeProcessingPhase,
} from "../modal/knowledge-intake-processing.types";

import { buildIntakeFormData } from "../../services/build-intake-form-data";
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

type PrepareDocumentResult = {
  document: KnowledgeIntakeDocumentInput;
};

function getFileIdentity(file: File) {
  return [
    file.name.toLowerCase(),
    file.size,
    file.lastModified,
  ].join("::");
}

function removeDuplicateFiles(
  files: File[],
) {
  const seenFiles = new Set<string>();
  const uniqueFiles: File[] = [];
  const duplicateFiles: File[] = [];

  for (const file of files) {
    const identity =
      getFileIdentity(file);

    if (seenFiles.has(identity)) {
      duplicateFiles.push(file);
      continue;
    }

    seenFiles.add(identity);
    uniqueFiles.push(file);
  }

  return {
    uniqueFiles,
    duplicateFiles,
  };
}

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

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [isConfirming, setIsConfirming] =
    useState(false);

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
    KnowledgeIntakeFileProgress[]
  >([]);

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

  const handleFilesChange = useCallback(
    (nextFiles: File[]) => {
      setError(null);

      const {
        uniqueFiles,
        duplicateFiles,
      } =
        removeDuplicateFiles(nextFiles);

      if (duplicateFiles.length > 0) {
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
              duplicateNames.length === 1
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

      setIsAnalyzing(true);
      setError(null);
      setStep("analyzing");
      setProcessingPhase("uploading");

      setFileProgress(
        selectedDocuments.map(
          (document) => ({
            id: document.id,
            name: document.file.name,
            status: "pending",
          }),
        ),
      );

      try {
        const preparedDocuments: KnowledgeIntakeDocumentInput[] =
          [];

        for (const document of selectedDocuments) {
          setFileProgress((current) =>
            current.map((item) =>
              item.id === document.id
                ? {
                    ...item,
                    status:
                      "uploading",
                    error: undefined,
                  }
                : item,
            ),
          );

          const formData =
            new FormData();

          formData.set(
            "documentId",
            document.id,
          );

          formData.set(
            "file",
            document.file,
          );

          const prepareResponse =
            await fetch(
              "/api/knowledge/intake/prepare",
              {
                method: "POST",
                body: formData,
              },
            );

          if (!prepareResponse.ok) {
            const message =
              await readErrorMessage(
                prepareResponse,
                `No se ha podido subir ${document.file.name}`,
              );

            setFileProgress(
              (current) =>
                current.map((item) =>
                  item.id ===
                  document.id
                    ? {
                        ...item,
                        status:
                          "error",
                        error: message,
                      }
                    : item,
                ),
            );

            throw new Error(message);
          }

          const preparedResult =
            (await prepareResponse.json()) as PrepareDocumentResult;

          preparedDocuments.push(
            preparedResult.document,
          );

          setFileProgress((current) =>
            current.map((item) =>
              item.id === document.id
                ? {
                    ...item,
                    status:
                      "uploaded",
                  }
                : item,
            ),
          );
        }

        setProcessingPhase("analyzing");

        const analyzeResponse =
          await fetch(
            "/api/knowledge/intake/analyze",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                libraryId:
                  context.libraryId,
                documents:
                  preparedDocuments,
              }),
            },
          );

        if (!analyzeResponse.ok) {
          throw new Error(
            await readErrorMessage(
              analyzeResponse,
              "No se han podido analizar los documentos",
            ),
          );
        }

        const result =
          (await analyzeResponse.json()) as AnalyzeKnowledgeIntakeResult;

        setProposal(result.proposal);
        setStep("proposal");
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
      context.libraryId,
      selectedDocuments,
    ]);

  const confirmProposal =
    useCallback(async () => {
      if (!proposal) {
        return;
      }

      setIsConfirming(true);
      setError(null);

      try {
        const response = await fetch(
          "/api/knowledge/intake/confirm",
          {
            method: "POST",
            body: buildIntakeFormData({
              context,
              documents:
                selectedDocuments,
              proposal,
            }),
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

        const result =
          (await response.json()) as ConfirmKnowledgeIntakeResult;

        setCompletionResult(result);
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
      context,
      onCompleted,
      proposal,
      router,
      selectedDocuments,
    ]);

  const goBackToUpload =
    useCallback(() => {
      setError(null);
      setStep("upload");
    }, []);

  const reset = useCallback(() => {
    setStep("upload");
    setSelectedDocuments([]);
    setProposal(null);
    setCompletionResult(null);
    setError(null);
    setIsAnalyzing(false);
    setIsConfirming(false);
    setProcessingPhase("uploading");
    setFileProgress([]);
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
    handleFilesChange,
    analyzeDocuments,
    confirmProposal,
    goBackToUpload,
    reset,
  };
}