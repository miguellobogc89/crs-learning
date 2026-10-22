
// components/knowledge/import/modal/knowledge-import-modal.tsx

"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { AlertCircle, Check, ChevronDown, Circle, FileText, FileSpreadsheet, FileArchive, Loader2, ScrollText } from "lucide-react";

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
import { EngineConflictReview, type Decision } from "./engine-conflict-review";
import { EngineIdentityReview, type IdentityAnswer } from "./engine-identity-review";
import { suggestIdentityQuestions } from "@/lib/engine/ingestion/suggest-identity-questions";

import type {
  KnowledgeImportModalProps,
} from "./knowledge-import-modal.types";

import type {
  KnowledgeImportReviewFile,
  KnowledgeImportReviewResult,
} from "../knowledge-import-review";
import { getKnowledgeImportReviewMessage, isAllDuplicateReview } from "../knowledge-import-review";

function ImportFileProgress({ completed, active }: { completed: number; active: boolean }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = Math.round(completed / 8 * 100);
    setDisplay(value => Math.max(value, target));
  }, [completed]);
  useEffect(() => {
    if (!active || completed >= 8) return;
    const timer = window.setInterval(() => {
      setDisplay(value => Math.min(value + 1, Math.min(99, Math.floor((completed + 1) / 8 * 100) - 1)));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [active, completed]);
  const percentage = completed === 8 ? 100 : display;
  return (
    <div className="mx-5 mb-3">
      <style>{`@keyframes crs-bar-flash { from { transform: translateX(-130%); } to { transform: translateX(650%); } }`}</style>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-500">Progreso del análisis</span>
        <span className="text-sm font-extrabold tabular-nums text-black">{percentage}%</span>
      </div>
      <div className="h-3.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Progreso visual del análisis" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
        <div className="relative h-full overflow-hidden rounded-full bg-[#0A58FF] transition-[width] duration-700" style={{ width: `${percentage}%` }}>
          {active && percentage > 0 ? <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/80 to-transparent" style={{ animation: "crs-bar-flash 2s linear infinite" }} /> : null}
        </div>
      </div>
    </div>
  );
}

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
  const [conflictAnswers, setConflictAnswers] = useState<Record<string, Record<string, Decision>>>({});
  const [identityAnswers, setIdentityAnswers] = useState<Record<string, Record<string, IdentityAnswer>>>({});
  const [reviewFileIndex, setReviewFileIndex] = useState(0);
  const [approvedLargeSelection, setApprovedLargeSelection] = useState<string | null>(null);

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

  const selectionKey = getFilesSelectionKey(knowledgeImport.files);
  const largeFiles = knowledgeImport.files.filter(file =>
    /\.pdf$/i.test(file.name) && file.size >= 1024 * 1024 ||
    file.size >= 10 * 1024 * 1024);
  const needsLargeFileApproval = largeFiles.length > 0 && approvedLargeSelection !== selectionKey;

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
      needsLargeFileApproval ||
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
    needsLargeFileApproval,
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

  const currentFiles = knowledgeImport.fileProgress.length
    ? knowledgeImport.fileProgress
    : knowledgeImport.files.map((file, index) => ({ id: String(index), name: file.name, status: "pending" }));
  const actionable = currentFiles.filter(file => {
    const preview = knowledgeImport.recordPreview[file.name];
    return preview?.status === "completed" && Boolean(preview.signature) && !knowledgeImport.engineInsertResult[file.name];
  });
  const currentFile = actionable[reviewFileIndex] ?? actionable[0] ?? null;
  const currentPreview = currentFile ? knowledgeImport.recordPreview[currentFile.name] : null;
  const currentReconciliation = currentPreview?.reconciliation;
  const identityQuestions = currentPreview ? suggestIdentityQuestions({ rows: currentPreview.rows }) : [];
  const currentIdentityAnswers = currentFile ? identityAnswers[currentFile.id] ?? {} : {};
  const identitiesNeedReview = identityQuestions.some(question => !["same", "different"].includes(currentIdentityAnswers[question.id] ?? ""));
  const currentAnswers = currentFile ? conflictAnswers[currentFile.id] ?? {} : {};
  const reviewRows = currentReconciliation?.rows.filter(row => row.action === "review" || row.action === "extend") ?? [];
  const needsReview = reviewRows.length > 0;
  const identityReviewComplete = !identitiesNeedReview;
  const nextReviewAvailable = actionable.length > 1 && reviewFileIndex < actionable.length - 1;
  const readyToInsert = Boolean(currentFile && currentPreview && !identitiesNeedReview &&
    (currentPreview.manifestIssues?.length ?? 0) === 0 &&
    currentPreview.unresolvedLinks.length === 0 &&
    currentPreview.rows.every(row => row.disposition === "candidate") &&
    (!currentReconciliation || currentReconciliation.ready ||
      (needsReview && currentReconciliation.entities.every(item => item.action === "reuse") &&
        currentReconciliation.relations.every(item => item.action === "reuse") &&
        reviewRows.every(row => ["keep", "incoming", "omit"].includes(currentAnswers[row.localId]?.kind ?? "")) &&
        currentReconciliation.blockers.every(blocker =>
          blocker.startsWith("Valores contradictorios:") ||
          blocker.startsWith("Actualización de registro pendiente de aprobación:") ||
          blocker.startsWith("Vínculo pendiente:")))));
  async function confirmEngineInsert() {
    if (!currentFile || !readyToInsert) return;
    const changes = Object.values(currentAnswers);
    const message = `Vas a guardar los datos en Engine.\n\n${changes.filter(item => item.kind === "keep").length} mantener · ${changes.filter(item => item.kind === "incoming").length} actualizar · ${changes.filter(item => item.kind === "omit").length} omitir.\n\n¿Confirmas?`;
    if (!window.confirm(message)) return;
    try { await knowledgeImport.insertIntoEngine(currentFile.name, currentAnswers, currentIdentityAnswers); }
    catch (error) { window.alert(error instanceof Error ? error.message : String(error)); }
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

            {!isWaitingToStart && knowledgeImport.step === "upload" && needsLargeFileApproval && !knowledgeImport.importReview ? (
              <section role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-slate-800">
                <p className="font-semibold text-amber-900">Este documento podría requerir un análisis largo</p>
                <p className="mt-2">Hemos detectado {largeFiles.length} archivo(s) de tamaño considerable. CRS limita la extracción de registros por simulación para evitar esperas y resultados incompletos.</p>
                <p className="mt-2">Para obtener resultados más ágiles y completos, recomendamos dividir los PDF extensos en bloques de unas 20–30 páginas y procesarlos por separado.</p>
                <p className="mt-2 text-xs text-amber-800">Esta comprobación se basa en el tamaño del archivo, no en el número de páginas. Puedes continuar, pero el análisis podría detenerse si supera el límite de registros.</p>
                <button type="button" onClick={() => setApprovedLargeSelection(selectionKey)}
                  className="mt-4 rounded-lg bg-[#0A58FF] px-4 py-2 text-sm font-semibold text-white">Analizar de todas formas</button>
              </section>
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
                  const preview = knowledgeImport.recordPreview[file.name];
                  const simulation = knowledgeImport.simulationStages[file.name] ?? {};
                   const reconciliation = preview?.reconciliation;
                   const identityDiscovery = preview?.identityDiscovery;
                   const decisions = new Map(reconciliation?.rows.map(row => [row.localId, row]) ?? []);
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
                    ...([
                      ["Extraer registros", 5, "Extraer candidatos a partir de las estructuras descubiertas"],
                      ["Resolver referencias", 6, "Vincular registros mediante relaciones identificadas"],
                      ["Validar resultados", 7, "Verificar esquema, registros y evidencia"],
                      ["Generar simulación", 8, "Preparar manifiesto sin ejecutar INSERT ni UPSERT"],
                    ] as const).map(([title, number, pending]) => {
                      const result = simulation[number];
                      const priorDone = number === 5 ? relations?.status === "completed" :
                        simulation[number - 1]?.status === "completed";
                      return {
                        title,
                        state: result?.status === "error" ? "error" as const :
                          result?.status === "completed" ? "done" as const :
                          priorDone ? "active" as const : "waiting" as const,
                        detail: result?.status === "error" ? result.error ?? "Error de fase" :
                          result?.status === "completed" ?
                            number === 8 && preview?.status === "completed"
                              ? `${preview.rows.length} candidatos · ${preview.links.length} vínculos · ${reconciliation ? `${reconciliation.totals.reuse} reutilizaciones · ${reconciliation.totals.create} creaciones · ${reconciliation.totals.review} revisiones (incluye esquemas y vínculos)` : "sin reconciliación"} · ${preview.issues.length} incidencias`
                              : `${result.count} elementos · ${(result.durationMs / 1000).toFixed(1)} s`
                            : pending,
                      };
                    }),
                  ];
                  const errorMessages = [recognized?.error, semantic?.error, relations?.error, preview?.error, knowledgeImport.error].filter(
                    (message): message is string => Boolean(message),
                  );
                  return (
                    <article key={file.id} className="overflow-hidden rounded-2xl bg-white">
                      <div className={reconciliation && !reconciliation.ready ? "hidden" : "flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5"}>
                        <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${/\.pdf$/i.test(file.name) ? "bg-rose-50 text-rose-600" : /\.(xlsx?|csv)$/i.test(file.name) ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                          { /\.(xlsx?|csv)$/i.test(file.name) ? <FileSpreadsheet className="size-6" strokeWidth={1.8} /> : /\.(zip|rar)$/i.test(file.name) ? <FileArchive className="size-6" strokeWidth={1.8} /> : <FileText className="size-6" strokeWidth={1.8} /> }
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
                              {recognized?.status === "error" || semantic?.status === "error" || relations?.status === "error" || preview?.status === "error" ? "Revisión con errores" :
                                completed ? "Análisis completado" : "Revisando documento"}
                            </span>
                          </div>
                        </div>
                        {recognized?.status === "error" || semantic?.status === "error" || relations?.status === "error" || preview?.status === "error" ? <AlertCircle className="size-5 text-amber-600" /> :
                          completed && recognized?.status === "completed" ? <Check className="size-5 text-emerald-600" /> :
                          <span className="text-xs font-semibold text-slate-500">{stages.filter(stage => stage.state === "done").length}/8</span>}
                      </div>
                      {!(reconciliation && !reconciliation.ready) ? <ImportFileProgress completed={stages.filter(stage => stage.state === "done").length} active={!completed && !stages.some(stage => stage.state === "error")} /> : null}
                      <details className="group border-t border-slate-100" open={Boolean(reconciliation && !reconciliation.ready)}>
                        <summary className={reconciliation && !reconciliation.ready ? "hidden" : "flex cursor-pointer list-none items-center justify-between bg-slate-50/60 px-5 py-3 text-xs font-semibold text-slate-700 [&::-webkit-details-marker]:hidden"}>
                          <span className="flex items-center gap-2"><ScrollText className="size-4 text-slate-500" /> Registro del proceso</span>
                          <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="px-5 py-4">
                          <details className={reconciliation && !reconciliation.ready ? "hidden" : ""} open={!(reconciliation && !reconciliation.ready)}>
                            <summary className="mb-3 cursor-pointer text-xs font-semibold text-slate-600">8 fases de análisis · {reconciliation && !reconciliation.ready ? "ver detalle" : "detalle"}</summary>
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
                          </details>
                          {preview?.status === "completed" ? (
                            <div className="mt-4 space-y-3">
                              {preview.rows.length && suggestIdentityQuestions({ rows: preview.rows }).length > 0 ? (
                                <EngineIdentityReview
                                  key={file.id}
                                  questions={suggestIdentityQuestions({ rows: preview.rows })}
                                  answers={identityAnswers[file.id] ?? {}}
                                  onAnswersChange={next => setIdentityAnswers(current => ({ ...current, [file.id]: next }))}
                                />
                              ) : null}
                              {reconciliation && !reconciliation.ready ? (
                                <EngineConflictReview
                                  fileId={file.id}
                                  rows={reconciliation.rows}
                                  candidates={preview.rows}
                                  blockers={reconciliation.blockers}
                                  answers={conflictAnswers[file.id] ?? {}}
                                  onAnswersChange={next => setConflictAnswers(current => ({ ...current, [file.id]: next }))}
                                />
                              ) : null}
                              {reconciliation ? (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                                  <p className="font-semibold">Reconciliación con Engine · solo lectura</p>
                                  {identityDiscovery ? (
                                    <div className="mt-2 space-y-1">
                                      {identityDiscovery.proposals.map(item => (
                                        <p key={item.entityKey}>
                                          <span className="font-semibold">{item.entityKey}</span> · {item.keys.join(" + ") || "sin clave"} · {item.status === "validated" ? "validada para simulación" : "revisar"} · {item.reason}
                                        </p>
                                      ))}
                                    </div>
                                  ) : null}
                                  <p className="mt-1">{reconciliation.totals.reuse} reutilizar · {reconciliation.totals.create} crear · {reconciliation.totals.extend} ampliar · {reconciliation.totals.review} revisar (estructuras, registros y vínculos)</p>
                                  <p className="mt-1">{reconciliation.ready ? "Sin bloqueos de reconciliación" : "Pendiente de revisión: " + (reconciliation.blockers.length || reconciliation.totals.review) + " elementos"}</p>
                                  <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                                    {reconciliation.rows.map(row => (
                                      <p key={row.localId} className="break-words">
                                        <span className="font-semibold">{row.action.toUpperCase()}</span> · {row.entityKey} / {row.localId} · {row.reason}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-3">
                              <button type="button"
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => {
                                  const lines = [
                                    "-- CRS Engine | Simulación de INSERT / UPSERT (TXT, NO EJECUTABLE)",
                                    "-- Archivo: " + file.name,
                                    "-- Solo simulación: NO se han creado registros ni relaciones.",
                                    "-- Cobertura: " + preview.analyzedChars + "/" + preview.sourceChars + " caracteres",
                                    "-- Identidades: " + (reconciliation ? "reconciliación conservadora; revisar claves y bloqueos" : "NO VALIDADAS"),
                                    ...(reconciliation ? [
                                      "-- RECONCILIACIÓN CON ENGINE (SIN ESCRITURAS)",
                                      ...((identityDiscovery?.proposals ?? []).map(item => "IDENTITY_PROPOSAL " + JSON.stringify(item))),
                                      "RECONCILIATION_SUMMARY " + JSON.stringify({ ready: reconciliation.ready, totals: reconciliation.totals }),
                                      ...reconciliation.entities.map(item => "SCHEMA_DECISION " + JSON.stringify(item)),
                                      ...reconciliation.relations.map(item => "RELATION_DECISION " + JSON.stringify(item)),
                                      ...reconciliation.rows.map(item => "ROW_DECISION " + JSON.stringify(item)),
                                      ...reconciliation.links.map(item => "LINK_DECISION " + JSON.stringify(item)),
                                      ...reconciliation.blockers.map(item => "-- BLOQUEO: " + item),
                                    ] : []),
                                    "-- Registros: " + preview.rows.length + " | Vínculos: " + (preview.links?.length ?? 0),
                                    "",
                                    "-- ESTRUCTURAS Y CAMPOS (existentes, propuestos o incompatibles)",
                                    ...(preview.entities ?? []).map(entity => "SCHEMA " + JSON.stringify(entity)),
                                    "-- DEFINICIONES DE RELACIONES",
                                    ...(preview.relations ?? []).map(relation => "RELATION " + JSON.stringify(relation)),
                                    "-- Cobertura de registros: " + (preview.partial ? "requiere revisión" : "sin recorte de documento; requiere validar exhaustividad"),
                                    "",
                                    ...preview.rows.flatMap(row => [
                                      "-- " + (decisions.get(row.localId)?.action.toUpperCase() ?? "INSERT CANDIDATO") + " " + row.localId + " | " + row.entityKey,
                                      "ENTITY " + row.entityKey + " " + JSON.stringify(row.values),
                                      "-- Estado: " + row.disposition + " | " + row.reason,
                                      "-- Evidencia: " + row.evidence,
                                      "",
                                    ]),
                                    "-- REFERENCIAS PROPUESTAS",
                                    ...(preview.links ?? []).map(link =>
                                      "LINK " + link.fromLocalId + " -> " + link.toLocalId + " VIA " + link.relationKey +
                                      " | evidencia: " + link.evidence),
                                    "",
                                    "-- REFERENCIAS PENDIENTES",
                                    ...(preview.unresolvedLinks ?? []).map(issue => "-- " + issue),
                                    "-- INCIDENCIAS",
                                    ...preview.issues.map(issue => "-- " + issue),
                                    "",
                                    "-- Este archivo NO es SQL ejecutable. No ejecutar INSERT/UPSERT hasta validar identidades, duplicados y referencias.",
                                  ];
                                  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
                                  const url = URL.createObjectURL(blob);
                                  const link = document.createElement("a");
                                  link.href = url;
                                  link.download = "crs-insert-preview-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_") + ".txt";
                                  document.body.appendChild(link);
                                  link.click();
                                  link.remove();
                                  URL.revokeObjectURL(url);
                                }}>
                                Descargar TXT de simulación
                              </button>
                              {preview.signature && preview.status === "completed" ? (
                                <div className="mt-3 space-y-2">
                                  {knowledgeImport.engineInsertResult[file.name] ? (
                                    <p className="text-xs font-medium text-emerald-700">{knowledgeImport.engineInsertResult[file.name]}</p>
                                  ) : (
                                    <p className="text-[11px] text-slate-500">{reconciliation ? (reconciliation.ready ? "Inserción incremental disponible: se reutilizan los registros existentes y se crean únicamente los nuevos." : "La reconciliación tiene bloqueos; no se puede insertar.") : "Primera inserción en Engine vacío."}</p>
                                  )}
                                </div>
                              ) : null}
                              </div>
                              <p className="text-[11px] text-slate-500">El TXT es solo una simulación. La inserción escribe únicamente tras una confirmación explícita y una validación de Engine.</p>
                            </div>
                          ) : null}
                          {errorMessages.length ? (
                            <div className="mt-3 text-[11px] text-amber-700" role="alert">
                              {errorMessages.join(" · ")}
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

          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 px-6 py-4">
            <button type="button" onClick={requestClose} className="rounded-lg border border-slate-200 px-5 py-2 text-sm text-slate-700">Cancelar</button>
            {knowledgeImport.step === "completed" && !knowledgeImport.allFilesDuplicate && currentFile ? (
              <>
                {actionable.length > 1 ? (
                  <span className="self-center text-xs text-slate-500">Documento {Math.min(reviewFileIndex + 1, actionable.length)} de {actionable.length}</span>
                ) : null}
                {nextReviewAvailable ? (
                  <button type="button" disabled={!identityReviewComplete} onClick={() => setReviewFileIndex(index => index + 1)}
                    className="rounded-lg bg-[#0A58FF] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    Continuar revisión
                  </button>
                ) : readyToInsert ? (
                  <button type="button" disabled={knowledgeImport.engineInsertRunning} onClick={confirmEngineInsert}
                    className="rounded-lg bg-[#0A58FF] px-6 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    {knowledgeImport.engineInsertRunning ? "Guardando..." : "Guardar en Engine"}
                  </button>
                ) : identityReviewComplete ? (
                  <button type="button" onClick={() => window.alert("Revisión completada, pero la inserción sigue bloqueada por validaciones pendientes. Consulta las incidencias de la simulación. No se han guardado datos.")}
                    className="rounded-lg bg-[#0A58FF] px-5 py-2 text-sm font-semibold text-white">
                    Revisar incidencias
                  </button>
                ) : (
                  <button type="button" disabled className="rounded-lg bg-[#0A58FF] px-5 py-2 text-sm font-semibold text-white opacity-40">
                    Responde las preguntas para continuar
                  </button>
                )}
              </>
            ) : knowledgeImport.step === "completed" && !currentFile ? (
              <button type="button" onClick={requestClose} className="rounded-lg bg-[#0A58FF] px-5 py-2 text-sm font-semibold text-white">Finalizar</button>
            ) : null}
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
