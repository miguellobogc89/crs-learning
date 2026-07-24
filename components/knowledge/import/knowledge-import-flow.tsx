// components/knowledge/import/knowledge-import-flow.tsx
"use client";

import { useState } from "react";

import {
  generateKnowledgeImportProposal,
  runKnowledgeImportAnalysis,
  type KnowledgeImportProposalResult,
} from "./knowledge-import-api";
import { KnowledgeImportProposalView } from "./knowledge-import-proposal";
import { KnowledgeImportZone } from "./knowledge-import-zone";

type Props = {
  libraryId: string;
  libraryName: string;
  disabled?: boolean;
  onCreateArticle?: () => void;
};

type ImportStep =
  | "upload"
  | "proposal";

type ConfirmImportResponse = {
  success?: boolean;
  importId?: string;
  status?: "completed";
  error?: string;
};

export function KnowledgeImportFlow({
  libraryId,
  libraryName,
  disabled = false,
  onCreateArticle,
}: Props) {
  const [step, setStep] =
    useState<ImportStep>("upload");

  const [importId, setImportId] =
    useState<string | null>(null);

const [
  pipelineResult,
  setPipelineResult,
] =
  useState<KnowledgeImportProposalResult | null>(
    null,
  );

  const [
    isConfirming,
    setIsConfirming,
  ] = useState(false);

  const [
    confirmationError,
    setConfirmationError,
  ] = useState<string | null>(null);

  const [
    isCompleted,
    setIsCompleted,
  ] = useState(false);

  async function handleAnalyze({
    importId: nextImportId,
  }: {
    importId: string;
  }) {
    setImportId(nextImportId);
    setConfirmationError(null);
    setIsCompleted(false);

await runKnowledgeImportAnalysis(
  nextImportId,
);

const proposalResult =
  await generateKnowledgeImportProposal(
    nextImportId,
  );

setPipelineResult(
  proposalResult,
);

setStep("proposal");
  }

  async function handleConfirmImport() {
    if (!importId || isConfirming) {
      return;
    }

    setIsConfirming(true);
    setConfirmationError(null);

    try {
      const response = await fetch(
        `/api/knowledge/import/${importId}/confirm`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const payload =
        (await response.json()) as ConfirmImportResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "No se ha podido crear la estructura",
        );
      }

      if (
        !payload.success ||
        payload.status !== "completed"
      ) {
        throw new Error(
          "La importación no ha terminado correctamente",
        );
      }

      setIsCompleted(true);

      console.log(
        "Importación de Knowledge completada:",
        payload,
      );
    } catch (error) {
      setConfirmationError(
        error instanceof Error
          ? error.message
          : "No se ha podido crear la estructura",
      );
    } finally {
      setIsConfirming(false);
    }
  }

  function handleBack() {
    if (isConfirming) {
      return;
    }

    setStep("upload");
    setImportId(null);
    setPipelineResult(null);
    setConfirmationError(null);
    setIsCompleted(false);
  }



  if (
    step === "proposal" &&
    pipelineResult
  ) {
    return (
      <div className="space-y-4">
        <KnowledgeImportProposalView
          proposal={
            pipelineResult.proposal
          }
          isConfirming={isConfirming}
          onBack={handleBack}
          onConfirm={
            handleConfirmImport
          }
        />

        {confirmationError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {confirmationError}
          </div>
        ) : null}

        {isCompleted && importId ? (
          <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                Estructura creada correctamente
              </p>

              <p className="text-xs text-muted-foreground">
                Descarga el log para revisar
                carpetas, artículos, documentos
                y UUID generados.
              </p>
            </div>

            <a
              href={`/api/knowledge/import/${importId}/log`}
              download
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Descargar log
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <KnowledgeImportZone
      libraryId={libraryId}
      libraryName={libraryName}
      disabled={disabled}
      onCreateArticle={
        onCreateArticle
      }
      onAnalyze={handleAnalyze}
    />
  );
}