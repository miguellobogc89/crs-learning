
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
import { KnowledgeImportModalFooter } from "./knowledge-import-modal-footer";
import { EnginePreviewPanel, type EnginePreviewSnapshot } from "./engine-preview-panel";
import { ImportSummary } from "./import-summary";
import { importSummary } from "@/lib/engine/knowledge-preview/reports";
import { KnowledgeImportUploadStep } from "./knowledge-import-upload-step";
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
  const automaticProposalRef = useRef<string | null>(null);
  const [engineBusy, setEngineBusy] = useState(true);
  const [engineSnapshot,setEngineSnapshot]=useState<EnginePreviewSnapshot|null>(null);

  const knowledgeImport =
    useKnowledgeImport({
      context: context!,
      onCompleted,
      resumeImportId,
    });


  const selectionKey = getFilesSelectionKey(knowledgeImport.files);

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

  const { importId, step, isAnalyzing, error, canContinue, continueWithValidDocuments,
    handleFilesChange, importReview, analyzeDocuments } = knowledgeImport;
  const fileCount = knowledgeImport.files.length;
  const failedFiles = knowledgeImport.progressSummary.failedFiles;

  useEffect(() => {
    if (!open) {
      return;
    }

    if (
      !selectedFiles?.length ||
      consumedSelectionRef.current === selectedFiles ||
      fileCount > 0
    ) {
      return;
    }

    // Resetting the hook during cancellation must not reload the old selection.
    consumedSelectionRef.current = selectedFiles;
    handleFilesChange(
      selectedFiles,
    );
  }, [
    open,
    selectedFiles,
    fileCount,
    handleFilesChange,
  ]);

  useEffect(() => {
    if (!open || !importId || step !== "analyzing" ||
        isAnalyzing || error || !canContinue ||
        failedFiles > 0 ||
        automaticProposalRef.current === importId) return;
    const timer = setTimeout(() => {
      automaticProposalRef.current = importId;
      void continueWithValidDocuments();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, importId, step, isAnalyzing,
    error, canContinue, failedFiles,
    continueWithValidDocuments]);

  useEffect(() => {
    if (
      !open ||
      !selectionKey ||
      importReview ||
      step !== "upload" ||
      fileCount === 0 ||
      startedSelectionKeyRef.current ===
        selectionKey
    ) {
      return;
    }

    startedSelectionKeyRef.current =
      selectionKey;

    void analyzeDocuments();
  }, [
    open,
    selectionKey,
    importReview,
    step,
    fileCount,
    analyzeDocuments,
  ]);

  if (!context) {
    return null;
  }

  const activeEngineSnapshot = (knowledgeImport.step === "proposal" || knowledgeImport.step === "completed") &&
    engineSnapshot?.importId === knowledgeImport.importId ? engineSnapshot : null;

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
            width: "calc(100vw - 24px)",
            maxWidth: "1800px",
            height: "calc(100dvh - 24px)",
            maxHeight: "calc(100dvh - 24px)",
          }}
          className="flex flex-col gap-0 overflow-hidden p-0"
        >
          <KnowledgeImportModalHeader
            context={context}
          />

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:px-6 sm:py-4">
            {!isWaitingToStart && knowledgeImport.step === "upload" ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {knowledgeImport.duplicateNotice ? <p role="status" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{knowledgeImport.duplicateNotice}</p> : null}
                {knowledgeImport.importReview ? <KnowledgeImportReview review={knowledgeImport.importReview}/> :
                  <KnowledgeImportUploadStep files={knowledgeImport.files} isAnalyzing={knowledgeImport.isAnalyzing} error={knowledgeImport.error} onFilesChange={knowledgeImport.handleFilesChange}/>}
              </div>
            ) : <ImportSummary text={importSummary({
                inventory:knowledgeImport.globalMap,
                proposal:knowledgeImport.proposal,
                completion:knowledgeImport.completionResult,
                files:knowledgeImport.fileProgress.length ? knowledgeImport.fileProgress : (selectedFiles??[]).map(file=>({name:file.name,status:"Pendiente"})),
                message:knowledgeImport.isConfirming ? "Guardando en Knowledge…" : knowledgeImport.step === "completed" ? "Importación finalizada." : knowledgeImport.proposalProgress?.message,
                error:knowledgeImport.error,
                notice:knowledgeImport.duplicateNotice,
                preview:activeEngineSnapshot?.preview,
                engineMessage:activeEngineSnapshot?.message,
                engineError:activeEngineSnapshot?.error,
                engineSeconds:activeEngineSnapshot?.seconds,
              })}/>}
            {knowledgeImport.step === "proposal" && knowledgeImport.proposal && knowledgeImport.importId ?
              <EnginePreviewPanel key={knowledgeImport.importId} importId={knowledgeImport.importId} onBusyChange={setEngineBusy} onSnapshotChange={setEngineSnapshot}/> : null}
          </div>

          {!isWaitingToStart ? (
            <KnowledgeImportModalFooter
              allFilesDuplicate={knowledgeImport.allFilesDuplicate}
              step={
                knowledgeImport.step
              }
              fileCount={
                knowledgeImport
                  .progressSummary
                  .totalFiles ||
                knowledgeImport.files.length
              }
              validFileCount={
                knowledgeImport
                  .progressSummary
                  .completedFiles
              }
              duplicateFileCount={
                duplicateFileCount
              }
              failedFileCount={
                knowledgeImport
                  .progressSummary
                  .failedFiles
              }
              isAnalyzing={
                knowledgeImport.isAnalyzing
              }
              isConfirming={
                knowledgeImport.isConfirming
              }
              canConfirm={!engineBusy}

              canContinue={
                knowledgeImport.canContinue
              }
              canContinueInBackground={
                knowledgeImport.canContinueInBackground
              }
              onCancel={
                requestClose
              }
              onBack={
                knowledgeImport.goBackToUpload
              }
              onAnalyze={
                knowledgeImport.analyzeDocuments
              }
              onContinueAnalysis={
                knowledgeImport.continueWithValidDocuments
              }
              onContinueInBackground={() => {
                const started =
                  knowledgeImport.continueInBackground();

                if (!started) {
                  return;
                }

                startedSelectionKeyRef.current =
                  null;

                onOpenChange(false);
              }}
              onConfirm={
                knowledgeImport.confirmProposal
              }
              onClose={() => {
                knowledgeImport.finishActiveImport();

                startedSelectionKeyRef.current =
                  null;

                onOpenChange(false);
              }}
            />
          ) : null}
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
