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
} from "./knowledge-intake-processing.types";

type Props = {
  phase: KnowledgeIntakeProcessingPhase;
  files: KnowledgeIntakeFileProgress[];
};

export function KnowledgeIntakeProcessingStep({
  phase,
  files,
}: Props) {
  const uploadedFiles = files.filter(
    (file) => file.status === "uploaded",
  ).length;

  const totalFiles = files.length;

  const percentage =
    totalFiles === 0
      ? 0
      : Math.round(
          (uploadedFiles / totalFiles) * 100,
        );

  const isUploading =
    phase === "uploading";

  const pendingFiles = files.filter(
    (file) => file.status === "pending",
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Procesando contenido
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {isUploading
              ? `${uploadedFiles} de ${totalFiles} archivos subidos`
              : `${totalFiles} archivos recibidos correctamente`}
          </p>
        </div>

        <div
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold",
            isUploading
              ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
              : "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
          )}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />

          {isUploading
            ? "Subiendo"
            : "Analizando"}
        </div>
      </div>

      <div className="mt-6 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-foreground">
            {isUploading
              ? "Progreso de subida"
              : "Procesando documentos"}
          </p>

          <span
            className={cn(
              "text-sm font-semibold",
              isUploading
                ? "text-sky-600 dark:text-sky-400"
                : "text-violet-600 dark:text-violet-400",
            )}
          >
            {isUploading
              ? `${percentage}%`
              : "En curso"}
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          {isUploading ? (
            <div
              className="h-full rounded-full bg-sky-500 transition-[width] duration-500 ease-out"
              style={{
                width: `${percentage}%`,
              }}
            />
          ) : (
            <div className="h-full w-1/3 animate-[intake-progress_1.4s_ease-in-out_infinite] rounded-full bg-violet-500" />
          )}
        </div>
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-lg px-3 py-3 transition-colors",
                file.status === "uploaded" &&
                  "bg-emerald-50/60 dark:bg-emerald-950/20",
                file.status === "uploading" &&
                  "bg-sky-50/70 dark:bg-sky-950/20",
                file.status === "pending" &&
                  "bg-muted/35",
                file.status === "error" &&
                  "bg-red-50/70 dark:bg-red-950/20",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  file.status === "uploaded" &&
                    "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
                  file.status === "uploading" &&
                    "bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
                  file.status === "pending" &&
                    "bg-background text-muted-foreground",
                  file.status === "error" &&
                    "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400",
                )}
              >
                {file.status === "uploaded" ? (
                  <Check className="h-4 w-4 stroke-[2.5]" />
                ) : file.status ===
                  "uploading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
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
                <p className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </p>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  {file.status === "uploaded"
                    ? "Procesado correctamente"
                    : file.status ===
                        "uploading"
                      ? "Subiendo al servidor"
                      : file.status ===
                          "error"
                        ? file.error ??
                          "No se ha podido procesar"
                        : "Pendiente"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isUploading && pendingFiles > 0 ? (
        <div className="shrink-0 pt-4 text-xs text-muted-foreground">
          {pendingFiles}{" "}
          {pendingFiles === 1
            ? "archivo pendiente"
            : "archivos pendientes"}
        </div>
      ) : null}
    </div>
  );
}