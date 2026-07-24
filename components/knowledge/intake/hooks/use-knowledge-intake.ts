// components/knowledge/intake/hooks/use-knowledge-intake.ts

"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type {
  ConfirmKnowledgeImportResult,
  KnowledgeImportProposal,
} from "@/lib/knowledge/import/types";
import type {
  ConfirmKnowledgeIntakeResult,
  KnowledgeIntakeDocumentDecision,
  KnowledgeIntakeProposal,
} from "@/lib/knowledge/intake/types";

import type {
  KnowledgeIntakeContext,
  KnowledgeIntakeModalStep,
} from "../modal/knowledge-intake-modal.types";
import type {
  KnowledgeIntakeFileProgress,
  KnowledgeIntakeProcessingPhase,
} from "../modal/knowledge-intake-processing.types";

import {
  generateKnowledgeImportProposal,
  runKnowledgeImportAnalysis,
  type KnowledgeImportProgress,
} from "../../import/knowledge-import-api";
import {
  createSelectedDocuments,
  type SelectedKnowledgeDocument,
} from "../../services/create-selected-documents";
import { readErrorMessage } from "../../services/read-error-message";

type UseKnowledgeIntakeParams = {
  context: KnowledgeIntakeContext;
  onCompleted?: (
    result: ConfirmKnowledgeIntakeResult,
  ) => void;
};

type UploadKnowledgeImportResult = {
  importId: string;
  status: "uploaded";
  mode: "files" | "folder" | "zip";
  fileCount: number;
  totalSize: number;
};

function getFileIdentity(file: File) {
  return [
    file.name.toLowerCase(),
    file.size,
    file.lastModified,
  ].join("::");
}

function getRelativePath(file: File) {
  const fileWithRelativePath = file as File & {
    webkitRelativePath?: string;
  };

  return (
    fileWithRelativePath.webkitRelativePath ||
    file.name
  );
}

function getImportMode(files: File[]) {
  if (
    files.length === 1 &&
    files[0].name
      .toLowerCase()
      .endsWith(".zip")
  ) {
    return "zip" as const;
  }

  if (
    files.some((file) =>
      getRelativePath(file).includes("/"),
    )
  ) {
    return "folder" as const;
  }

  return "files" as const;
}

function removeDuplicateFiles(
  files: File[],
) {
  const seenFiles = new Set<string>();
  const uniqueFiles: File[] = [];
  const duplicateFiles: File[] = [];

  for (const file of files) {
    const identity =
      getFileIdentity(file);

    if (seenFiles.has(identity)) {
      duplicateFiles.push(file);
      continue;
    }

    seenFiles.add(identity);
    uniqueFiles.push(file);
  }

  return {
    uniqueFiles,
    duplicateFiles,
  };
}

function buildFolderPath(
  proposal: KnowledgeImportProposal,
  folderId: string | null,
) {
  if (!folderId) {
    return [] as string[];
  }

  const foldersById = new Map(
    proposal.folders.map((folder) => [
      folder.id,
      folder,
    ]),
  );

  const folderPath: string[] = [];
  const visited = new Set<string>();

  let currentFolderId:
    | string
    | null = folderId;

  while (
    currentFolderId &&
    !visited.has(currentFolderId)
  ) {
    visited.add(currentFolderId);

    const folder = foldersById.get(
      currentFolderId,
    );

    if (!folder) {
      break;
    }

    folderPath.unshift(folder.name);

    currentFolderId =
      folder.parentFolderId;
  }

  return folderPath;
}

function adaptImportProposal(
  proposal: KnowledgeImportProposal,
  libraryId: string,
): KnowledgeIntakeProposal {
  const updatedArticles =
    proposal.articles.filter(
      (article) =>
        article.action === "update",
    );

  const versionArticles =
    updatedArticles.filter((article) =>
      proposal.warnings.some(
        (warning) =>
          warning.type === "version" &&
          warning.documentIds.some(
            (documentId) =>
              article.documentIds.includes(
                documentId,
              ),
          ),
      ),
    );

  const versionArticleIds = new Set(
    versionArticles.map(
      (article) => article.id,
    ),
  );

  const decisions: KnowledgeIntakeDocumentDecision[] =
    proposal.documentAnalyses.map(
      (analysis) => {
        const article =
          proposal.articles.find(
            (candidate) =>
              candidate.documentIds.includes(
                analysis.documentId,
              ),
          );

        const folderPath =
          buildFolderPath(
            proposal,
            article?.folderId ?? null,
          );

        const relatedWarnings =
          proposal.warnings.filter(
            (warning) =>
              warning.documentIds.includes(
                analysis.documentId,
              ),
          );

        const articleTitle =
          article?.title ||
          analysis.suggestedArticleTitle ||
          analysis.title;

        const confidence =
          article?.confidence ?? 0.75;

        const warnings =
          relatedWarnings.map(
            (warning) =>
              warning.description,
          );

        if (
          article?.action === "update"
        ) {
          if (
            !article.existingArticleId
          ) {
            throw new Error(
              `El artículo "${article.title}" no tiene existingArticleId`,
            );
          }

          const destination = {
            articleId:
              article.existingArticleId,
            articleTitle,
            folderId: null,
            folderPath: [],
            newFolderName: null,
          };

          const isNewVersion =
            versionArticleIds.has(
              article.id,
            );

          if (isNewVersion) {
            return {
              documentId:
                analysis.documentId,
              documentName:
                analysis.documentName,
              decision: "new_version",
              confidence,
              title: analysis.title,
              summary: analysis.summary,
              reason:
                article.description ||
                analysis.summary ||
                "La IA propone incorporar este documento como una nueva versión del artículo existente.",
              duplicateMatch: {
                articleId:
                  article.existingArticleId,
                articleTitle,
                fileId: null,
                fileName: null,
                similarity: confidence,
                reason:
                  relatedWarnings.find(
                    (warning) =>
                      warning.type ===
                      "version",
                  )?.description ||
                  "La IA ha detectado que el documento corresponde a una nueva versión del artículo existente.",
              },
              destination,
              detectedTopics:
                analysis.topics,
              detectedEntities:
                analysis.entities,
              detectedKeywords:
                analysis.keywords,
              warnings,
            };
          }

          return {
            documentId:
              analysis.documentId,
            documentName:
              analysis.documentName,
            decision:
              "enrich_existing_article",
            confidence,
            title: analysis.title,
            summary: analysis.summary,
            reason:
              article.description ||
              analysis.summary ||
              "La IA propone incorporar este documento al artículo existente.",
            duplicateMatch: null,
            destination,
            detectedTopics:
              analysis.topics,
            detectedEntities:
              analysis.entities,
            detectedKeywords:
              analysis.keywords,
            warnings,
          };
        }

        if (folderPath.length > 0) {
          return {
            documentId:
              analysis.documentId,
            documentName:
              analysis.documentName,
            decision:
              "create_article_in_new_folder",
            confidence,
            title: analysis.title,
            summary: analysis.summary,
            reason:
              article?.description ||
              analysis.summary ||
              "La IA propone crear un artículo nuevo para este documento.",
            duplicateMatch: null,
            destination: {
              articleId: null,
              articleTitle,
              folderId: null,
              folderPath,
              newFolderName:
                folderPath.at(-1) ??
                "Nueva carpeta",
            },
            detectedTopics:
              analysis.topics,
            detectedEntities:
              analysis.entities,
            detectedKeywords:
              analysis.keywords,
            warnings,
          };
        }

        return {
          documentId:
            analysis.documentId,
          documentName:
            analysis.documentName,
          decision:
            "create_article_in_existing_folder",
          confidence,
          title: analysis.title,
          summary: analysis.summary,
          reason:
            article?.description ||
            analysis.summary ||
            "La IA propone crear un artículo nuevo en la biblioteca.",
          duplicateMatch: null,
          destination: {
            articleId: null,
            articleTitle,
            folderId: libraryId,
            folderPath: [],
            newFolderName: null,
          },
          detectedTopics:
            analysis.topics,
          detectedEntities:
            analysis.entities,
          detectedKeywords:
            analysis.keywords,
          warnings,
        };
      },
    );

  return {
    title: proposal.title,
    description:
      proposal.description,
    libraryId,
    generatedAt:
      new Date().toISOString(),

    summary: {
      totalDocuments:
        proposal.summary.totalDocuments,

      exactDuplicates:
        proposal.warnings.filter(
          (warning) =>
            warning.type ===
            "duplicate",
        ).length,

      possibleDuplicates:
        proposal.warnings.filter(
          (warning) =>
            warning.type ===
            "possible_duplicate",
        ).length,

      newVersions:
        versionArticles.length,

      articleEnrichments:
        updatedArticles.length -
        versionArticles.length,

      newArticlesInExistingFolders:
        proposal.articles.filter(
          (article) =>
            article.action ===
              "create" &&
            article.folderId === null,
        ).length,

      newArticlesInNewFolders:
        proposal.articles.filter(
          (article) =>
            article.action ===
              "create" &&
            article.folderId !== null,
        ).length,
    },

    decisions,

    warnings:
      proposal.warnings.map(
        (warning) =>
          `${warning.title}: ${warning.description}`,
      ),
  };
}

function adaptConfirmationResult(
  result: ConfirmKnowledgeImportResult,
  proposal: KnowledgeImportProposal,
): ConfirmKnowledgeIntakeResult {
  const createdArticles =
    result.log.articles.map(
      (article) => {
        const proposalArticle =
          proposal.articles.find(
            (candidate) =>
              candidate.id ===
              article.proposalArticleId,
          );

        return {
          id:
            article.databaseArticleId,
          title: article.title,
          libraryId:
            result.log.targetLibrary.id,
          path: buildFolderPath(
            proposal,
            proposalArticle?.folderId ??
              null,
          ),
          documentIds:
            article.documentIds,
        };
      },
    );

  return {
    success: true,
    status: "completed",

    summary: {
      createdArticles:
        createdArticles.length,
      updatedArticles: 0,
      ignoredDocuments: 0,
      attachedDocuments:
        result.log.documents.length,
    },

    createdArticles,
    updatedArticles: [],
    ignoredDocuments: [],
  };
}

export function useKnowledgeIntake({
  context,
  onCompleted,
}: UseKnowledgeIntakeParams) {
  const router = useRouter();

  const [step, setStep] =
    useState<KnowledgeIntakeModalStep>(
      "upload",
    );

  const [
    selectedDocuments,
    setSelectedDocuments,
  ] = useState<
    SelectedKnowledgeDocument[]
  >([]);

  const [importId, setImportId] =
    useState<string | null>(null);

  const [
    importProposal,
    setImportProposal,
  ] =
    useState<KnowledgeImportProposal | null>(
      null,
    );

  const [proposal, setProposal] =
    useState<KnowledgeIntakeProposal | null>(
      null,
    );

  const [
    completionResult,
    setCompletionResult,
  ] =
    useState<ConfirmKnowledgeIntakeResult | null>(
      null,
    );

  const [error, setError] =
    useState<string | null>(null);

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
    useState<KnowledgeIntakeProcessingPhase>(
      "uploading",
    );

  const [
    fileProgress,
    setFileProgress,
  ] = useState<
    KnowledgeIntakeFileProgress[]
  >([]);

  const [
    progressSummary,
    setProgressSummary,
  ] = useState({
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    processedFiles: 0,
    pendingFiles: 0,
    progressPercentage: 0,
    currentFileName: null as
      | string
      | null,
  });

  const files = useMemo(
    () =>
      selectedDocuments.map(
        (document) => document.file,
      ),
    [selectedDocuments],
  );

  const hasUnsavedProgress =
    selectedDocuments.length > 0 ||
    proposal !== null ||
    step !== "upload";

  const handleFilesChange =
    useCallback(
      (nextFiles: File[]) => {
        setError(null);

        const {
          uniqueFiles,
          duplicateFiles,
        } =
          removeDuplicateFiles(
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

  const applyServerProgress =
    useCallback(
      (
        progress: KnowledgeImportProgress,
      ) => {
        setProgressSummary({
          totalFiles:
            progress.totalFiles,
          completedFiles:
            progress.completedFiles,
          failedFiles:
            progress.failedFiles,
          processedFiles:
            progress.processedFiles,
          pendingFiles:
            progress.pendingFiles,
          progressPercentage:
            progress.progressPercentage,
          currentFileName:
            progress.currentFile?.name ??
            null,
        });

        setFileProgress(
          progress.files.map(
            (file) => {
              let status:
                | "pending"
                | "processing"
                | "completed"
                | "error" =
                "pending";

              if (
                file.processingStatus ===
                "processing"
              ) {
                status =
                  "processing";
              } else if (
                file.processingStatus ===
                  "completed" ||
                file.status ===
                  "text_ready"
              ) {
                status =
                  "completed";
              } else if (
                file.processingStatus ===
                  "error" ||
                file.status ===
                  "text_error"
              ) {
                status = "error";
              }

              return {
                id: file.id,
                name: file.name,
                relativePath:
                  file.relativePath,
                processingOrder:
                  file.processingOrder,
                processingStep:
                  file.processingStep,
                status,
                error:
                  file.error ??
                  undefined,
              };
            },
          ),
        );
      },
      [],
    );

  const analyzeDocuments =
    useCallback(async () => {
      if (
        selectedDocuments.length === 0
      ) {
        setError(
          "Selecciona al menos un documento",
        );
        return;
      }

      setIsAnalyzing(true);
      setError(null);
      setStep("analyzing");
      setProcessingPhase(
        "uploading",
      );

      setProgressSummary({
        totalFiles:
          selectedDocuments.length,
        completedFiles: 0,
        failedFiles: 0,
        processedFiles: 0,
        pendingFiles:
          selectedDocuments.length,
        progressPercentage: 0,
        currentFileName: null,
      });

      setFileProgress(
        selectedDocuments.map(
          (document) => ({
            id: document.id,
            name:
              document.file.name,
            status: "pending",
          }),
        ),
      );

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
          getImportMode(
            selectedFiles,
          ),
        );

        formData.set(
          "relativePaths",
          JSON.stringify(
            selectedFiles.map(
              getRelativePath,
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

        setFileProgress(
          (current) =>
            current.map((item) => ({
              ...item,
              status: "uploading",
              error: undefined,
            })),
        );

        const uploadResponse =
          await fetch(
            "/api/knowledge/import/upload",
            {
              method: "POST",
              body: formData,
            },
          );

        if (!uploadResponse.ok) {
          throw new Error(
            await readErrorMessage(
              uploadResponse,
              "No se han podido subir los documentos",
            ),
          );
        }

        const uploadResult =
          (await uploadResponse.json()) as UploadKnowledgeImportResult;

        setImportId(
          uploadResult.importId,
        );

        setFileProgress(
          (current) =>
            current.map((item) => ({
              ...item,
              status: "uploaded",
            })),
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
                    stage ===
                    "analyzing"
                  ) {
                    setProcessingPhase(
                      "preparing",
                    );
                    return;
                  }

                  setProcessingPhase(
                    "extracting",
                  );
                },

              onProgress:
                applyServerProgress,
            },
          );

        if (
          analysisResult
            .textExtraction
            .successfulFiles === 0
        ) {
          setError(
            "No se ha podido obtener texto de ninguno de los documentos",
          );
        }

        setStep(
          "analysis_result",
        );
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se han podido analizar los documentos",
        );

        setStep("upload");
      } finally {
        setIsAnalyzing(false);
      }
    }, [
      applyServerProgress,
      context.libraryId,
      selectedDocuments,
    ]);

  const continueWithValidDocuments =
    useCallback(async () => {
      if (!importId) {
        setError(
          "No se ha encontrado la importación",
        );
        return;
      }

      if (
        progressSummary.completedFiles ===
        0
      ) {
        setError(
          "No hay documentos válidos con los que generar una propuesta",
        );
        return;
      }

      setIsAnalyzing(true);
      setError(null);
      setProcessingPhase(
        "generating_proposal",
      );
      setStep("analyzing");

      try {
        const proposalResult =
          await generateKnowledgeImportProposal(
            importId,
          );

        setImportProposal(
          proposalResult.proposal,
        );

        setProposal(
          adaptImportProposal(
            proposalResult.proposal,
            context.libraryId,
          ),
        );

        setStep("proposal");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se ha podido generar la propuesta",
        );

        setStep(
          "analysis_result",
        );
      } finally {
        setIsAnalyzing(false);
      }
    }, [
      context.libraryId,
      importId,
      progressSummary.completedFiles,
    ]);

  const confirmProposal =
    useCallback(async () => {
      if (
        !proposal ||
        !importProposal ||
        !importId
      ) {
        return;
      }

      setIsConfirming(true);
      setError(null);

      try {
        const response =
          await fetch(
            `/api/knowledge/import/${importId}/confirm`,
            {
              method: "POST",
            },
          );

        if (!response.ok) {
          throw new Error(
            await readErrorMessage(
              response,
              "No se ha podido aplicar la propuesta",
            ),
          );
        }

        const importResult =
          (await response.json()) as ConfirmKnowledgeImportResult;

        const result =
          adaptConfirmationResult(
            importResult,
            importProposal,
          );

        setCompletionResult(
          result,
        );

        setStep("completed");

        router.refresh();

        onCompleted?.(result);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se ha podido aplicar la propuesta",
        );
      } finally {
        setIsConfirming(false);
      }
    }, [
      importId,
      importProposal,
      onCompleted,
      proposal,
      router,
    ]);

  const goBackToUpload =
    useCallback(() => {
      setError(null);
      setStep("upload");
    }, []);

  const reset = useCallback(() => {
    setStep("upload");
    setSelectedDocuments([]);
    setImportId(null);
    setImportProposal(null);
    setProposal(null);
    setCompletionResult(null);
    setError(null);
    setIsAnalyzing(false);
    setIsConfirming(false);

    setProcessingPhase(
      "uploading",
    );

    setFileProgress([]);

    setProgressSummary({
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      processedFiles: 0,
      pendingFiles: 0,
      progressPercentage: 0,
      currentFileName: null,
    });
  }, []);

  return {
    step,
    files,
    proposal,
    completionResult,
    error,
    isAnalyzing,
    isConfirming,
    hasUnsavedProgress,
    processingPhase,
    fileProgress,
    progressSummary,

    handleFilesChange,
    analyzeDocuments,
    continueWithValidDocuments,
    confirmProposal,
    goBackToUpload,
    reset,
  };
}