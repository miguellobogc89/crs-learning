
// components/knowledge/import/modal/knowledge-import-modal.tsx

"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

import { useKnowledgeImport } from "../hooks/use-knowledge-import";
import { KnowledgeImportModalHeader } from "./knowledge-import-modal-header";
import { KnowledgeImportModalProgress } from "./knowledge-import-modal-progress";
import { KnowledgeImportUploadStep } from "./knowledge-import-upload-step";
import { KnowledgeImportProcessingStep } from "./knowledge-import-processing-step";
import { KnowledgeImportCloseGuard } from "./knowledge-import-close-guard";

import type {
  KnowledgeImportModalProps,
} from "./knowledge-import-modal.types";

import type {
  KnowledgeImportReviewFile,
  KnowledgeImportReviewResult,
} from "../knowledge-import-review";
import { getKnowledgeImportReviewMessage, isAllDuplicateReview } from "../knowledge-import-review";

function getFilesSelectionKey(
  files: File[] | undefined,
) {
  if (!files?.length) {
    return null;
  }

  return files
    .map((file) =>
      [
        file.name,
        file.size,
        file.lastModified,
      ].join(":"),
    )
    .join("|");
}

function formatFileSize(
  bytes: number,
) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes / (1024 * 1024)
  ).toFixed(1)} MB`;
}

function getReviewReason(
  file: KnowledgeImportReviewFile,
) {
  switch (file.status) {
    case "unsupported":
      return "Formato no admitido";

    case "duplicate":
      return "Documento duplicado";

    case "possible-duplicate":
      return "Posible duplicado";

    default:
      return "Requiere revisión";
  }
}

function KnowledgeImportReview({
  review,
}: {
  review: KnowledgeImportReviewResult;
}) {
  const {
    inventory,
    acceptedFiles,
    reviewFiles,
    unreadableExistingDocumentIds,
  } = review;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <h3 className="text-sm font-semibold">
          {isAllDuplicateReview(review) ? "Archivos duplicados" : "Revisión necesaria antes de importar"}
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          {getKnowledgeImportReviewMessage(review)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">
            Archivos detectados
          </div>

          <div className="mt-1 text-lg font-semibold">
            {inventory.totalFiles}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">
            Tamaño total
          </div>

          <div className="mt-1 text-lg font-semibold">
            {formatFileSize(
              inventory.totalBytes,
            )}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">
            Admitidos
          </div>

          <div className="mt-1 text-lg font-semibold">
            {acceptedFiles.length}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">
            Requieren revisión
          </div>

          <div className="mt-1 text-lg font-semibold">
            {reviewFiles.length}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
        {reviewFiles.length > 0 ? (
          <div className="divide-y">
            {reviewFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-start justify-between gap-4 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium">
                    {file.fileName}
                  </p>

                  {file.relativePath &&
                  file.relativePath !==
                    file.fileName ? (
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {file.relativePath}
                    </p>
                  ) : null}

                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatFileSize(
                      file.fileSize,
                    )}
                  </p>
                </div>

                <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  {getReviewReason(file)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            No hay archivos individuales
            marcados para revisión.
          </p>
        )}

        {unreadableExistingDocumentIds.length >
        0 ? (
          <div className="border-t p-4">
            <p className="text-sm font-medium">
              No se ha podido comprobar
              la duplicidad frente a{" "}
              {
                unreadableExistingDocumentIds.length
              }{" "}
              documento(s) existente(s).
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              La importación permanece
              detenida para evitar guardar
              archivos sin completar la
              comprobación de duplicados.
            </p>
          </div>
        ) : null}

        {inventory.skippedArchiveEntries
          .length > 0 ? (
          <div className="border-t p-4">
            <p className="text-sm font-medium">
              Entradas del ZIP omitidas:{" "}
              {
                inventory
                  .skippedArchiveEntries
                  .length
              }
            </p>

            <div className="mt-2 space-y-1">
              {inventory.skippedArchiveEntries.map(
                (entry, index) => (
                  <p
                    key={`${entry.archiveName}-${entry.relativePath}-${index}`}
                    className="break-all text-xs text-muted-foreground"
                  >
                    {entry.archiveName}
                    {" / "}
                    {entry.relativePath}
                    {" — "}
                    {entry.reason ===
                    "directory"
                      ? "Carpeta"
                      : "Ruta no válida"}
                  </p>
                ),
              )}
            </div>
          </div>
        ) : null}
      </div>

      {!isAllDuplicateReview(review) ? <p className="text-xs text-muted-foreground">
        Puedes modificar la selección
        de archivos y volver a iniciar
        la importación. Los documentos
        admitidos no se han importado
        todavía.
      </p> : null}
    </div>
  );
}

export function KnowledgeImportModal({
  open,
  context,
  onOpenChange,
  onCompleted,
  selectedFiles,
  resumeImportId,
}: KnowledgeImportModalProps) {
  const [
    closeGuardOpen,
    setCloseGuardOpen,
  ] = useState(false);

  const [
    isCancellingClose,
    setIsCancellingClose,
  ] = useState(false);

  const [
    closeGuardError,
    setCloseGuardError,
  ] = useState<string | null>(null);

  const startedSelectionKeyRef =
    useRef<string | null>(null);

  const consumedSelectionRef = useRef<File[] | null>(null);

  const knowledgeImport =
    useKnowledgeImport({
      context: context!,
      onCompleted,
      resumeImportId,
    });

  const selectionKey =
    getFilesSelectionKey(
      selectedFiles,
    );

  const isWaitingToStart =
    open &&
    Boolean(selectedFiles?.length) &&
    knowledgeImport.step === "upload" &&
    knowledgeImport.files.length === 0;

  const duplicateFileCount =
    knowledgeImport.fileProgress.filter(
      (file) =>
        file.status === "duplicate",
    ).length;

  useEffect(() => {
    if (!open) {
      startedSelectionKeyRef.current =
        null;
      consumedSelectionRef.current = null;
      return;
    }

    if (
      !selectedFiles?.length ||
      consumedSelectionRef.current === selectedFiles ||
      knowledgeImport.files.length > 0
    ) {
      return;
    }

    // Resetting the hook during cancellation must not reload the old selection.
    consumedSelectionRef.current = selectedFiles;
    knowledgeImport.handleFilesChange(
      selectedFiles,
    );
  }, [
    open,
    selectedFiles,
    knowledgeImport.files.length,
    knowledgeImport.handleFilesChange,
  ]);

  useEffect(() => {
    if (
      !open ||
      !selectionKey ||
      knowledgeImport.importReview ||
      knowledgeImport.step !== "upload" ||
      knowledgeImport.files.length === 0 ||
      startedSelectionKeyRef.current ===
        selectionKey
    ) {
      return;
    }

    startedSelectionKeyRef.current =
      selectionKey;

    void knowledgeImport.analyzeDocuments();
  }, [
    open,
    selectionKey,
    knowledgeImport.importReview,
    knowledgeImport.step,
    knowledgeImport.files.length,
    knowledgeImport.analyzeDocuments,
  ]);

  if (!context) {
    return null;
  }

  function requestClose() {
    if (knowledgeImport.allFilesDuplicate) {
      knowledgeImport.finishActiveImport();
      startedSelectionKeyRef.current = null;
      onOpenChange(false);
      return;
    }
    if (
      knowledgeImport.step ===
      "completed"
    ) {
      knowledgeImport.finishActiveImport();

      startedSelectionKeyRef.current =
        null;

      onOpenChange(false);
      return;
    }

    if (
      knowledgeImport.hasUnsavedProgress
    ) {
      setCloseGuardError(null);
      setCloseGuardOpen(true);
      return;
    }

    knowledgeImport.reset();

    startedSelectionKeyRef.current =
      null;

    onOpenChange(false);
  }

  function handleCloseGuardOpenChange(
    nextOpen: boolean,
  ) {
    if (
      isCancellingClose &&
      !nextOpen
    ) {
      return;
    }

    if (!nextOpen) {
      setCloseGuardError(null);
    }

    setCloseGuardOpen(
      nextOpen,
    );
  }

  async function confirmCloseWithoutSaving() {
    setIsCancellingClose(true);
    setCloseGuardError(null);

    const result =
      await knowledgeImport.cancelActiveImport();

    if (!result.success) {
      setCloseGuardError(
        result.error ??
          "No se ha podido cancelar la importacion",
      );

      setIsCancellingClose(false);
      return;
    }

    setCloseGuardOpen(false);
    setIsCancellingClose(false);

    startedSelectionKeyRef.current =
      null;

    onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            requestClose();
          }
        }}
      >
        <DialogContent
          showCloseButton
          style={{
            width: "min(1280px, 96vw)",
            maxWidth: "96vw",
            height: "min(900px, 94vh)",
            maxHeight: "94vh",
          }}
          className="flex flex-col gap-0 overflow-hidden p-0"
        >
          <KnowledgeImportModalHeader
            context={context}
          />

          <KnowledgeImportModalProgress
            currentStep={
              isWaitingToStart
                ? "analyzing"
                : knowledgeImport.step
            }
          />

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {isWaitingToStart ? (
              <KnowledgeImportProcessingStep
                phase="uploading"
                files={
                  knowledgeImport.fileProgress
                }
                summary={{
                  totalFiles:
                    selectedFiles?.length ??
                    0,
                  completedFiles: 0,
                  duplicateFiles: 0,
                  failedFiles: 0,
                  processedFiles: 0,
                  pendingFiles:
                    selectedFiles?.length ??
                    0,
                  progressPercentage: 0,
                  currentFileName: null,
                }}
              />
            ) : null}

            {knowledgeImport.duplicateNotice ? (
              <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                {knowledgeImport.duplicateNotice}
              </p>
            ) : null}
            {!isWaitingToStart &&
            knowledgeImport.step ===
              "upload" &&
            knowledgeImport.importReview ? (
              <KnowledgeImportReview
                review={
                  knowledgeImport.importReview
                }
              />
            ) : null}

            {!isWaitingToStart &&
            knowledgeImport.step ===
              "upload" &&
            !knowledgeImport.importReview ? (
              <KnowledgeImportUploadStep
                files={
                  knowledgeImport.files
                }
                isAnalyzing={
                  knowledgeImport.isAnalyzing
                }
                error={
                  knowledgeImport.error
                }
                onFilesChange={
                  knowledgeImport.handleFilesChange
                }
              />
            ) : null}

            {!isWaitingToStart && knowledgeImport.step !== "upload" ? (
              <section className="space-y-3" aria-live="polite">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">
                    {knowledgeImport.step === "completed" ? "Resultado de la importación" : "Procesando documentos"}
                  </h3>
                  <span className="text-xs text-slate-500">
                    {knowledgeImport.step === "completed" ? "Finalizado" :
                      knowledgeImport.isConfirming ? "Guardando e importando en Engine" :
                      knowledgeImport.proposalProgress?.message ??
                      (knowledgeImport.processingPhase === "extracting" ? "Extrayendo texto" : "Analizando")}
                  </span>
                </div>
                {(knowledgeImport.fileProgress.length ? knowledgeImport.fileProgress :
                  knowledgeImport.files.map((file, index) => ({ id: String(index), name: file.name, status: "pending" }))).map(file => {
                  const engine = knowledgeImport.completionResult?.log.engineImports?.find(item =>
                    item.fileName === file.name);
                  const stored = knowledgeImport.completionResult?.log.documents.find(item => item.fileName === file.name);
                  return (
                    <div key={file.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{file.name}</span>
                        {knowledgeImport.tableDetection[file.id] !== undefined ? (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
                            {knowledgeImport.tableDetection[file.id] ? "Tablas detectadas" : "Sin tablas"}
                          </span>
                        ) : null}
                        <span className="text-xs text-slate-500">
                          {engine?.status === "error" ? "Error en Engine" :
                           engine ? "Engine procesado" :
                           stored ? "Documento guardado" :
                           knowledgeImport.step === "completed" ? "Finalizado" : "En proceso"}
                        </span>
                      </div>
                      <details className="mt-3 border-t border-slate-100 pt-2">
                        <summary className="cursor-pointer text-xs font-medium text-slate-700">Ver proceso y resultados</summary>
                        <ol className="mt-3 space-y-2 text-xs text-slate-600">
                          <li>1. Documento recibido {knowledgeImport.step !== "upload" ? "✓" : "·"}</li>
                          <li>2. Extracción y análisis {knowledgeImport.processingPhase === "uploading" ? "·" : "✓"}</li>
                          <li>3. Clasificación y destino {knowledgeImport.proposal ? "✓" : knowledgeImport.proposalProgress?.message ?? "Pendiente"}</li>
                          <li>4. Persistencia y Engine {engine ? engine.status : stored ? "Documento guardado" : knowledgeImport.isConfirming ? "En proceso" : "Pendiente"}</li>
                          {engine?.stages?.map((stage, index) => (
                            <li key={index} className="ml-4">
                              {stage.stage} · {(stage.durationMs / 1000).toFixed(1)} s · {Object.entries(stage.details).map(([key, value]) => `${key}: ${value}`).join(" · ")}
                            </li>
                          ))}
                          {engine?.error ? <li className="text-amber-700">{engine.error}</li> : null}
                        </ol>
                      </details>
                    </div>
                  );
                })}
                {knowledgeImport.error ? <p role="alert" className="text-sm text-red-700">{knowledgeImport.error}</p> : null}
              </section>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end border-t border-slate-100 px-6 py-4">
            {knowledgeImport.step === "completed" || knowledgeImport.allFilesDuplicate ? (
              <button type="button" onClick={requestClose} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Finalizar</button>
            ) : (
              <button type="button" onClick={requestClose} className="rounded-lg border border-slate-200 px-5 py-2 text-sm text-slate-700">Cerrar</button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <KnowledgeImportCloseGuard
        open={closeGuardOpen}
        onOpenChange={
          handleCloseGuardOpenChange
        }
        onConfirmClose={
          confirmCloseWithoutSaving
        }
        isConfirming={
          isCancellingClose
        }
        error={
          closeGuardError
        }
      />
    </>
  );
}
