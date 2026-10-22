
// components/knowledge/import/hooks/use-knowledge-import.ts

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { InsertPlan } from "@/lib/engine/ingestion/validate-insert-plan";

import {
  useBackgroundImports,
} from "@/components/knowledge/import/background/use-background-imports";

import type {
  ConfirmKnowledgeImportResult,
  KnowledgeImportProposal,
} from "@/lib/knowledge/import/types";

import {
  createEmptyImportSummary,
  createFilesFromAnalysisSnapshot,
  createInitialImportFiles,
  createInitialImportSummary,
  createSummaryFromAnalysisSnapshot,
  finalizeImportAnalysis,
  finalizeImportFiles,
  markFilesUploaded,
  markFilesUploading,
} from "@/components/knowledge/import/utils/progress";

import {
  deduplicateBrowserFiles,
  getBrowserFileRelativePath,
  getBrowserImportMode,
} from "@/components/knowledge/import/utils/file-selection";

import type {
  KnowledgeImportFlowFile,
  KnowledgeImportFlowSummary,
} from "@/components/knowledge/import/types/import-flow.types";

import type {
  KnowledgeImportContext,
  KnowledgeImportModalStep,
} from "../modal/knowledge-import-modal.types";

import type {
  KnowledgeImportProcessingPhase,
} from "../modal/knowledge-import-processing.types";

import {
  runKnowledgeImportAnalysis,
  uploadKnowledgeImport,
  type KnowledgeImportProposalProgress,
  type KnowledgeImportUploadResult,
} from "../knowledge-import-api";

import {
  KnowledgeImportReviewRequiredError,
  isAllDuplicateReview,
  type KnowledgeImportReviewResult,
} from "../knowledge-import-review";

import {
  createSelectedDocuments,
  type SelectedKnowledgeDocument,
} from "../../services/create-selected-documents";

type UseKnowledgeImportParams = {
  context: KnowledgeImportContext;
  resumeImportId?: string;
  onCompleted?: (
    result: ConfirmKnowledgeImportResult,
  ) => void;
};

export function useKnowledgeImport({
  context,
  onCompleted,
  resumeImportId,
}: UseKnowledgeImportParams) {
  const {
    registerImport,
    updateImport,
    tasks,
    getImportState,
    continueWithValidDocuments:
      continueSharedImport,
    confirmProposal:
      confirmSharedProposal,
    continueInBackground:
      continueSharedInBackground,
    cancelImport,
    finishImport,
  } = useBackgroundImports();

  const [step, setStep] =
    useState<KnowledgeImportModalStep>(
      "upload",
    );

  const [
    selectedDocuments,
    setSelectedDocuments,
  ] = useState<
    SelectedKnowledgeDocument[]
  >([]);

  const [localImportId, setImportId] =
    useState<string | null>(null);
  const importId = localImportId ?? resumeImportId ?? null;

  const [proposal, setProposal] =
    useState<KnowledgeImportProposal | null>(
      null,
    );

  const [
    completionResult,
    setCompletionResult,
  ] =
    useState<ConfirmKnowledgeImportResult | null>(
      null,
    );

  const [tableDetection, setTableDetection] = useState<Record<string, boolean>>({});
  const [globalMap, setGlobalMap] = useState<Record<string, unknown> | null>(null);
  const [recognition, setRecognition] = useState<Record<string, {
    status: "completed" | "error";
    sourceChars: number;
    lines: number;
    delimitedLines: number;
    numericLines: number;
    headings: number;
    documentType: "texto" | "tabla" | "hibrido" | "indeterminado";
    confidence: "high" | "low";
    structuredLines: number;
    narrativeLines: number;
    extractionStatus: string;
    extractionProcessingStatus: string;
    sectionExamples: Array<{ line: number; text: string }>;
    quantityExamples: string[];
    delimitedExamples: string[];
    conceptCandidates: string[];
    existingStructures: Array<{
      id: string; key: string; name: string; description: string | null;
      fields: Array<{ key: string; name: string; type: string }>;
    }>;
    error: string | null;
  }>>({});



  const [semantic, setSemantic] = useState<Record<string, {
    status: "completed" | "error";
    matches: Array<{ concept: string; existingKey: string; reason: string; evidence: string }>;
    missing: Array<{ concept: string; suggestedName: string; fields: string[]; reason: string; evidence: string }>;
    uncertain: string[];
    error: string | null;
  }>>({});
  const [semanticRunning, setSemanticRunning] = useState(false);
  const [relations, setRelations] = useState<Record<string, {
    status: "completed" | "error";
    relations: Array<{ fromConcept: string; toConcept: string; cardinality: string; existingRelationKey: string; reason: string; evidence: string }>;
    missingStructures: Array<{ name: string; reason: string; evidence: string }>;
    uncertain: string[];
    error: string | null;
  }>>({});
  const [relationsRunning, setRelationsRunning] = useState(false);
  const [recordPreview, setRecordPreview] = useState<Record<string, {
    status: "completed" | "error"; id?: string; signature?: string; manifestIssues?: string[];
    rows: Array<{ localId: string; entityKey: string;
      values: Record<string, string | number | boolean | null>;
      evidence: string; disposition: "candidate" | "pending"; reason: string }>;
    links: Array<{ fromLocalId: string; toLocalId: string; relationKey: string; evidence: string }>;
    entities?: unknown[]; relations?: unknown[];
    identityDiscovery?: { proposals: Array<{ entityKey: string; keys: string[]; status: "validated" | "review"; reason: string }> } | null;
    reconciliation?: { writesPerformed: false; ready: boolean; blockers: string[];
      entities: Array<{ key: string; action: string; reason: string }>;
      relations: Array<{ key: string; action: string; reason: string }>;
      rows: Array<{ localId: string; entityKey: string; action: string; existingId?: string; reason: string }>;
      links: Array<{ fromLocalId: string; toLocalId: string; relationKey: string; action: string; reason: string }>;
      totals: { reuse: number; create: number; extend: number; review: number } } | null;
    unresolvedLinks: string[];
    issues: string[]; sourceChars: number; analyzedChars: number;
    partial: boolean; durationMs: number; error: string | null;
  }>>({});
  const [recordPreviewRunning, setRecordPreviewRunning] = useState(false);
  const [engineInsertRunning, setEngineInsertRunning] = useState(false);
  const [engineInsertResult, setEngineInsertResult] = useState<Record<string, string>>({});
  const [simulationStages, setSimulationStages] = useState<Record<string, Record<number, {
    status: "completed" | "error"; count: number; durationMs: number; error: string | null;
  }>>>({});


  const [error, setError] =
    useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  const [
    importReview,
    setImportReview,
  ] =
    useState<KnowledgeImportReviewResult | null>(
      null,
    );

  const [
    isAnalyzing,
    setIsAnalyzing,
  ] = useState(false);

  const [
    isConfirming,
    setIsConfirming,
  ] = useState(false);

  const [
    processingPhase,
    setProcessingPhase,
  ] =
    useState<KnowledgeImportProcessingPhase>(
      "uploading",
    );

  const [
    fileProgress,
    setFileProgress,
  ] = useState<
    KnowledgeImportFlowFile[]
  >([]);

  const [
    proposalProgress,
    setProposalProgress,
  ] =
    useState<KnowledgeImportProposalProgress | null>(
      null,
    );

  const [
    progressSummary,
    setProgressSummary,
  ] =
    useState<KnowledgeImportFlowSummary>(
      createEmptyImportSummary(),
    );

  const latestFileProgressRef =
    useRef<KnowledgeImportFlowFile[]>(
      [],
    );

  const activeOperationRef =
    useRef(0);
  const analysisInFlightRef = useRef<number | null>(null);
  const uploadedSelectionRef = useRef<{
    documents: SelectedKnowledgeDocument[];
    result: KnowledgeImportUploadResult;
  } | null>(null);

  const files = useMemo(
    () =>
      selectedDocuments.map(
        (document) => document.file,
      ),
    [selectedDocuments],
  );

  const sharedTask =
    tasks.find((task) => task.importId === importId) ?? null;

  const sharedState =
    sharedTask
      ? getImportState(
          sharedTask.importId,
        )
      : null;

  const visibleStep =
    sharedTask?.step ?? step;

  const visiblePhase =
    sharedTask?.phase ??
    processingPhase;

  const visibleFileProgress =
    sharedTask?.files ??
    fileProgress;

  const visibleProgressSummary =
    sharedTask?.summary ??
    progressSummary;

  const visibleProposal =
    sharedTask?.proposal ??
    proposal;

  const visibleProposalProgress =
    sharedTask?.proposalProgress ??
    proposalProgress;

  const visibleCompletionResult =
    sharedTask?.completionResult ??
    completionResult;

  const visibleError =
    sharedTask?.error ?? error;

  const visibleIsAnalyzing =
    sharedTask?.isAnalyzing ??
    isAnalyzing;

  const visibleIsConfirming =
    sharedTask?.isConfirming ??
    isConfirming;

  useEffect(() => {
    latestFileProgressRef.current =
      visibleFileProgress;
  }, [
    visibleFileProgress,
  ]);

  const canContinueInBackground =
    sharedState?.canContinueInBackground ??
    Boolean(
      importId ??
        sharedTask?.importId,
    );

  const hasUnsavedProgress =
    selectedDocuments.length > 0 ||
    visibleProposal !== null ||
    visibleStep !== "upload";

  const handleFilesChange =
    useCallback(
      (nextFiles: File[]) => {
        uploadedSelectionRef.current = null;
        setError(null);
        setImportReview(null);
        setDuplicateNotice(null);

        const {
          uniqueFiles,
          duplicateFiles,
        } =
          deduplicateBrowserFiles(
            nextFiles,
          );

        if (
          duplicateFiles.length > 0
        ) {
          const duplicateNames =
            Array.from(
              new Set(
                duplicateFiles.map(
                  (file) => file.name,
                ),
              ),
            );

          toast.warning(
            duplicateFiles.length === 1
              ? "Archivo duplicado"
              : `${duplicateFiles.length} archivos duplicados`,
            {
              description:
                duplicateNames.length ===
                1
                  ? `"${duplicateNames[0]}" ya estaba seleccionado y no se ha vuelto a añadir.`
                  : "Los archivos repetidos ya estaban seleccionados y no se han vuelto a añadir.",
            },
          );
        }

        setSelectedDocuments(
          (currentDocuments) =>
            createSelectedDocuments(
              uniqueFiles,
              currentDocuments,
            ),
        );
      },
      [],
    );

  const analyzeDocuments =
    useCallback(async () => {
      if (analysisInFlightRef.current || isAllDuplicateReview(importReview)) {
        return;
      }
      if (
        selectedDocuments.length === 0
      ) {
        setError(
          "Selecciona al menos un documento",
        );
        return;
      }

      const operationId =
        activeOperationRef.current + 1;
      analysisInFlightRef.current = operationId;

      activeOperationRef.current =
        operationId;

      const isCurrentOperation = () =>
        activeOperationRef.current ===
        operationId;

      setIsAnalyzing(true);
      setError(null);
      setImportReview(null);
      setStep("analyzing");

      setProcessingPhase(
        "uploading",
      );

      setProgressSummary(
        createInitialImportSummary(
          selectedDocuments.length,
        ),
      );

      setFileProgress(
        createInitialImportFiles(
          selectedDocuments,
        ),
      );

      let activeImportId:
        | string
        | null = null;

      try {
        const selectedFiles =
          selectedDocuments.map(
            (document) =>
              document.file,
          );

        const formData =
          new FormData();

        formData.set(
          "libraryId",
          context.libraryId,
        );

        formData.set(
          "mode",
          getBrowserImportMode(
            selectedFiles,
          ),
        );

        formData.set(
          "relativePaths",
          JSON.stringify(
            selectedFiles.map(
              getBrowserFileRelativePath,
            ),
          ),
        );

        for (
          const file of selectedFiles
        ) {
          formData.append(
            "files",
            file,
          );
        }

        const uploadingFiles =
          markFilesUploading(
            createInitialImportFiles(
              selectedDocuments,
            ),
          );

        setFileProgress(
          uploadingFiles,
        );

        latestFileProgressRef.current =
          uploadingFiles;

        const uploadResult =
          uploadedSelectionRef.current?.documents === selectedDocuments
          ? uploadedSelectionRef.current.result
          : await uploadKnowledgeImport(
            formData,
          );

        if (
          !isCurrentOperation()
        ) {
          return;
        }

        activeImportId =
          uploadResult.importId;
        uploadedSelectionRef.current = { documents: selectedDocuments, result: uploadResult };

        setImportId(
          uploadResult.importId,
        );

        const uploadedFiles: KnowledgeImportFlowFile[] = uploadResult.storedFiles
          ? uploadResult.storedFiles.map((file) => ({ ...file, status: "uploaded" }))
          : markFilesUploaded(uploadingFiles);
        const skippedDuplicates = uploadResult.skippedDuplicateFiles ?? [];
        if (skippedDuplicates.length > 0) {
          setDuplicateNotice(
            `Archivos duplicados omitidos: ${skippedDuplicates.map((file) => file.relativePath).join(", ")}. Solo se subirán y procesarán los documentos válidos.`,
          );
        }

        setFileProgress(
          uploadedFiles,
        );

        latestFileProgressRef.current =
          uploadedFiles;

        registerImport(
          uploadResult.importId,
          {
            context,
            displayMode: "modal",
            detailHost: "local",
            label:
              selectedDocuments[0]?.file
                .name ?? null,
            step: "analyzing",
            phase: "preparing",
            status: "uploaded",
            files: uploadedFiles,
            summary:
              createInitialImportSummary(
                uploadedFiles.length,
              ),
            error: null,
            isAnalyzing: true,
            isConfirming: false,
          },
        );

        setProcessingPhase(
          "preparing",
        );

        const analysisResult =
          await runKnowledgeImportAnalysis(
            uploadResult.importId,
            {
              onStageChange:
                (stage) => {
                  if (
                    !isCurrentOperation()
                  ) {
                    return;
                  }

                  if (
                    stage ===
                    "analyzing"
                  ) {
                    setProcessingPhase(
                      "preparing",
                    );

                    updateImport(
                      uploadResult.importId,
                      {
                        phase:
                          "preparing",
                        status:
                          "analyzing",
                        isAnalyzing:
                          true,
                      },
                    );

                    return;
                  }

                  setProcessingPhase(
                    "extracting",
                  );

                  updateImport(
                    uploadResult.importId,
                    {
                      phase:
                        "extracting",
                      status:
                        "extracting_text",
                      isAnalyzing:
                        true,
                    },
                  );
                },

              onAnalysisReady:
                (analysis) => {
                  if (
                    !isCurrentOperation()
                  ) {
                    return;
                  }

                  const analyzedFiles =
                    createFilesFromAnalysisSnapshot(
                      analysis.files,
                    );

                  setFileProgress(
                    analyzedFiles,
                  );

                  latestFileProgressRef.current =
                    analyzedFiles;

                  const analyzedSummary =
                    createSummaryFromAnalysisSnapshot(
                      analyzedFiles,
                    );

                  setProgressSummary(
                    analyzedSummary,
                  );

                  updateImport(
                    uploadResult.importId,
                    {
                      files:
                        analyzedFiles,
                      summary:
                        analyzedSummary,
                      status:
                        analysis.status,
                      error: null,
                    },
                  );
                },
            },
          );

        if (
          !isCurrentOperation()
        ) {
          return;
        }

        setTableDetection(Object.fromEntries(
          (analysisResult.textExtraction.files ?? [])
            .filter(file => file.status === "text_ready" && typeof file.hasTables === "boolean")
            .map(file => [file.id, Boolean(file.hasTables)]),
        ));

        const duplicateFiles =
          analysisResult.extraction
            .duplicateFiles;

        const finalizedFiles =
          finalizeImportFiles(
            latestFileProgressRef.current,
            analysisResult
              .textExtraction
              .successfulFiles,
            analysisResult
              .textExtraction
              .failedFiles,
          );

        const finalizedSummary =
          finalizeImportAnalysis(
            finalizedFiles,
            analysisResult
              .textExtraction
              .successfulFiles,
            analysisResult
              .textExtraction
              .failedFiles,
          );

        latestFileProgressRef.current =
          finalizedFiles;

        setFileProgress(
          finalizedFiles,
        );

        setProgressSummary(
          finalizedSummary,
        );

        updateImport(
          uploadResult.importId,
          {
            files: finalizedFiles,
            summary:
              finalizedSummary,
            status:
              analysisResult
                .textExtraction
                .status,
            isAnalyzing: false,
          },
        );

        // Queue: process one extracted PDF at a time, updating the persisted
        // cumulative map after each success. No Engine or Knowledge writes.
        if (analysisResult.textExtraction.successfulFiles > 0) {
          const extractedIds = new Set(
            (analysisResult.textExtraction.files ?? [])
              .filter(file => file.status === "text_ready")
              .map(file => file.id),
          );
          const queuedFiles = (analysisResult.textExtraction.files ?? [])
            .filter(file => extractedIds.has(file.id));
          if (!queuedFiles.length) throw new Error("No hay archivos con texto listo para reconocer.");
          let lastMap: Record<string, unknown> | null = null;
          const failures: string[] = [];
          for (let i = 0; i < queuedFiles.length; i++) {
            if (!isCurrentOperation()) return;
            const queued = queuedFiles[i];
            const response = await fetch(
              `/api/knowledge/import/${encodeURIComponent(uploadResult.importId)}/recognize`,
              { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId: queued.id }) },
            );
            const result: { error?: string; map?: Record<string, unknown>;
              file?: { fileId: string; fileName: string; sourceChars: number; status: string };
              documents?: Array<{ type: string; category: string }> } = await response.json();
            if (!response.ok || !result.map || !result.file) {
              failures.push(`${queued.name ?? queued.id}: ${result.error ?? "No reconocido"}`);
              continue;
            }
            lastMap = result.map;
            setGlobalMap(result.map);
            const recognized = {
              id: result.file.fileId, fileName: result.file.fileName,
              status: "completed" as const, sourceChars: result.file.sourceChars,
              documentType: "texto" as const, confidence: "high" as const,
              structuredLines: 0, narrativeLines: 0, lines: 0,
              delimitedLines: 0, numericLines: 0, headings: 0,
              extractionStatus: "completed", extractionProcessingStatus: "completed",
              sectionExamples: [], quantityExamples: [], delimitedExamples: [],
              conceptCandidates: [], existingStructures: [], error: null,
            };
            setRecognition(previous => ({ ...previous, [result.file!.fileName]: recognized }));
          }
          if (!lastMap) throw new Error(failures.join(" · ") || "No se reconoció ningún archivo.");
          if (!isCurrentOperation()) return;
          updateImport(uploadResult.importId, {
            step: "completed", status: failures.length ? "completed_with_issues" : "completed",
            isAnalyzing: false, isConfirming: false,
            error: failures.length ? failures.join(" · ") : null,
          });
          setStep("completed");
        }

        if (
          duplicateFiles.length > 0
        ) {
          setDuplicateNotice((current) => [
            current,
            `Archivos duplicados excluidos del procesamiento: ${duplicateFiles.map((file) => file.relativePath).join(", ")}.`,
          ].filter(Boolean).join(" "));
          toast.warning(
            duplicateFiles.length === 1
              ? "Se ha detectado un documento duplicado"
              : `Se han detectado ${duplicateFiles.length} documentos duplicados`,
            {
              description:
                "Los documentos duplicados no se procesarán ni se incluirán en la propuesta.",
            },
          );
        }

        if (
          analysisResult.textExtraction
            .successfulFiles === 0 &&
          analysisResult.extraction
            .duplicateCount === 0
        ) {
          setError(
            "No se ha podido obtener texto de ninguno de los documentos",
          );
        }
      } catch (caughtError) {
        if (
          !isCurrentOperation()
        ) {
          return;
        }

        if (
          caughtError instanceof
          KnowledgeImportReviewRequiredError
        ) {
          setImportReview(
            caughtError.review,
          );

          setError(null);
          setStep("upload");
          if (activeImportId) {
            updateImport(activeImportId, {
              step: "upload",
              status: "requires_review",
              isAnalyzing: false,
              error: null,
            });
          }

          setProcessingPhase(
            "uploading",
          );

          const initialFiles =
            createInitialImportFiles(
              selectedDocuments,
            );

          latestFileProgressRef.current =
            initialFiles;

          setFileProgress(
            initialFiles,
          );

          setProgressSummary(
            createInitialImportSummary(
              selectedDocuments.length,
            ),
          );

          return;
        }

        const errorMessage =
          caughtError instanceof Error
            ? caughtError.message
            : "No se han podido analizar los documentos";

        setError(
          errorMessage,
        );

        if (
          activeImportId
        ) {
          updateImport(
            activeImportId,
            {
              error:
                errorMessage,
              isAnalyzing:
                false,
            },
          );
        }

        setStep("upload");
      } finally {
        if (
          isCurrentOperation()
        ) {
          setIsAnalyzing(
            false,
          );
        }
        if (analysisInFlightRef.current === operationId) {
          analysisInFlightRef.current = null;
        }
      }
    }, [
      context,
      context.libraryId,
      importReview,
      registerImport,
      selectedDocuments,
      updateImport,
    ]);

  const continueWithValidDocuments =
    useCallback(async () => {
      if (!importId) {
        setError(
          "No se ha encontrado la importacion",
        );
        return;
      }

      if (
        !sharedState?.canContinue
      ) {
        setError(
          "No hay documentos validos con los que generar una propuesta",
        );
        return;
      }

      await continueSharedImport(
        importId,
      );
    }, [
      continueSharedImport,
      importId,
      sharedState?.canContinue,
    ]);

  const confirmProposal =
    useCallback(async () => {
      if (
        !visibleProposal ||
        !importId
      ) {
        return;
      }

      const result =
        await confirmSharedProposal(
          importId,
        );

      if (result) {
        onCompleted?.(
          result,
        );
      }
    }, [
      confirmSharedProposal,
      importId,
      onCompleted,
      visibleProposal,
    ]);

  const continueInBackground =
    useCallback(() => {
      const activeImportId =
        importId ??
        sharedTask?.importId ??
        null;

      if (
        !activeImportId
      ) {
        return false;
      }

      continueSharedInBackground(
        activeImportId,
      );

      return true;
    }, [
      continueSharedInBackground,
      importId,
      sharedTask?.importId,
    ]);

  const goBackToUpload =
    useCallback(() => {
      setError(null);
      setStep("upload");

      if (importId) {
        updateImport(
          importId,
          {
            step: "upload",
            error: null,
          },
        );
      }
    }, [
      importId,
      updateImport,
    ]);

  const reset =
    useCallback(() => {
      activeOperationRef.current +=
        1;
      analysisInFlightRef.current = null;

      latestFileProgressRef.current =
        [];
      uploadedSelectionRef.current = null;

      setStep("upload");
      setSelectedDocuments([]);
      setImportId(null);
      setProposal(null);
      setCompletionResult(null);
      setError(null);
      setImportReview(null);
      setDuplicateNotice(null);
      setTableDetection({});
      setRecognition({});
      setGlobalMap(null);
      setSemantic({});
      setSemanticRunning(false);
      setRelations({});
      setRelationsRunning(false);
      setRecordPreview({});
      setRecordPreviewRunning(false);
      setSimulationStages({});
      setIsAnalyzing(false);
      setIsConfirming(false);

      setProcessingPhase(
        "uploading",
      );

      setFileProgress([]);
      setProposalProgress(null);

      setProgressSummary(
        createEmptyImportSummary(),
      );
    }, []);

  const cancelActiveImport =
    useCallback(async () => {
      const activeImportId =
        importId ??
        sharedTask?.importId ??
        null;

      if (
        !activeImportId
      ) {
        reset();

        return {
          success: true,
        };
      }

      activeOperationRef.current +=
        1;

      setError(null);

      const result =
        await cancelImport(
          activeImportId,
        );

      if (
        result.success
      ) {
        reset();
        return result;
      }

      if (
        result.error
      ) {
        setError(
          result.error,
        );
      }

      return result;
    }, [
      cancelImport,
      importId,
      reset,
      sharedTask?.importId,
    ]);

  const finishActiveImport =
    useCallback(() => {
      const activeImportId =
        importId ??
        sharedTask?.importId ??
        null;

      if (
        activeImportId
      ) {
        finishImport(
          activeImportId,
        );
      }

      reset();
    }, [
      finishImport,
      importId,
      reset,
      sharedTask?.importId,
    ]);

  const insertIntoEngine = useCallback(async (fileName: string, conflictAnswers: Record<string, { kind: "keep" | "incoming" | "omit" | "custom"; note?: string }> = {}, identityAnswers: Record<string, "same" | "different" | "unsure"> = {}) => {
    const preview = recordPreview[fileName];
    if (!importId || !preview?.id || preview.status !== "completed" || !preview.signature)
      throw new Error("No hay una simulación firmada disponible.");
    if (preview.unresolvedLinks.length || (preview.manifestIssues?.length ?? 0) > 0 || preview.rows.some(row => row.disposition !== "candidate"))
      throw new Error("La simulación tiene elementos pendientes y no puede insertarse.");
    if (preview.reconciliation && !preview.reconciliation.ready && !Object.keys(conflictAnswers).length)
      throw new Error("La reconciliación incremental tiene bloqueos; resuelve los conflictos.");
    const plan: InsertPlan = {
      entities: preview.entities as InsertPlan["entities"],
      relations: preview.relations as InsertPlan["relations"],
      rows: preview.rows, links: preview.links,
      unresolvedLinks: preview.unresolvedLinks,
      // Only server-generated manifest issues are signed; stage 8 appends analysis warnings
      // to the display issues. The signature requires the original manifest issues.
      issues: preview.manifestIssues ?? [],
    };
    setEngineInsertRunning(true);
    try {
      const response = await fetch(`/api/knowledge/import/${encodeURIComponent(importId)}/insert-engine`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: preview.id, signature: preview.signature, plan, confirm: true, conflictAnswers, identityAnswers }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? result.blockers?.join(" · ") ?? "No se pudo insertar");
      const nothingInserted = result.structures === 0 && result.records === 0 && result.links === 0 && !result.updatedRecords;
      const message = nothingInserted
        ? "Todos los registros y relaciones ya existen en Engine. No se ha insertado ningún dato."
        : `Insertados: ${result.structures} estructuras, ${result.records} registros y ${result.links} vínculos` +
          (typeof result.reusedRecords === "number" ? ` · Reutilizados: ${result.reusedRecords} registros y ${result.reusedLinks} vínculos` : "");
      const fullMessage = message + (result.updatedRecords ? ` · Actualizados: ${result.updatedRecords} registros` : "") +
        (result.omittedRecords ? ` · Omitidos: ${result.omittedRecords} registros` : "");
      setEngineInsertResult(current => ({ ...current, [fileName]: fullMessage }));
      toast.success(fullMessage);
      return result;
    } finally {
      setEngineInsertRunning(false);
    }
  }, [recordPreview, importId]);

  return {
    globalMap,
    recognition,
    semantic,
    semanticRunning,
    relations,
    relationsRunning,
    recordPreview,
    recordPreviewRunning,
    engineInsertRunning,
    engineInsertResult,
    insertIntoEngine,
    simulationStages,
    tableDetection,
    duplicateNotice,
    allFilesDuplicate: isAllDuplicateReview(importReview),
    step: visibleStep,
    files,
    proposal: visibleProposal,
    completionResult:
      visibleCompletionResult,
    error: visibleError,
    importReview,
    isAnalyzing:
      visibleIsAnalyzing,
    isConfirming:
      visibleIsConfirming,
    currentStep:
      sharedState?.currentStep ??
      visibleStep,
    currentAction:
      sharedState?.currentAction ??
      null,
    nextAction:
      sharedState?.nextAction ??
      null,
    canContinue:
      sharedState?.canContinue ??
      false,
    isBusy:
      sharedState?.isBusy ??
      visibleIsAnalyzing ??
      visibleIsConfirming,
    isWaitingUser:
      sharedState?.isWaitingUser ??
      false,
    hasProposal:
      sharedState?.hasProposal ??
      visibleProposal !== null,
    hasCompletionResult:
      sharedState?.hasCompletionResult ??
      visibleCompletionResult !== null,
    hasUnsavedProgress,
    canContinueInBackground,
    processingPhase:
      visiblePhase,
    fileProgress:
      visibleFileProgress,
    progressSummary:
      visibleProgressSummary,
    proposalProgress:
      visibleProposalProgress,

    handleFilesChange,
    analyzeDocuments,
    continueWithValidDocuments,
    confirmProposal,
    continueInBackground,
    goBackToUpload,
    cancelActiveImport,
    finishActiveImport,
    reset,
  };
}
