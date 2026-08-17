"use client";

// components/knowledge/detail/documents/knowledge-documents-view.tsx

import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSearch,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formatFileSize,
  getKnowledgeFileIcon,
  getKnowledgeFileType,
  getKnowledgeStatus,
} from "@/lib/knowledge/file-utils";

import type {
  KnowledgeAnalysis,
  KnowledgeFile,
} from "../knowledge-detail.types";
import { parseQualityAnalysis } from "../summary/summary.utils";

type KnowledgeFileAnalysis =
  NonNullable<KnowledgeFile["knowledge_file_analysis"]>;

type Props = {
  files: KnowledgeFile[];
  analysis: KnowledgeAnalysis | null;

  articleNeedsRebuild: boolean;
  isRebuilding: boolean;
  rebuildError: string | null;

  onRebuild: () => void;
};

type ReanalyzeResponse = {
  analysis?: KnowledgeFileAnalysis;
  error?: string;
};

function buildInitialAnalysisMap(files: KnowledgeFile[]) {
  const entries = files
    .filter(
      (file) => file.knowledge_file_analysis !== null,
    )
    .map((file) => [
      file.id,
      file.knowledge_file_analysis,
    ] as const);

  return Object.fromEntries(entries) as Record<
    string,
    KnowledgeFileAnalysis | undefined
  >;
}

function formatUpdatedAt(value: Date | string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getAnalysisStatusLabel(
  analysis: KnowledgeFileAnalysis | undefined,
  isReanalyzing: boolean,
) {
  if (isReanalyzing) {
    return "Analizando...";
  }

  if (!analysis) {
    return null;
  }

  switch (analysis.status) {
    case "ready":
      return "Analizado";

    case "processing":
      return "Analizando...";

    case "error":
      return "Error de analisis";

    default:
      return analysis.status;
  }
}

function downloadJson(file: KnowledgeFile, analysisJson: unknown) {
  const blob = new Blob(
    [JSON.stringify(analysisJson, null, 2)],
    {
      type: "application/json",
    },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const extension = getKnowledgeFileType(file.file_name);
  const baseName = extension
    ? file.file_name.slice(
        0,
        -(extension.length + 1),
      )
    : file.file_name;

  link.href = url;
  link.download = `${baseName || file.id}.analysis.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function KnowledgeDocumentsView({
  files,
  analysis,
  articleNeedsRebuild,
  isRebuilding,
  rebuildError,
  onRebuild,
}: Props) {
  const { documentContributions } =
    parseQualityAnalysis(analysis?.analysis_json);
  const [analysisByFileId, setAnalysisByFileId] =
    useState(() => buildInitialAnalysisMap(files));
  const [reanalyzingFileIds, setReanalyzingFileIds] =
    useState<Record<string, boolean | undefined>>({});
  const [rowErrors, setRowErrors] = useState<
    Record<string, string | undefined>
  >({});

  useEffect(() => {
    setAnalysisByFileId(buildInitialAnalysisMap(files));
  }, [files]);

  async function handleReanalyzeDocument(
    knowledgeFileId: string,
  ) {
    if (reanalyzingFileIds[knowledgeFileId]) {
      return;
    }

    setReanalyzingFileIds((current) => ({
      ...current,
      [knowledgeFileId]: true,
    }));
    setRowErrors((current) => ({
      ...current,
      [knowledgeFileId]: undefined,
    }));

    try {
      const response = await fetch(
        `/api/knowledge/files/${knowledgeFileId}/reanalyze`,
        {
          method: "POST",
        },
      );
      const payload =
        (await response.json()) as ReanalyzeResponse;

      if (!response.ok || !payload.analysis) {
        throw new Error(
          payload.error ??
            "No se ha podido reanalizar el documento",
        );
      }

      setAnalysisByFileId((current) => ({
        ...current,
        [knowledgeFileId]: payload.analysis,
      }));
    } catch (caughtError) {
      setRowErrors((current) => ({
        ...current,
        [knowledgeFileId]:
          caughtError instanceof Error
            ? caughtError.message
            : "No se ha podido reanalizar el documento",
      }));
    } finally {
      setReanalyzingFileIds((current) => ({
        ...current,
        [knowledgeFileId]: undefined,
      }));
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Documentos fuente
            </h2>

            {articleNeedsRebuild ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />

                <span>
                  Cambios pendientes de actualizar
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />

                <span>Actualizado</span>
              </div>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Evidencias utilizadas para construir y analizar este
            articulo.
          </p>
        </div>

        {articleNeedsRebuild ? (
          <Button
            type="button"
            onClick={onRebuild}
            disabled={isRebuilding}
            className="h-11 bg-black px-6 text-white hover:bg-black/85"
          >
            {isRebuilding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}

            {isRebuilding
              ? "Analizando..."
              : "Analizar cambios"}
          </Button>
        ) : null}
      </div>

      {rebuildError ? (
        <p className="mb-6 text-sm text-red-600">
          {rebuildError}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div className="divide-y divide-border">
            {files.map((file) => {
              const extension =
                getKnowledgeFileType(file.file_name);
              const icon = getKnowledgeFileIcon(
                file.file_name,
              );
              const contribution =
                documentContributions.find(
                  (item) =>
                    item.sourceId === file.id ||
                    item.fileName === file.file_name,
                );
              const fileAnalysis =
                analysisByFileId[file.id];
              const isReanalyzing =
                reanalyzingFileIds[file.id] === true;
              const analysisStatusLabel =
                getAnalysisStatusLabel(
                  fileAnalysis,
                  isReanalyzing,
                );
              const hasAnalysisJson =
                fileAnalysis?.analysis_json !== null &&
                fileAnalysis?.analysis_json !== undefined;
              const rowError =
                rowErrors[file.id] ??
                fileAnalysis?.error_message ??
                null;

              return (
                <div
                  key={file.id}
                  className="flex flex-col gap-4 px-4 py-4 transition hover:bg-muted/30 lg:flex-row lg:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface">
                      <Image
                        src={icon}
                        alt={`${extension || "archivo"} icono`}
                        width={26}
                        height={26}
                        className="h-6 w-6 object-contain"
                      />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="break-words text-sm font-semibold text-foreground">
                          {file.file_name}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {file.status ? (
                            <span className="w-fit rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                              {getKnowledgeStatus(
                                file.status,
                              )}
                            </span>
                          ) : null}

                          {analysisStatusLabel ? (
                            <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                              {analysisStatusLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {extension
                            ? extension.toUpperCase()
                            : "Sin extension"}
                        </span>

                        {file.file_size !== null ? (
                          <span>
                            {formatFileSize(
                              file.file_size,
                            )}
                          </span>
                        ) : null}

                        {fileAnalysis?.updated_at ? (
                          <span>
                            Actualizado{" "}
                            {formatUpdatedAt(
                              fileAnalysis.updated_at,
                            )}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {contribution?.summary ||
                          "Sin descripcion documental guardada."}
                      </p>

                      {rowError ? (
                        <p className="mt-2 text-sm text-red-600">
                          {rowError}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isReanalyzing}
                      onClick={() =>
                        handleReanalyzeDocument(file.id)
                      }
                      className="h-10 px-4"
                    >
                      {isReanalyzing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Reanalizar
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={!hasAnalysisJson}
                      onClick={() =>
                        fileAnalysis?.analysis_json !== undefined &&
                        fileAnalysis.analysis_json !== null
                          ? downloadJson(
                              file,
                              fileAnalysis.analysis_json,
                            )
                          : undefined
                      }
                      className="h-10 px-4"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Descargar JSON
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300">
            <FileSearch className="h-5 w-5" />
          </div>

          <h3 className="mt-4 text-base font-semibold text-foreground">
            No hay documentos vinculados
          </h3>

          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            La incorporacion de nuevas evidencias se realiza desde el
            flujo de Importacion de Conocimiento.
          </p>
        </div>
      )}
    </section>
  );
}
