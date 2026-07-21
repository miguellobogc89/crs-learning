// components/knowledge/intake/knowledge-intake-flow.tsx

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";

import { UploadZone } from "@/components/knowledge/upload-zone";
import type {
  AnalyzeKnowledgeIntakeResult,
  ConfirmKnowledgeIntakeResult,
  KnowledgeIntakeProposal,
} from "@/lib/knowledge/intake/types";

import { KnowledgeIntakeProposal as KnowledgeIntakeProposalView } from "./knowledge-intake-proposal";

const ACCEPTED_FILE_TYPES = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".csv",
  ".txt",
].join(",");

type IntakeStep =
  | "upload"
  | "proposal"
  | "completed";

type KnowledgeIntakeFlowProps = {
  libraryId: string;
  onCompleted?: (
    result: ConfirmKnowledgeIntakeResult,
  ) => void;
};

type SelectedDocument = {
  id: string;
  file: File;
};

function createSelectedDocuments(
  files: File[],
  currentDocuments: SelectedDocument[],
) {
  return files.map((file) => {
    const existing = currentDocuments.find(
      (document) =>
        document.file.name === file.name &&
        document.file.size === file.size &&
        document.file.lastModified ===
          file.lastModified,
    );

    return (
      existing ?? {
        id: crypto.randomUUID(),
        file,
      }
    );
  });
}

async function readErrorMessage(
  response: Response,
  fallback: string,
) {
  try {
    const body = (await response.json()) as {
      error?: string;
    };

    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export function KnowledgeIntakeFlow({
  libraryId,
  onCompleted,
}: KnowledgeIntakeFlowProps) {
  const router = useRouter();

  const [step, setStep] =
    useState<IntakeStep>("upload");

  const [
    selectedDocuments,
    setSelectedDocuments,
  ] = useState<SelectedDocument[]>([]);

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

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [isConfirming, setIsConfirming] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const files = useMemo(
    () =>
      selectedDocuments.map(
        (document) => document.file,
      ),
    [selectedDocuments],
  );

  function handleFilesChange(
    nextFiles: File[],
  ) {
    setError(null);

    setSelectedDocuments((currentDocuments) =>
      createSelectedDocuments(
        nextFiles,
        currentDocuments,
      ),
    );
  }

  function buildFormData() {
    const formData = new FormData();

    formData.set("libraryId", libraryId);

    formData.set(
      "documentIds",
      JSON.stringify(
        selectedDocuments.map(
          (document) => document.id,
        ),
      ),
    );

    for (const document of selectedDocuments) {
      formData.append(
        "files",
        document.file,
      );
    }

    return formData;
  }

  async function analyzeDocuments() {
    if (selectedDocuments.length === 0) {
      setError(
        "Selecciona al menos un documento",
      );
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/knowledge/intake/analyze",
        {
          method: "POST",
          body: buildFormData(),
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
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function confirmProposal() {
    if (!proposal) {
      return;
    }

    setIsConfirming(true);
    setError(null);

    try {
      const formData = buildFormData();

      formData.set(
        "proposal",
        JSON.stringify(proposal),
      );

      const response = await fetch(
        "/api/knowledge/intake/confirm",
        {
          method: "POST",
          body: formData,
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
  }

  if (
    step === "proposal" &&
    proposal
  ) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <KnowledgeIntakeProposalView
          proposal={proposal}
          isConfirming={isConfirming}
          onBack={() => {
            setError(null);
            setStep("upload");
          }}
          onConfirm={confirmProposal}
        />
      </div>
    );
  }

  if (
    step === "completed" &&
    completionResult
  ) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>

          <h3 className="mt-4 text-lg font-semibold text-foreground">
            Knowledge actualizado
          </h3>

          <p className="mt-2 text-sm text-muted-foreground">
            La documentación se ha incorporado y
            los artículos afectados se han vuelto
            a analizar.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border bg-surface/20 p-3">
              <p className="text-xl font-semibold text-foreground">
                {
                  completionResult.summary
                    .createdArticles
                }
              </p>

              <p className="text-[11px] text-muted-foreground">
                Creados
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface/20 p-3">
              <p className="text-xl font-semibold text-foreground">
                {
                  completionResult.summary
                    .updatedArticles
                }
              </p>

              <p className="text-[11px] text-muted-foreground">
                Actualizados
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface/20 p-3">
              <p className="text-xl font-semibold text-foreground">
                {
                  completionResult.summary
                    .ignoredDocuments
                }
              </p>

              <p className="text-[11px] text-muted-foreground">
                Omitidos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedDocuments([]);
              setProposal(null);
              setCompletionResult(null);
              setError(null);
              setStep("upload");
            }}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700"
          >
            Incorporar más documentos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-xl border border-border bg-surface/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700">
            <Sparkles className="h-5 w-5" />
          </div>

          <div>
            <h3 className="text-base font-semibold text-foreground">
              Incorporación inteligente
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
              La IA comprobará duplicados,
              versiones y el mejor destino antes
              de modificar el Knowledge.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <UploadZone
          accept={ACCEPTED_FILE_TYPES}
          files={files}
          disabled={isAnalyzing}
          uploadingFileNames={
            isAnalyzing
              ? files.map((file) => file.name)
              : []
          }
          onFilesChange={handleFilesChange}
        />
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={
            isAnalyzing ||
            selectedDocuments.length === 0
          }
          onClick={analyzeDocuments}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analizando documentos
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Analizar antes de incorporar
            </>
          )}
        </button>
      </div>
    </div>
  );
}