
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
                    {knowledgeImport.step === "completed" ? "Revisión finalizada" : "Revisando documentos"}
                  </h3>
                  <span className="text-xs text-slate-500">
                    {knowledgeImport.step === "completed" ? "Prueba terminada · sin importar datos" :
                      knowledgeImport.isConfirming ? "Reconociendo estructura" :
                      knowledgeImport.proposalProgress?.message ??
                      (knowledgeImport.processingPhase === "extracting" ? "Extrayendo texto" : "Analizando")}
                  </span>
                </div>
                {(knowledgeImport.fileProgress.length ? knowledgeImport.fileProgress :
                  knowledgeImport.files.map((file, index) => ({ id: String(index), name: file.name, status: "pending" }))).map(file => {
                  const recognized = knowledgeImport.recognition[file.name];
                  const completed = knowledgeImport.step === "completed";
                  const semantic = knowledgeImport.semantic[file.name];
                  const relations = knowledgeImport.relations[file.name];
                  const extracting = knowledgeImport.processingPhase === "extracting";
                  const stages: Array<{ title: string; state: "done" | "active" | "waiting" | "error"; detail: string }> = [
                    {
                      title: "Revisar y clasificar el documento",
                      state: recognized?.status === "error" ? "error" :
                        recognized ? "done" : completed ? "error" : "active",
                      detail: recognized?.status === "error" ? recognized.error ?? "Extracción no disponible" :
                        recognized ? `Tipo: ${recognized.documentType.toUpperCase()} · ${recognized.structuredLines} líneas estructuradas · ${recognized.narrativeLines} narrativas · ${recognized.sourceChars} caracteres` :
                        extracting ? "Extrayendo y revisando contenido" : "Comprobando el texto y los patrones",
                    },
                    {
                      title: "Buscar estructuras existentes",
                      state: recognized?.status === "completed" ? "done" : "waiting",
                      detail: recognized?.status === "completed"
                        ? `${recognized.existingStructures.length} estructuras activas encontradas en Engine · consulta de solo lectura`
                        : "Consultar las estructuras existentes en Engine",
                    },
                    {
                      title: "Comparar con estructuras existentes",
                      state: semantic?.status === "error" ? "error" : semantic ? "done" :
                        recognized?.status === "completed" ? "active" : "waiting",
                      detail: semantic?.status === "error" ? semantic.error ?? "Error de comparación" :
                        semantic ? `${semantic.matches.length} posibles equivalencias · sin proponer estructuras nuevas` :
                        "Buscando equivalencias con estructuras existentes (operación breve)",
                    },
                    {
                      title: "Identificar relaciones",
                      state: relations?.status === "error" ? "error" :
                        relations?.status === "completed" ? "done" :
                        semantic?.status === "completed" ? "active" : "waiting",
                      detail: relations?.status === "error" ? relations.error ?? "Error identificando relaciones" :
                        relations?.status === "completed" ?
                          `${relations.relations.length} relaciones identificadas · ${relations.missingStructures.length} estructuras propuestas · sin cambios en Engine` :
                        semantic?.status === "completed" ? "Analizando relaciones entre entidades" :
                        "Pendiente: proponer relaciones sin crearlas",
                    },
                  ];
                  const errorMessages = [recognized?.error, semantic?.error, relations?.error, knowledgeImport.error].filter(
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
                              {recognized?.status === "error" || semantic?.status === "error" || relations?.status === "error" ? "Revisión con errores" :
                                completed ? "Prueba finalizada · sin importación" : "Revisando documento"}
                            </span>
                          </div>
                        </div>
                        {recognized?.status === "error" || semantic?.status === "error" || relations?.status === "error" ? <AlertCircle className="size-5 text-amber-600" /> :
                          completed && recognized?.status === "completed" ? <Check className="size-5 text-emerald-600" /> :
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
                          {recognized?.status === "completed" ? (
                            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                              <p className="text-xs font-semibold text-slate-800">Estructuras existentes en Engine</p>
                              <p className="mt-1 text-[11px] text-slate-500">Consulta real del espacio de trabajo. No se ha decidido aún qué estructura corresponde al documento.</p>
                              {recognized.existingStructures.length ? (
                                <div className="mt-3 space-y-2">
                                  {recognized.existingStructures.map(type => (
                                    <details key={type.id} className="rounded-lg border border-slate-100 px-3 py-2">
                                      <summary className="cursor-pointer text-xs font-medium text-slate-700">
                                        {type.name} <span className="font-normal text-slate-400">({type.key}) · {type.fields.length} campos</span>
                                      </summary>
                                      <div className="mt-2 space-y-1">
                                        {type.fields.map(field => (
                                          <p key={field.key} className="text-[11px] text-slate-600">
                                            {field.name} <span className="text-slate-400">· {field.key} · {field.type}</span>
                                          </p>
                                        ))}
                                      </div>
                                    </details>
                                  ))}
                                </div>
                              ) : <p className="mt-2 text-xs text-slate-600">No existen estructuras activas. El siguiente paso deberá proponerlas, sin crearlas automáticamente.</p>}
                            </div>
                          ) : null}
                          {semantic?.status === "completed" ? (
                            <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                              <p className="text-xs font-semibold text-slate-800">Comparación semántica · equivalencias existentes</p>
                              <p className="text-[11px] text-slate-500">La IA propone equivalencias, no las confirma. Ninguna estructura ha sido creada o modificada.</p>
                              <div>
                                <p className="text-xs font-semibold text-emerald-700">Estructuras que podrían reutilizarse ({semantic.matches.length})</p>
                                {semantic.matches.length ? semantic.matches.map((match, index) => (
                                  <p key={index} className="mt-2 text-[11px] text-slate-700">
                                    <strong>{match.concept}</strong> → {match.existingKey} · {match.reason}
                                    <span className="block text-slate-500">Evidencia: {match.evidence}</span>
                                  </p>
                                )) : <p className="mt-1 text-[11px] text-slate-500">Sin equivalencias verificables.</p>}
                              </div>
                              <div className="hidden">
                                <p className="text-xs font-semibold text-slate-800">Posibles estructuras nuevas ({semantic.missing.length})</p>
                                {semantic.missing.length ? semantic.missing.map((item, index) => (
                                  <p key={index} className="mt-2 text-[11px] text-slate-700">
                                    <strong>{item.suggestedName || item.concept}</strong> · {item.reason}
                                    <span className="block text-slate-500">Campos sugeridos: {item.fields.join(", ") || "Por determinar"}</span>
                                    <span className="block text-slate-500">Evidencia: {item.evidence}</span>
                                  </p>
                                )) : <p className="mt-1 text-[11px] text-slate-500">No se han propuesto estructuras nuevas.</p>}
                              </div>
                              {semantic.uncertain.length ? (
                                <p className="text-[11px] text-amber-700">Por revisar: {semantic.uncertain.join(" · ")}</p>
                              ) : null}
                            </div>
                          ) : null}
                          {relations?.status === "completed" ? (
                            <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                              <p className="text-xs font-semibold text-slate-800">Relaciones identificadas ({relations.relations.length})</p>
                              <p className="text-[11px] text-slate-500">Hipótesis basadas en el documento. No se ha creado ninguna relación ni estructura.</p>
                              {relations.relations.length ? relations.relations.map((relation, index) => (
                                <div key={index} className="text-[11px] text-slate-700">
                                  <strong>{relation.fromConcept} → {relation.toConcept}</strong>
                                  <span className="text-slate-500"> · {relation.cardinality}</span>
                                  <p>{relation.reason}</p>
                                  {relation.existingRelationKey ? <p className="text-emerald-700">Relación existente: {relation.existingRelationKey}</p> : null}
                                  <p className="text-slate-500">Evidencia: {relation.evidence}</p>
                                </div>
                              )) : <p className="text-[11px] text-slate-500">No se identificaron relaciones verificables.</p>}
                              <p className="text-xs font-semibold text-slate-800">Estructuras potencialmente necesarias ({relations.missingStructures.length})</p>
                              {relations.missingStructures.map((item, index) => (
                                <p key={index} className="text-[11px] text-slate-700">
                                  <strong>{item.name}</strong> · {item.reason}
                                  <span className="block text-slate-500">Evidencia: {item.evidence}</span>
                                </p>
                              ))}
                              {relations.uncertain.length ? <p className="text-[11px] text-amber-700">Por revisar: {relations.uncertain.join(" · ")}</p> : null}
                            </div>
                          ) : null}
                          {recognized?.status === "completed" ? (
                            <div className="mt-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                              <p className="text-xs font-semibold text-slate-700">Evidencias de clasificación</p>
                              <p className="text-[11px] text-slate-500">Muestras literales del texto extraído. Son candidatos, no datos validados.</p>
                              <div>
                                <p className="text-[11px] font-semibold text-slate-700">Posibles secciones</p>
                                {recognized.sectionExamples.length ? recognized.sectionExamples.map(item => (
                                  <p key={item.line} className="mt-1 text-[11px] text-slate-600">Línea {item.line}: {item.text}</p>
                                )) : <p className="text-[11px] text-slate-500">No se identificaron con suficiente evidencia.</p>}
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold text-slate-700">Líneas con cantidades</p>
                                {recognized.quantityExamples.map((line, index) => (
                                  <p key={index} className="mt-1 break-words text-[11px] text-slate-600">{line}</p>
                                ))}
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold text-slate-700">Candidatos a conceptos (fase 2 preliminar)</p>
                                <p className="mt-1 text-[11px] text-slate-600">
                                  {recognized.conceptCandidates.length ? recognized.conceptCandidates.join(" · ") : "Sin candidatos suficientemente claros"}
                                </p>
                              </div>
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
                                Prueba aislada: no se han creado artículos, tablas ni registros de Engine.
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
