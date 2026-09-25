// components/knowledge/import/modal/knowledge-import-processing-step.tsx

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
} from "@/lib/knowledge/documents/file-utils";

import { cn } from "@/lib/utils";

import type { KnowledgeImportProposalProgress } from "../knowledge-import-api";

import type {
  KnowledgeImportFileProgress,
  KnowledgeImportProcessingPhase,
  KnowledgeImportProgressSummary,
} from "./knowledge-import-processing.types";

type Props = {
  phase: KnowledgeImportProcessingPhase;
  files: KnowledgeImportFileProgress[];
  summary: KnowledgeImportProgressSummary;
  proposalProgress?: KnowledgeImportProposalProgress | null;
};

function getFileStatusLabel(
  file: KnowledgeImportFileProgress,
) {
  switch (file.status) {
    case "ready":
      return "Documento listo para extraer texto";

    case "uploading":
      return "Subiendo el documento";

    case "uploaded":
      return "Preparando el documento";

    case "processing":
      return file.processingStep ===
        "cleaning_text"
        ? "Limpiando el contenido"
        : "Analizando contenido y buscando relaciones";

    case "completed":
      return "Preparado para generar propuesta";

    case "duplicate":
      return file.duplicateOf
        ?.articleTitle
        ? `Duplicado · ya existe en "${file.duplicateOf.articleTitle}"`
        : "Documento duplicado";

    case "unsupported":
      return (
        file.error ??
        "Formato no soportado"
      );

    case "error":
      return (
        file.error ??
        "No se ha podido procesar el documento"
      );

    default:
      return "Pendiente de análisis";
  }
}

export function KnowledgeImportProcessingStep({
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
    phase ===
    "generating_proposal";

  const displayedPercentage =
    isGeneratingProposal
      ? Math.min(
          proposalProgress
            ?.progressPercentage ??
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
        <div className="flex items-end justify-between gap-6">
          <div>
            <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-slate-950">
              {isGeneratingProposal
                ? "Preparando la propuesta"
                : analysisFinished
                  ? "Análisis completado"
                  : "Analizando documentación"}
            </h3>

            <p className="mt-1 text-[12px] leading-5 text-slate-500">
              {isGeneratingProposal
                ? proposalProgress
                    ?.message ??
                  "Estamos preparando la mejor forma de incorporar el contenido."
                : analysisFinished
                  ? "La documentación está preparada para generar una propuesta."
                  : `Estamos preparando ${totalFiles} ${
                      totalFiles === 1
                        ? "documento"
                        : "documentos"
                    } y comprobando cómo encaja con el conocimiento existente.`}
            </p>
          </div>

          <span
            className={cn(
              "shrink-0 text-[14px] font-semibold tabular-nums",
              analysisFinished &&
                !isGeneratingProposal
                ? "text-emerald-600"
                : "text-[#0A58FF]",
            )}
          >
            {displayedPercentage}%
          </span>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn(
              "h-full rounded-full transition-[width,background-color] duration-500 ease-out",
              analysisFinished &&
                !isGeneratingProposal
                ? "bg-emerald-500"
                : "bg-[#0A58FF]",
            )}
            style={{
              width: `${displayedPercentage}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-2">
          {files.map((file) => {
            const isCompleted =
              file.status ===
              "completed";

            const isDuplicate =
              file.status ===
              "duplicate";

            const isError =
              file.status ===
                "error" ||
              file.status ===
                "unsupported";

            const isProcessing =
              file.status ===
                "processing" ||
              file.status ===
                "uploading" ||
              file.status ===
                "uploaded" ||
              file.status ===
                "ready";

            return (
              <div
                key={file.id}
                className={cn(
                  "flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors",
                  isCompleted &&
                    "border-emerald-100 bg-emerald-50/45",
                  isDuplicate &&
                    "border-amber-100 bg-amber-50/50",
                  isError &&
                    "border-rose-100 bg-rose-50/50",
                  isProcessing &&
                    "border-slate-200 bg-white",
                  !isCompleted &&
                    !isDuplicate &&
                    !isError &&
                    !isProcessing &&
                    "border-slate-200 bg-white",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                  <Image
                    src={getKnowledgeFileIcon(
                      file.name,
                    )}
                    alt={`${getKnowledgeFileType(
                      file.name,
                    ) || "archivo"} icono`}
                    width={28}
                    height={28}
                    quality={100}
                    className="size-7 object-contain"
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-950">
                    {file.name}
                  </p>

                  <p
                    className={cn(
                      "mt-0.5 truncate text-[11px]",
                      isCompleted &&
                        "text-emerald-600",
                      isDuplicate &&
                        "text-amber-600",
                      isError &&
                        "text-rose-600",
                      isProcessing &&
                        "text-slate-500",
                      !isCompleted &&
                        !isDuplicate &&
                        !isError &&
                        !isProcessing &&
                        "text-slate-400",
                    )}
                  >
                    {getFileStatusLabel(
                      file,
                    )}
                  </p>

                  {file.relativePath &&
                  file.relativePath !==
                    file.name ? (
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      {
                        file.relativePath
                      }
                    </p>
                  ) : null}
                </div>

                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    isCompleted &&
                      "bg-emerald-100 text-emerald-600",
                    isDuplicate &&
                      "bg-amber-100 text-amber-600",
                    isError &&
                      "bg-rose-100 text-rose-600",
                    isProcessing &&
                      "bg-[#E8F1FF] text-[#0A58FF]",
                    file.status ===
                      "pending" &&
                      "bg-slate-100 text-slate-400",
                  )}
                >
                  {isCompleted ? (
                    <Check
                      className="size-4"
                      strokeWidth={2.5}
                    />
                  ) : isDuplicate ? (
                    <Copy
                      className="size-4"
                      strokeWidth={2.2}
                    />
                  ) : isError ? (
                    <X
                      className="size-4"
                      strokeWidth={2.5}
                    />
                  ) : isProcessing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Circle className="size-3.5" />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {!isGeneratingProposal ? (
        <div className="mt-4 flex shrink-0 flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
          <span>
            <strong className="font-semibold text-slate-600">
              {
                summary.completedFiles
              }
            </strong>{" "}
            preparados
          </span>

          <span>·</span>

          <span>
            <strong
              className={cn(
                "font-semibold",
                summary.duplicateFiles >
                  0
                  ? "text-amber-600"
                  : "text-slate-600",
              )}
            >
              {
                summary.duplicateFiles
              }
            </strong>{" "}
            duplicados
          </span>

          <span>·</span>

          <span>
            <strong
              className={cn(
                "font-semibold",
                summary.failedFiles > 0
                  ? "text-rose-600"
                  : "text-slate-600",
              )}
            >
              {summary.failedFiles}
            </strong>{" "}
            errores
          </span>

          {!analysisFinished ? (
            <>
              <span>·</span>

              <span>
                <strong className="font-semibold text-slate-600">
                  {
                    summary.pendingFiles
                  }
                </strong>{" "}
                pendientes
              </span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}