// components/knowledge/intake/hooks/use-knowledge-intake.ts

"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import type {
  AnalyzeKnowledgeIntakeResult,
  ConfirmKnowledgeIntakeResult,
  KnowledgeIntakeProposal,
} from "@/lib/knowledge/intake/types";

import type {
  KnowledgeIntakeContext,
  KnowledgeIntakeModalStep,
} from "../modal/knowledge-intake-modal.types";
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
  ] = useState<SelectedKnowledgeDocument[]>(
    [],
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

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [isConfirming, setIsConfirming] =
    useState(false);

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

      setSelectedDocuments(
        (currentDocuments) =>
          createSelectedDocuments(
            nextFiles,
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

      try {
        const response = await fetch(
          "/api/knowledge/intake/analyze",
          {
            method: "POST",
            body: buildIntakeFormData({
              context,
              documents:
                selectedDocuments,
            }),
          },
        );

        if (!response.ok) {
          throw new Error(
            await readErrorMessage(
              response,
              "No se han podido analizar los documentos",
            ),
          );
        }

        const result =
          (await response.json()) as AnalyzeKnowledgeIntakeResult;

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
      context,
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

  const reset =
    useCallback(() => {
      setStep("upload");
      setSelectedDocuments([]);
      setProposal(null);
      setCompletionResult(null);
      setError(null);
      setIsAnalyzing(false);
      setIsConfirming(false);
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
    handleFilesChange,
    analyzeDocuments,
    confirmProposal,
    goBackToUpload,
    reset,
  };
}