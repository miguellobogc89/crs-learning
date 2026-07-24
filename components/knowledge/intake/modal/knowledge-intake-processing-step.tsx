// components/knowledge/intake/modal/knowledge-intake-processing-step.tsx

"use client";

import {
  Check,
  Circle,
  Loader2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  KnowledgeIntakeFileProgress,
  KnowledgeIntakeProcessingPhase,
  KnowledgeIntakeProgressSummary,
} from "./knowledge-intake-processing.types";

type Props = {
  phase: KnowledgeIntakeProcessingPhase;
  files: KnowledgeIntakeFileProgress[];
  summary: KnowledgeIntakeProgressSummary;
};

function getFileStatusLabel(
  file: KnowledgeIntakeFileProgress,
) {
  if (file.status === "uploading") {
    return "Subiendo el documento";
  }

  if (file.status === "uploaded") {
    return "Preparando el documento";
  }

  if (file.status === "processing") {
    if (
      file.processingStep ===
      "cleaning_text"
    ) {
      return "Limpiando el contenido";
    }

    return "Extrayendo el texto";
  }

  if (file.status === "completed") {
    return "Documento preparado correctamente";
  }

  if (file.status === "error") {
    return (
      file.error ??
      "No se ha podido procesar el documento"
    );
  }

  return "Pendiente de análisis";
}

function getProcessingLabel(
  phase: KnowledgeIntakeProcessingPhase,
) {
  if (phase === "uploading") {
    return "Subiendo documentos";
  }

  if (phase === "preparing") {
    return "Preparando documentos";
  }

  if (phase === "extracting") {
    return "Analizando documentos";
  }

  return "Generando propuesta";
}

export function KnowledgeIntakeProcessingStep({
  phase,
  files,
  summary,
}: Props) {
  const totalFiles =
    summary.totalFiles ||
    files.length;

  const completedOrFailed =
    summary.completedFiles +
    summary.failedFiles;

  const analysisFinished =
    totalFiles > 0 &&
    completedOrFailed >= totalFiles &&
    summary.pendingFiles === 0;

  const isGeneratingProposal =
    phase === "generating_proposal";

  const displayedPercentage =
    analysisFinished
      ? 100
      : Math.min(
          summary.progressPercentage,
          99,
        );

  const headerTitle =
    isGeneratingProposal
      ? "Generando propuesta"
      : analysisFinished
        ? "Análisis completado"
        : "Analizando documentación";

  const headerDescription =
    isGeneratingProposal
      ? "La IA está preparando la estructura sugerida."
      : analysisFinished
        ? `${summary.completedFiles} ${
            summary.completedFiles === 1
              ? "documento preparado"
              : "documentos preparados"
          }${
            summary.failedFiles > 0
              ? ` y ${summary.failedFiles} ${
                  summary.failedFiles === 1
                    ? "descartado"
                    : "descartados"
                }`
              : ""
          }.`
        : `${completedOrFailed} de ${totalFiles} documentos analizados`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">
            {headerTitle}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {headerDescription}
          </p>

          {!analysisFinished &&
          !isGeneratingProposal &&
          summary.currentFileName ? (
            <p className="mt-1 max-w-[650px] truncate text-xs text-muted-foreground">
              Procesando:{" "}
              <span className="font-medium text-foreground">
                {
                  summary.currentFileName
                }
              </span>
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold",
            analysisFinished &&
              !isGeneratingProposal
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
          )}
        >
          {analysisFinished &&
          !isGeneratingProposal ? (
            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}

          {analysisFinished &&
          !isGeneratingProposal
            ? "Análisis completado"
            : getProcessingLabel(
                phase,
              )}
        </div>
      </div>

      <div className="mt-6 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-foreground">
            {analysisFinished
              ? "Documentos analizados"
              : "Progreso del análisis"}
          </p>

          <span
            className={cn(
              "text-sm font-semibold",
              analysisFinished
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-violet-600 dark:text-violet-400",
            )}
          >
            {displayedPercentage}%
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width,background-color] duration-500 ease-out",
              analysisFinished
                ? "bg-emerald-500"
                : "bg-violet-500",
            )}
            style={{
              width: `${displayedPercentage}%`,
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>
            Preparados:{" "}
            <strong className="text-emerald-700 dark:text-emerald-400">
              {summary.completedFiles}
            </strong>
          </span>

          <span>
            Fallidos:{" "}
            <strong
              className={cn(
                summary.failedFiles > 0
                  ? "text-red-700 dark:text-red-400"
                  : "text-foreground",
              )}
            >
              {summary.failedFiles}
            </strong>
          </span>

          {!analysisFinished ? (
            <span>
              Pendientes:{" "}
              <strong className="text-foreground">
                {summary.pendingFiles}
              </strong>
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {files.map((file) => {
            const isCompleted =
              file.status ===
              "completed";

            const isError =
              file.status === "error";

            const isProcessing =
              file.status ===
                "processing" ||
              file.status ===
                "uploading" ||
              file.status ===
                "uploaded";

            return (
              <div
                key={file.id}
                className={cn(
                  "flex min-w-0 items-center gap-3 px-4 py-3 transition-colors",
                  isCompleted &&
                    "bg-emerald-50/60 dark:bg-emerald-950/20",
                  isError &&
                    "bg-red-50/60 dark:bg-red-950/20",
                  isProcessing &&
                    "bg-violet-50/40 dark:bg-violet-950/10",
                  file.status ===
                    "pending" &&
                    "bg-background",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    isCompleted &&
                      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
                    isError &&
                      "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
                    isProcessing &&
                      "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400",
                    file.status ===
                      "pending" &&
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4 stroke-[2.5]" />
                  ) : isError ? (
                    <X className="h-4 w-4 stroke-[2.5]" />
                  ) : isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Circle className="h-3.5 w-3.5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    {file.processingOrder ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        #
                        {
                          file.processingOrder
                        }
                      </span>
                    ) : null}

                    <p className="truncate text-sm font-medium text-foreground">
                      {file.name}
                    </p>
                  </div>

                  <p
                    className={cn(
                      "mt-0.5 truncate text-xs",
                      isError
                        ? "text-red-700 dark:text-red-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {getFileStatusLabel(
                      file,
                    )}
                  </p>

                  {file.relativePath &&
                  file.relativePath !==
                    file.name ? (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                      {
                        file.relativePath
                      }
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}