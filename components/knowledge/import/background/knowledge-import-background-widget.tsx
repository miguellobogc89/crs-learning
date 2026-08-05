"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Maximize2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { KnowledgeImportModal } from "../modal";
import { KnowledgeImportCloseGuard } from "../modal/knowledge-import-close-guard";
import { useBackgroundImports } from "./use-background-imports";

import type {
  BackgroundKnowledgeImportTask,
  KnowledgeImportSharedState,
} from "./knowledge-import-background.types";
import type {
  KnowledgeImportFlowFile,
} from "@/lib/knowledge/import-flow";

function formatBytes(size?: number | null) {
  if (!size) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  let value = size;
  let unitIndex = 0;

  while (
    value >= 1024 &&
    unitIndex < units.length - 1
  ) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(
  value?: string | Date | null,
) {
  if (!value) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(
  startedAt?: string | Date | null,
) {
  if (!startedAt) {
    return "No disponible";
  }

  const elapsedMs =
    Date.now() -
    new Date(startedAt).getTime();

  const totalSeconds = Math.max(
    0,
    Math.floor(elapsedMs / 1000),
  );

  const minutes = Math.floor(
    totalSeconds / 60,
  );
  const seconds =
    totalSeconds % 60;

  return minutes > 0
    ? `${minutes} min ${seconds} s`
    : `${seconds} s`;
}

function getExtension(fileName: string) {
  const index =
    fileName.lastIndexOf(".");

  if (index < 0) {
    return "sin extension";
  }

  return fileName
    .slice(index + 1)
    .toLowerCase();
}

function getProgressMessage(
  task: BackgroundKnowledgeImportTask,
) {
  if (task.proposalProgress?.message) {
    return task.proposalProgress.message;
  }

  if (task.summary.currentFileName) {
    return `Procesando ${task.summary.currentFileName}`;
  }

  if (task.error) {
    return task.error;
  }

  return "Importacion en curso";
}

function getWidgetProgress(
  task: BackgroundKnowledgeImportTask,
  sharedState: KnowledgeImportSharedState,
) {
  if (
    sharedState.currentAction ===
    "confirming"
  ) {
    return {
      title: "Aplicando la propuesta",
      message:
        "Estamos creando y actualizando la estructura del repositorio.",
      percentage: 100,
      tone: "cyan" as const,
      indeterminate: true,
    };
  }

  if (
    sharedState.processingPhase ===
    "generating_proposal"
  ) {
    return {
      title: "Progreso de la propuesta",
      message:
        task.proposalProgress?.message ??
        "Preparando la estructura sugerida",
      percentage: Math.min(
        task.proposalProgress
          ?.progressPercentage ?? 0,
        100,
      ),
      tone: "leaf" as const,
      indeterminate: false,
    };
  }

  return {
    title: "Progreso del analisis",
    message: getProgressMessage(task),
    percentage:
      sharedState.progressSummary
        .progressPercentage,
      tone: "leaf" as const,
    indeterminate: false,
  };
}

function getSummary(
  files: KnowledgeImportFlowFile[],
) {
  return {
    ready: files.filter(
      (file) =>
        file.status === "ready",
    ).length,
    processing: files.filter(
      (file) =>
        file.status === "processing" ||
        file.status === "uploading",
    ).length,
    completed: files.filter(
      (file) =>
        file.status === "completed",
    ).length,
    duplicate: files.filter(
      (file) =>
        file.status === "duplicate",
    ).length,
    unsupported: files.filter(
      (file) =>
        file.status === "unsupported",
    ).length,
    failed: files.filter(
      (file) =>
        file.status === "error",
    ).length,
  };
}

function KnowledgeImportWidget({
  task,
}: {
  task: BackgroundKnowledgeImportTask;
}) {
  const {
    getImportState,
    showImportDetail,
    continueWithValidDocuments,
    confirmProposal,
    cancelImport,
  } = useBackgroundImports();

  const sharedState =
    getImportState(task.importId);

  const [
    detailsOpen,
    setDetailsOpen,
  ] = useState(false);
  const [
    cancelOpen,
    setCancelOpen,
  ] = useState(false);
  const [
    isCancelling,
    setIsCancelling,
  ] = useState(false);
  const [
    cancelError,
    setCancelError,
  ] = useState<string | null>(null);

  const fileSummary = useMemo(
    () => getSummary(task.files),
    [task.files],
  );

  const totalSize = useMemo(
    () =>
      task.files.reduce(
        (total, file) =>
          total + (file.size ?? 0),
        0,
      ),
    [task.files],
  );

  const processedSize = useMemo(
    () =>
      task.files
        .filter((file) =>
          [
            "completed",
            "duplicate",
            "unsupported",
            "error",
          ].includes(file.status),
        )
        .reduce(
          (total, file) =>
            total + (file.size ?? 0),
          0,
        ),
    [task.files],
  );

  const widgetProgress =
    sharedState
      ? getWidgetProgress(
          task,
          sharedState,
        )
      : null;

  const canShowDocumentDetails =
    sharedState
      ? sharedState.currentStep ===
          "analyzing" &&
        sharedState.processingPhase !==
          "generating_proposal" &&
        sharedState.currentAction !==
          "confirming"
      : false;

  useEffect(() => {
    if (!canShowDocumentDetails) {
      setDetailsOpen(false);
    }
  }, [canShowDocumentDetails]);

  async function confirmCancel() {
    setIsCancelling(true);
    setCancelError(null);

    const result =
      await cancelImport(task.importId);

    try {
      if (!result.success) {
        throw new Error(
          result.error ??
            "No se ha podido cancelar la importacion",
        );
      }
      setCancelOpen(false);
    } catch (error) {
      setCancelError(
        error instanceof Error
          ? error.message
          : "No se ha podido cancelar la importacion",
      );
    } finally {
      setIsCancelling(false);
    }
  }

  async function runNextAction() {
    if (!sharedState?.nextAction) {
      return;
    }

    if (
      sharedState.nextAction ===
      "generate_proposal"
    ) {
      await continueWithValidDocuments(
        task.importId,
      );
      return;
    }

    await confirmProposal(
      task.importId,
    );
  }

  if (!sharedState || !widgetProgress) {
    return null;
  }

  return (
    <>
      <section className="fixed bottom-6 right-6 z-50 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0" />
              <h2 className="truncate text-sm font-semibold">
                Importacion de Knowledge
              </h2>
            </div>

            <p className="mt-1 truncate text-xs text-muted-foreground">
              {task.label ??
                task.context?.libraryId ??
                task.importId}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Ver detalle"
              onClick={() =>
                showImportDetail(
                  task.importId,
                )
              }
            >
              <Maximize2 className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Cancelar importacion"
              onClick={() =>
                setCancelOpen(true)
              }
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="space-y-3 px-4 py-3">
          <div>
            <div className="flex items-center justify-between text-xs">
              <div>
                <p className="font-medium text-foreground">
                  {widgetProgress.title}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {widgetProgress.message}
                </p>
              </div>
              <span className="font-medium">
                {widgetProgress.indeterminate
                  ? null
                  : `${widgetProgress.percentage}%`}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  widgetProgress.tone ===
                  "cyan"
                    ? "h-full bg-emerald-500 transition-all animate-pulse"
                    : "h-full bg-emerald-500 transition-all"
                }
                style={{
                  width: `${widgetProgress.percentage}%`,
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">
                Fase
              </div>
              <div className="truncate font-medium">
                {sharedState.processingPhase}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">
                Step
              </div>
              <div className="truncate font-medium">
                {sharedState.currentStep}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">
                Estado
              </div>
              <div className="truncate font-medium">
                {sharedState.status}
              </div>
            </div>
          </div>

          {canShowDocumentDetails ? (
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                Total: {sharedState.progressSummary.totalFiles}
              </div>
              <div>
                OK: {fileSummary.completed}
              </div>
              <div>
                Dup: {fileSummary.duplicate}
              </div>
              <div>
                Fallos:{" "}
                {fileSummary.failed +
                  fileSummary.unsupported}
              </div>
            </div>
          ) : null}

          <Button
            type="button"
            disabled={
              !sharedState.canContinue
            }
            className="h-9 w-full bg-black text-white hover:bg-black/90 disabled:bg-black/40"
            onClick={runNextAction}
          >
            {sharedState.currentAction ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {sharedState.nextAction ===
            "generate_proposal"
              ? "Generar propuesta"
              : sharedState.nextAction ===
                  "confirm_proposal"
                ? "Aplicando propuesta"
                : sharedState.currentAction ===
                    "confirming"
                  ? "Aplicando propuesta"
                  : "Analizando documentos"}
          </Button>

          {canShowDocumentDetails ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full"
              onClick={() =>
                setDetailsOpen(
                  (current) => !current,
                )
              }
            >
              {detailsOpen ? (
                <ChevronUp className="mr-2 h-4 w-4" />
              ) : (
                <ChevronDown className="mr-2 h-4 w-4" />
              )}
              Detalle
            </Button>
          ) : null}

          {canShowDocumentDetails &&
          detailsOpen ? (
            <div className="max-h-72 space-y-3 overflow-auto border-t border-border pt-3 text-xs">
              <dl className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-muted-foreground">
                    importId
                  </dt>
                  <dd className="break-all">
                    {task.importId}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Biblioteca
                  </dt>
                  <dd className="break-all">
                    {task.context?.libraryId ??
                      "No disponible"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Inicio
                  </dt>
                  <dd>
                    {formatDate(
                      task.registeredAt,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Ultima actualizacion
                  </dt>
                  <dd>
                    {formatDate(
                      task.updatedAt,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Duracion
                  </dt>
                  <dd>
                    {formatDuration(
                      task.registeredAt,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Propuesta
                  </dt>
                  <dd>
                    {task.proposal
                      ? "Disponible"
                      : "No disponible"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Tamano total
                  </dt>
                  <dd>
                    {formatBytes(totalSize)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Tamano procesado
                  </dt>
                  <dd>
                    {formatBytes(
                      processedSize,
                    )}
                  </dd>
                </div>
              </dl>

              {task.error ? (
                <p className="rounded-md bg-destructive/10 p-2 text-destructive">
                  {task.error}
                </p>
              ) : null}

              <dl className="grid grid-cols-3 gap-2">
                <div>
                  Preparados: {fileSummary.ready}
                </div>
                <div>
                  Procesando: {fileSummary.processing}
                </div>
                <div>
                  Completados: {fileSummary.completed}
                </div>
                <div>
                  Duplicados: {fileSummary.duplicate}
                </div>
                <div>
                  Unsupported: {fileSummary.unsupported}
                </div>
                <div>
                  Pendientes: {task.summary.pendingFiles}
                </div>
              </dl>

              <div className="space-y-2">
                {task.files.map((file) => (
                  <article
                    key={file.id}
                    className="rounded-md border border-border p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-medium">
                        {file.name}
                      </h3>
                      <span className="shrink-0 rounded bg-muted px-2 py-0.5">
                        {file.status}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-1 text-muted-foreground">
                      <div>
                        id: {file.id}
                      </div>
                      <div>
                        ext:{" "}
                        {getExtension(
                          file.name,
                        )}
                      </div>
                      <div>
                        mime:{" "}
                        {file.fileType ??
                          "No disponible"}
                      </div>
                      <div>
                        size:{" "}
                        {formatBytes(
                          file.size,
                        )}
                      </div>
                      <div className="col-span-2 break-all">
                        ruta:{" "}
                        {file.relativePath ??
                          "No disponible"}
                      </div>
                      <div>
                        paso:{" "}
                        {file.processingStep ??
                          "No disponible"}
                      </div>
                      <div>
                        estado proc.:{" "}
                        {file.processingStatus ??
                          "No disponible"}
                      </div>
                      <div>
                        orden:{" "}
                        {file.processingOrder ??
                          "No disponible"}
                      </div>
                      <div>
                        inicio:{" "}
                        {formatDate(
                          file.startedAt,
                        )}
                      </div>
                      <div>
                        fin:{" "}
                        {formatDate(
                          file.completedAt,
                        )}
                      </div>
                      <div>
                        creado:{" "}
                        {formatDate(
                          file.createdAt,
                        )}
                      </div>
                      <div>
                        actualizado:{" "}
                        {formatDate(
                          file.updatedAt,
                        )}
                      </div>
                    </dl>

                    {file.duplicateOf ? (
                      <p className="mt-2 text-muted-foreground">
                        Duplicado de archivo{" "}
                        {
                          file.duplicateOf
                            .fileId
                        }{" "}
                        en articulo{" "}
                        {
                          file.duplicateOf
                            .articleId
                        }{" "}
                        (
                        {
                          file.duplicateOf
                            .articleTitle
                        }
                        )
                      </p>
                    ) : null}

                    {file.error ? (
                      <p className="mt-2 text-destructive">
                        {file.error}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <KnowledgeImportCloseGuard
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirmClose={confirmCancel}
        isConfirming={isCancelling}
        error={cancelError}
      />
    </>
  );
}

export function KnowledgeImportBackgroundWidget() {
  const {
    tasks,
    widgetTask,
  } = useBackgroundImports();

  const modalTask =
    tasks.find(
      (task) =>
        task.displayMode ===
          "modal" &&
        task.detailHost ===
          "global" &&
        task.context,
    ) ?? null;

  return (
    <>
      {widgetTask ? (
        <KnowledgeImportWidget
          task={widgetTask}
        />
      ) : null}

      {modalTask ? (
        <KnowledgeImportModal
          open
          context={modalTask.context}
          onOpenChange={() =>
            undefined
          }
        />
      ) : null}
    </>
  );
}
