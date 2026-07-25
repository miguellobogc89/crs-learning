// components/knowledge/intake/modal/knowledge-intake-analysis-result-step.tsx

"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  KnowledgeIntakeFileProgress,
  KnowledgeIntakeProgressSummary,
} from "./knowledge-intake-processing.types";

type Props = {
  files: KnowledgeIntakeFileProgress[];
  summary: KnowledgeIntakeProgressSummary;
  error: string | null;
};

export function KnowledgeIntakeAnalysisResultStep({
  files,
  summary,
  error,
}: Props) {
  const hasValidFiles =
    summary.completedFiles > 0;

  const hasFailedFiles =
    summary.failedFiles > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              hasValidFiles
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700",
            )}
          >
            {hasValidFiles ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">
              Análisis de documentos completado
            </h2>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {hasValidFiles
                ? `${summary.completedFiles} de ${summary.totalFiles} documentos están preparados para generar la propuesta.`
                : "No se ha podido preparar ningún documento para generar la propuesta."}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Documentos analizados
            </p>

            <p className="mt-1 text-2xl font-semibold text-foreground">
              {summary.totalFiles}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <p className="text-xs font-medium text-emerald-700">
              Preparados
            </p>

            <p className="mt-1 text-2xl font-semibold text-emerald-700">
              {summary.completedFiles}
            </p>
          </div>

          <div
            className={cn(
              "rounded-xl border px-4 py-3",
              hasFailedFiles
                ? "border-red-200 bg-red-50/60"
                : "border-border bg-muted/20",
            )}
          >
            <p
              className={cn(
                "text-xs font-medium",
                hasFailedFiles
                  ? "text-red-700"
                  : "text-muted-foreground",
              )}
            >
              Descartados
            </p>

            <p
              className={cn(
                "mt-1 text-2xl font-semibold",
                hasFailedFiles
                  ? "text-red-700"
                  : "text-foreground",
              )}
            >
              {summary.failedFiles}
            </p>
          </div>
        </div>

        {hasFailedFiles ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />

            <div>
              <p className="text-sm font-medium text-amber-900">
                Algunos documentos se han descartado
              </p>

              <p className="mt-0.5 text-xs leading-5 text-amber-800">
                No se incluirán en la propuesta. Puedes volver para
                corregirlos o continuar únicamente con los documentos
                preparados.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="space-y-2">
          {files.map((file) => {
            const isCompleted =
              file.status === "completed";

            const isError =
              file.status === "error";

            return (
              <div
                key={file.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3",
                  isCompleted &&
                    "border-emerald-200 bg-emerald-50/40",
                  isError &&
                    "border-red-200 bg-red-50/40",
                  !isCompleted &&
                    !isError &&
                    "border-border bg-background",
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    isCompleted &&
                      "bg-emerald-100 text-emerald-700",
                    isError &&
                      "bg-red-100 text-red-700",
                    !isCompleted &&
                      !isError &&
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isError ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {file.name}
                    </p>

                    {isCompleted ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Preparado
                      </span>
                    ) : null}

                    {isError ? (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        Descartado
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {isCompleted
                      ? "El contenido se ha leído correctamente"
                      : file.error ||
                        "No se ha podido procesar el documento"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}