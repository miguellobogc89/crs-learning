
import {
  getBrowserFileRelativePath,
} from "./file-selection";

import type {
  BrowserFileInput,
  DuplicateFileSnapshot,
  KnowledgeImportFlowFile,
  KnowledgeImportFlowSummary,
  ServerProgressSnapshot,
} from "./types";

export function createEmptyImportSummary(): KnowledgeImportFlowSummary {
  return {
    totalFiles: 0,
    completedFiles: 0,
    duplicateFiles: 0,
    failedFiles: 0,
    processedFiles: 0,
    pendingFiles: 0,
    progressPercentage: 0,
    currentFileName: null,
  };
}

export function createInitialImportSummary(
  totalFiles: number,
): KnowledgeImportFlowSummary {
  return {
    ...createEmptyImportSummary(),
    totalFiles,
    pendingFiles: totalFiles,
  };
}

export function createInitialImportFiles(
  documents: BrowserFileInput[],
): KnowledgeImportFlowFile[] {
  return documents.map(
    ({ id, file }) => ({
      id,
      name: file.name,
      size: file.size,
      fileType: file.type,
      relativePath:
        getBrowserFileRelativePath(file),
      status: "pending",
    }),
  );
}

function getFileKey(
  file: Pick<
    KnowledgeImportFlowFile,
    "name" | "relativePath"
  >,
) {
  return (
    file.relativePath ||
    file.name
  ).toLowerCase();
}

export function markFilesUploading(
  files: KnowledgeImportFlowFile[],
) {
  return files.map((file) => ({
    ...file,
    status: "uploading" as const,
    error: undefined,
  }));
}

export function markFilesUploaded(
  files: KnowledgeImportFlowFile[],
) {
  return files.map((file) => ({
    ...file,
    status: "uploaded" as const,
  }));
}

export function applyDuplicateSnapshot(
  currentFiles: KnowledgeImportFlowFile[],
  duplicateFiles: DuplicateFileSnapshot[],
) {
  const duplicateByPath = new Map(
    duplicateFiles.map((file) => [
      (
        file.relativePath ||
        file.name
      ).toLowerCase(),
      file,
    ]),
  );

  const files = currentFiles.map(
    (currentFile) => {
      const duplicate =
        duplicateByPath.get(
          getFileKey(currentFile),
        );

      if (!duplicate) {
        return currentFile;
      }

      return {
        ...currentFile,
        id: `duplicate:${duplicate.existingFileId}:${getFileKey(
          currentFile,
        )}`,
        name: duplicate.name,
        size: duplicate.size,
        relativePath:
          duplicate.relativePath,
        status: "duplicate" as const,
        processingOrder: null,
        processingStep: null,
        error: undefined,
        duplicateOf: {
          fileId:
            duplicate.existingFileId,
          articleId:
            duplicate.existingArticleId,
          articleTitle:
            duplicate.existingArticleTitle,
        },
      };
    },
  );

  return {
    files,
    duplicateCount:
      duplicateFiles.length,
  };
}

function mapServerFileStatus(
  file: ServerProgressSnapshot["files"][number],
): KnowledgeImportFlowFile["status"] {
  if (
    file.processingStatus ===
    "processing"
  ) {
    return "processing";
  }

  if (
    file.processingStatus ===
      "completed" ||
    file.status === "text_ready"
  ) {
    return "completed";
  }

  if (
    file.processingStatus === "error" ||
    file.status === "text_error"
  ) {
    return "error";
  }

  return "pending";
}

export function mergeServerProgress(
  currentFiles: KnowledgeImportFlowFile[],
  currentSummary: KnowledgeImportFlowSummary,
  progress: ServerProgressSnapshot,
) {
  const duplicateFiles =
    currentFiles.filter(
      (file) =>
        file.status === "duplicate",
    );

  const duplicateKeys = new Set(
    duplicateFiles.map(getFileKey),
  );

  const currentByKey = new Map(
    currentFiles.map((file) => [
      getFileKey(file),
      file,
    ]),
  );

  const serverFiles =
    progress.files
      .filter(
        (file) =>
          !duplicateKeys.has(
            (
              file.relativePath ||
              file.name
            ).toLowerCase(),
          ),
      )
      .map((file) => {
        const key = (
          file.relativePath ||
          file.name
        ).toLowerCase();

        const localFile =
          currentByKey.get(key);

        return {
          id: file.id,
          name: file.name,
          size:
            file.size ??
            localFile?.size,
          fileType:
            localFile?.fileType,
          relativePath:
            file.relativePath,
          processingOrder:
            file.processingOrder,
          processingStep:
            file.processingStep,
          status:
            mapServerFileStatus(file),
          error:
            file.error ??
            undefined,
        } satisfies KnowledgeImportFlowFile;
      });

  const duplicateCount =
    duplicateFiles.length;

  const totalFiles =
    Math.max(
      currentSummary.totalFiles,
      progress.totalFiles +
        duplicateCount,
    );

  const processedFiles =
    progress.processedFiles +
    duplicateCount;

  const pendingFiles =
    Math.max(
      totalFiles - processedFiles,
      0,
    );

  return {
    files: [
      ...serverFiles,
      ...duplicateFiles,
    ],
    summary: {
      totalFiles,
      completedFiles:
        progress.completedFiles,
      duplicateFiles:
        duplicateCount,
      failedFiles:
        progress.failedFiles,
      processedFiles,
      pendingFiles,
      progressPercentage:
        totalFiles === 0
          ? 0
          : Math.round(
              (processedFiles /
                totalFiles) *
                100,
            ),
      currentFileName:
        progress.currentFile?.name ??
        null,
    } satisfies KnowledgeImportFlowSummary,
  };
}

export function finalizeImportAnalysis(
  files: KnowledgeImportFlowFile[],
  successfulFiles: number,
  failedFiles: number,
) {
  const duplicateFiles =
    files.filter(
      (file) =>
        file.status === "duplicate",
    ).length;

  const totalFiles =
    files.length;

  return {
    totalFiles,
    completedFiles:
      successfulFiles,
    duplicateFiles,
    failedFiles,
    processedFiles:
      successfulFiles +
      duplicateFiles +
      failedFiles,
    pendingFiles: 0,
    progressPercentage:
      totalFiles > 0 ? 100 : 0,
    currentFileName: null,
  } satisfies KnowledgeImportFlowSummary;
}
