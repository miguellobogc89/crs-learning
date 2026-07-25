
"use client";

import Image from "next/image";
import {
  Check,
  Circle,
  Copy,
  Loader2,
  X,
} from "lucide-react";

import {
  getKnowledgeFileIcon,
  getKnowledgeFileType,
} from "@/lib/knowledge/file-utils";
import { cn } from "@/lib/utils";

import type {
  KnowledgeImportProposalProgress,
} from "../../import/knowledge-import-api";

import type {
  KnowledgeIntakeFileProgress,
  KnowledgeIntakeProcessingPhase,
  KnowledgeIntakeProgressSummary,
} from "./knowledge-intake-processing.types";

type Props = {
  phase: KnowledgeIntakeProcessingPhase;
  files: KnowledgeIntakeFileProgress[];
  summary: KnowledgeIntakeProgressSummary;
  proposalProgress?: KnowledgeImportProposalProgress | null;
};

function getFileStatusLabel(
  file: KnowledgeIntakeFileProgress,
) {
  switch (file.status) {
    case "uploading":
      return "Subiendo el documento";

    case "uploaded":
      return "Preparando el documento";

    case "processing":
      return file.processingStep ===
        "cleaning_text"
        ? "Limpiando el contenido"
        : "Extrayendo el texto";

    case "completed":
      return "Documento preparado correctamente";

    case "duplicate":
      return file.duplicateOf?.articleTitle
        ? `Duplicado · ya existe en "${file.duplicateOf.articleTitle}"`
        : "Documento duplicado";

    case "error":
      return (
        file.error ??
        "No se ha podido procesar el documento"
      );

    default:
      return "Pendiente de análisis";
  }
}

export function KnowledgeIntakeProcessingStep({
  phase,
  files,
  summary,
  proposalProgress,
}: Props) {
  const totalFiles =
    summary.totalFiles ||
    files.length;

  const analyzedFiles =
    summary.completedFiles +
    summary.duplicateFiles +
    summary.failedFiles;

  const analysisFinished =
    totalFiles > 0 &&
    analyzedFiles >= totalFiles &&
    summary.pendingFiles === 0;

  const isGeneratingProposal =
    phase === "generating_proposal";

  const displayedPercentage =
    isGeneratingProposal
      ? Math.min(
          proposalProgress?.progressPercentage ??
            0,
          100,
        )
      : analysisFinished
        ? 100
        : Math.min(
            summary.progressPercentage,
            99,
          );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-foreground">
            {isGeneratingProposal
              ? "Progreso de la propuesta"
              : "Progreso del análisis"}
          </p>

          <span
            className={cn(
              "text-sm font-semibold",
              analysisFinished &&
                !isGeneratingProposal
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
              analysisFinished &&
                !isGeneratingProposal
                ? "bg-emerald-500"
                : "bg-violet-500",
            )}
            style={{
              width: `${displayedPercentage}%`,
            }}
          />
        </div>

        {!isGeneratingProposal ? (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>
              Preparados:{" "}
              <strong className="text-emerald-700 dark:text-emerald-400">
                {summary.completedFiles}
              </strong>
            </span>

            <span>
              Duplicados:{" "}
              <strong
                className={cn(
                  summary.duplicateFiles > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-foreground",
                )}
              >
                {summary.duplicateFiles}
              </strong>
            </span>

            <span>
              Fallidos:{" "}
              <strong
                className={cn(
                  summary.failedFiles > 0
                    ? "text-rose-700 dark:text-rose-400"
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
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            {proposalProgress?.message ??
              "Preparando la estructura sugerida"}
          </p>
        )}
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {files.map((file) => {
            const isCompleted =
              file.status === "completed";
            const isDuplicate =
              file.status === "duplicate";
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
                    "bg-emerald-50/70 dark:bg-emerald-950/20",
                  isDuplicate &&
                    "bg-amber-50/80 dark:bg-amber-950/20",
                  isError &&
                    "bg-rose-50/80 dark:bg-rose-950/20",
                  isProcessing &&
                    "bg-violet-50/40 dark:bg-violet-950/10",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/80">
                  <Image
                    src={getKnowledgeFileIcon(
                      file.name,
                    )}
                    alt={`${getKnowledgeFileType(
                      file.name,
                    ) || "archivo"} icono`}
                    width={26}
                    height={26}
                    quality={100}
                    className="h-6.5 w-6.5 object-contain"
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {file.name}
                  </p>

                  <p
                    className={cn(
                      "mt-0.5 truncate text-xs",
                      isCompleted &&
                        "text-emerald-700 dark:text-emerald-400",
                      isDuplicate &&
                        "text-amber-700 dark:text-amber-400",
                      isError &&
                        "text-rose-700 dark:text-rose-400",
                      !isCompleted &&
                        !isDuplicate &&
                        !isError &&
                        "text-muted-foreground",
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
                      {file.relativePath}
                    </p>
                  ) : null}
                </div>

                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    isCompleted &&
                      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
                    isDuplicate &&
                      "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
                    isError &&
                      "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400",
                    isProcessing &&
                      "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400",
                    file.status ===
                      "pending" &&
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4 stroke-[2.5]" />
                  ) : isDuplicate ? (
                    <Copy className="h-4 w-4 stroke-[2.25]" />
                  ) : isError ? (
                    <X className="h-4 w-4 stroke-[2.5]" />
                  ) : isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Circle className="h-3.5 w-3.5" />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
