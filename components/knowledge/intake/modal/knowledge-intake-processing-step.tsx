// components/knowledge/intake/modal/knowledge-intake-processing-step.tsx

"use client";

import {
  Check,
  Loader2,
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

function getPhaseLabel(
  phase: KnowledgeIntakeProcessingPhase,
) {
  if (phase === "uploading") {
    return "Subiendo";
  }

  if (phase === "preparing") {
    return "Preparando";
  }

  if (phase === "extracting") {
    return "Extrayendo texto";
  }

  return "Generando propuesta";
}

function getFileStatusLabel(
  file: KnowledgeIntakeFileProgress,
) {
  if (file.status === "uploading") {
    return "Subiendo al servidor";
  }

  if (file.status === "uploaded") {
    return "Subido al servidor";
  }

  if (file.status === "processing") {
    if (
      file.processingStep ===
      "cleaning_text"
    ) {
      return "Limpiando el texto";
    }

    return "Extrayendo el texto";
  }

  if (file.status === "completed") {
    return "Texto extraído correctamente";
  }

  if (file.status === "error") {
    return (
      file.error ??
      "No se ha podido procesar"
    );
  }

  return "Pendiente";
}

export function KnowledgeIntakeProcessingStep({
  phase,
  files,
  summary,
}: Props) {
  const totalFiles =
    summary.totalFiles ||
    files.length;

  const uploadedFiles = files.filter(
    (file) =>
      file.status === "uploaded",
  ).length;

  const uploadPercentage =
    files.length === 0
      ? 0
      : Math.round(
          (uploadedFiles /
            files.length) *
            100,
        );

  const isUploading =
    phase === "uploading";

  const percentage = isUploading
    ? uploadPercentage
    : summary.progressPercentage;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Procesando contenido
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {isUploading
              ? `${uploadedFiles} de ${files.length} archivos subidos`
              : `${summary.processedFiles} de ${totalFiles} documentos procesados`}
          </p>

          {!isUploading &&
          summary.currentFileName ? (
            <p className="mt-1 max-w-[650px] truncate text-xs text-muted-foreground">
              Archivo actual:{" "}
              <span className="font-medium text-foreground">
                {
                  summary.currentFileName
                }
              </span>
            </p>
          ) : null}
        </div>

        <div className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-violet-50 px-3 text-xs font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />

          {getPhaseLabel(phase)}
        </div>
      </div>

      <div className="mt-6 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-foreground">
            {isUploading
              ? "Progreso de subida"
              : "Progreso del procesamiento"}
          </p>

          <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">
            {percentage}%
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-violet-500 transition-[width] duration-500 ease-out"
            style={{
              width: `${percentage}%`,
            }}
          />
        </div>

        {!isUploading ? (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>
              Completados:{" "}
              <strong className="text-foreground">
                {
                  summary.completedFiles
                }
              </strong>
            </span>

            <span>
              Fallidos:{" "}
              <strong className="text-foreground">
                {summary.failedFiles}
              </strong>
            </span>

            <span>
              Pendientes:{" "}
              <strong className="text-foreground">
                {summary.pendingFiles}
              </strong>
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-lg px-3 py-3 transition-colors",
                file.status ===
                  "completed" &&
                  "bg-emerald-50/60 dark:bg-emerald-950/20",
                file.status ===
                  "processing" &&
                  "bg-violet-50/70 dark:bg-violet-950/20",
                file.status ===
                  "uploading" &&
                  "bg-sky-50/70 dark:bg-sky-950/20",
                file.status ===
                  "uploaded" &&
                  "bg-sky-50/40 dark:bg-sky-950/10",
                file.status ===
                  "pending" &&
                  "bg-muted/35",
                file.status ===
                  "error" &&
                  "bg-red-50/70 dark:bg-red-950/20",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  file.status ===
                    "completed" &&
                    "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
                  file.status ===
                    "processing" &&
                    "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
                  file.status ===
                    "uploading" &&
                    "bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
                  file.status ===
                    "uploaded" &&
                    "bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
                  file.status ===
                    "pending" &&
                    "bg-background text-muted-foreground",
                  file.status ===
                    "error" &&
                    "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400",
                )}
              >
                {file.status ===
                "completed" ? (
                  <Check className="h-4 w-4 stroke-[2.5]" />
                ) : file.status ===
                    "processing" ||
                  file.status ===
                    "uploading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : file.status ===
                  "uploaded" ? (
                  <Check className="h-4 w-4" />
                ) : file.status ===
                  "error" ? (
                  <span className="text-xs font-bold">
                    !
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
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

                <p className="mt-0.5 truncate text-xs text-muted-foreground">
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}