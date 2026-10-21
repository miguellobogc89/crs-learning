
// components/knowledge/import/modal/knowledge-import-modal.tsx

"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { AlertCircle, Check, ChevronDown, Circle, FileText, Loader2, ScrollText } from "lucide-react";

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
                  const engine = knowledgeImport.completionResult?.log.engineImports?.find(item => item.fileName === file.name);
                  const stored = knowledgeImport.completionResult?.log.documents.find(item => item.fileName === file.name);
                  const completed = knowledgeImport.step === "completed";
                  const proposalReady = Boolean(knowledgeImport.proposal) || knowledgeImport.isConfirming || completed;
                  const extracting = knowledgeImport.processingPhase === "extracting";
                  const stages: Array<{ title: string; state: "done" | "active" | "waiting" | "error"; detail: string }> = [
                    { title: "Documento recibido", state: "done", detail: "Archivo recibido por el servidor" },
                    { title: "Extracción de texto", state: extracting ? "active" : proposalReady || knowledgeImport.processingPhase !== "uploading" ? "done" : "active",
                      detail: extracting ? "Extrayendo contenido del archivo" : proposalReady ? "Extracción finalizada" : "Preparando la extracción" },
                    { title: "Clasificación y destino",
                      state: proposalReady ? "done" : extracting ? "waiting" : "active",
                      detail: proposalReady ? "Clasificación realizada" :
                        knowledgeImport.proposalProgress?.message ?? "Analizando el contenido" },
                    { title: "Persistencia y Engine",
                      state: engine?.status === "error" ? "error" : completed ? "done" :
                        knowledgeImport.isConfirming ? "active" : "waiting",
                      detail: engine?.status === "error" ? "El procesamiento de Engine ha fallado" :
                        engine ? `Engine: ${engine.recordsCreated} registros creados · ${engine.recordsReused} reutilizados` :
                        stored ? "Documento conservado" :
                        knowledgeImport.isConfirming ? "Guardando y ejecutando Engine" : "Pendiente" },
                  ];
                  const errorMessages = [engine?.error, completed ? undefined : knowledgeImport.error].filter(
                    (message): message is string => Boolean(message),
                  );
                  return (
                    <article key={file.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <FileText className="size-5" strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {knowledgeImport.tableDetection[file.id] !== undefined ? (
                              <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                {knowledgeImport.tableDetection[file.id] ? "Tablas detectadas" : "Sin tablas"}
                              </span>
                            ) : null}
                            <span className="text-[11px] text-slate-500">
                              {engine?.status === "error" ? "Engine requiere atención" :
                                completed ? "Procesamiento finalizado" : "Procesando"}
                            </span>
                          </div>
                        </div>
                        {engine?.status === "error" ? <AlertCircle className="size-5 text-amber-600" /> :
                          completed ? <Check className="size-5 text-emerald-600" /> :
                          <Loader2 className="size-5 animate-spin text-blue-600" />}
                      </div>
                      <details className="group border-t border-slate-100" open>
                        <summary className="flex cursor-pointer list-none items-center justify-between bg-slate-50/60 px-5 py-3 text-xs font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
                          <span className="flex items-center gap-2"><ScrollText className="size-4 text-slate-500" /> Registro del proceso</span>
                          <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="px-5 py-4">
                          <ol className="space-y-4">
                            {stages.map((stage, index) => (
                              <li key={stage.title} className="flex items-start gap-3">
                                <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                                  stage.state === "done" ? "bg-emerald-50 text-emerald-600" :
                                  stage.state === "error" ? "bg-amber-50 text-amber-600" :
                                  stage.state === "active" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"
                                }`}>
                                  {stage.state === "done" ? <Check className="size-3.5" strokeWidth={2.5} /> :
                                    stage.state === "error" ? <AlertCircle className="size-3.5" /> :
                                    stage.state === "active" ? <Loader2 className="size-3.5 animate-spin" /> :
                                    <Circle className="size-2.5" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-xs font-semibold ${stage.state === "waiting" ? "text-slate-400" : "text-slate-800"}`}>
                                    {index + 1}. {stage.title}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-500">{stage.detail}</p>
                                </div>
                              </li>
                            ))}
                          </ol>
                          {engine?.stages?.length ? (
                            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
                              <p className="mb-2 text-xs font-semibold text-slate-700">Barridos de Engine</p>
                              {engine.stages.map((stage, index) => (
                                <p key={index} className="py-1 text-[11px] text-slate-600">
                                  {stage.stage} · {(stage.durationMs / 1000).toFixed(1)} s · {Object.entries(stage.details).map(([key, value]) => `${key}: ${value}`).join(" · ")}
                                </p>
                              ))}
                            </div>
                          ) : null}
                          {errorMessages.length ? (
                            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-3" role="alert">
                              <p className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                                <AlertCircle className="size-4" /> Registro de errores
                              </p>
                              {errorMessages.map((message, index) => (
                                <p key={index} className="mt-2 break-words font-mono text-[11px] leading-relaxed text-amber-800">{message}</p>
                              ))}
                              <p className="mt-2 text-[11px] text-amber-700">
                                El documento puede estar guardado aunque Engine no haya terminado.
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    </article>
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
