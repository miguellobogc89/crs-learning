
import {
  getBrowserFileRelativePath,
} from "./file-selection";

import type {
  AnalyzeImportFlowFile,
  BrowserFileInput,
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

function mapAnalyzeFileStatus(
  status: AnalyzeImportFlowFile["status"],
): KnowledgeImportFlowFile["status"] {
  if (status === "ready") {
    return "ready";
  }

  if (status === "duplicate") {
    return "duplicate";
  }

  return "unsupported";
}

export function createFilesFromAnalysisSnapshot(
  files: AnalyzeImportFlowFile[],
) {
  return files.map(
    (file) =>
      ({
        id: file.id,
        name: file.name,
        size: file.size,
        fileType:
          file.fileType ?? undefined,
        relativePath:
          file.relativePath,
        status:
          mapAnalyzeFileStatus(
            file.status,
          ),
        processingOrder:
          file.processingOrder ?? null,
        processingStatus:
          file.processingStatus ?? null,
        processingStep:
          file.processingStep ?? null,
        error:
          file.error ?? undefined,
        duplicateOf:
          file.duplicateOf,
      }) satisfies KnowledgeImportFlowFile,
  );
}

export function createSummaryFromAnalysisSnapshot(
  files: KnowledgeImportFlowFile[],
) {
  const duplicateFiles =
    files.filter(
      (file) =>
        file.status === "duplicate",
    ).length;

  const failedFiles =
    files.filter(
      (file) =>
        file.status === "unsupported" ||
        file.status === "error",
    ).length;

  const completedFiles =
    files.filter(
      (file) =>
        file.status === "completed",
    ).length;

  const processedFiles =
    duplicateFiles +
    failedFiles +
    completedFiles;

  const totalFiles =
    files.length;

  return {
    totalFiles,
    completedFiles,
    duplicateFiles,
    failedFiles,
    processedFiles,
    pendingFiles: Math.max(
      totalFiles - processedFiles,
      0,
    ),
    progressPercentage:
      totalFiles === 0
        ? 0
        : Math.round(
            (processedFiles /
              totalFiles) *
              100,
          ),
    currentFileName: null,
  } satisfies KnowledgeImportFlowSummary;
}

export function mergeServerProgress(
  currentFiles: KnowledgeImportFlowFile[],
  currentSummary: KnowledgeImportFlowSummary,
  progress: ServerProgressSnapshot,
) {
  const serverById = new Map(
    progress.files.map((file) => [
      file.id,
      file,
    ]),
  );

  const serverByKey = new Map(
    progress.files.map((file) => [
      (
        file.relativePath ||
        file.name
      ).toLowerCase(),
      file,
    ]),
  );

  const duplicateCount =
    currentFiles.filter(
      (file) =>
        file.status === "duplicate",
    ).length;

  const unsupportedCount =
    currentFiles.filter(
      (file) =>
        file.status === "unsupported",
    ).length;

  const files = currentFiles.map(
    (currentFile) => {
      if (
        currentFile.status ===
          "duplicate" ||
        currentFile.status ===
          "unsupported"
      ) {
        return currentFile;
      }

      const serverFile =
        serverById.get(
          currentFile.id,
        ) ??
        serverByKey.get(
          getFileKey(currentFile),
        );

      if (!serverFile) {
        return currentFile;
      }

      return {
        ...currentFile,
        id: serverFile.id,
        name: serverFile.name,
        size:
          serverFile.size ??
          currentFile.size,
        relativePath:
          serverFile.relativePath,
        processingOrder:
          serverFile.processingOrder,
        processingStatus:
          serverFile.processingStatus,
        processingStep:
          serverFile.processingStep,
        fileType:
          serverFile.fileType ??
          currentFile.fileType,
        startedAt:
          serverFile.startedAt ??
          currentFile.startedAt,
        completedAt:
          serverFile.completedAt ??
          currentFile.completedAt,
        createdAt:
          serverFile.createdAt ??
          currentFile.createdAt,
        updatedAt:
          serverFile.updatedAt ??
          currentFile.updatedAt,
        status:
          mapServerFileStatus(
            serverFile,
          ),
        error:
          serverFile.error ??
          undefined,
      } satisfies KnowledgeImportFlowFile;
    },
  );

  const totalFiles =
    Math.max(
      currentSummary.totalFiles,
      progress.totalFiles +
        duplicateCount +
        unsupportedCount,
    );

  const processedFiles =
    progress.processedFiles +
    duplicateCount +
    unsupportedCount;

  const pendingFiles =
    Math.max(
      totalFiles - processedFiles,
      0,
    );

  return {
    files,
    summary: {
      totalFiles,
      completedFiles:
        progress.completedFiles,
      duplicateFiles:
        duplicateCount,
      failedFiles:
        progress.failedFiles +
        unsupportedCount,
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


export function finalizeImportFiles(
  files: KnowledgeImportFlowFile[],
  successfulFiles: number,
  failedFiles: number,
) {
  const completedCount = files.filter(
    (file) => file.status === "completed",
  ).length;

  const errorCount = files.filter(
    (file) => file.status === "error",
  ).length;

  let remainingSuccessful = Math.max(
    successfulFiles - completedCount,
    0,
  );

  let remainingFailed = Math.max(
    failedFiles - errorCount,
    0,
  );

  return files.map((file) => {
    if (
      file.status === "duplicate" ||
      file.status === "unsupported" ||
      file.status === "completed" ||
      file.status === "error"
    ) {
      return file;
    }

    if (file.error && remainingFailed > 0) {
      remainingFailed -= 1;

      return {
        ...file,
        status: "error" as const,
      };
    }

    if (remainingSuccessful > 0) {
      remainingSuccessful -= 1;

      return {
        ...file,
        status: "completed" as const,
        processingStep: null,
        error: undefined,
      };
    }

    if (remainingFailed > 0) {
      remainingFailed -= 1;

      return {
        ...file,
        status: "error" as const,
        processingStep: null,
        error:
          file.error ??
          "No se ha podido procesar el documento",
      };
    }

    return file;
  });
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

  const unsupportedFiles =
    files.filter(
      (file) =>
        file.status === "unsupported",
    ).length;

  const totalFiles =
    files.length;

  return {
    totalFiles,
    completedFiles:
      successfulFiles,
    duplicateFiles,
    failedFiles:
      failedFiles +
      unsupportedFiles,
    processedFiles:
      successfulFiles +
      duplicateFiles +
      unsupportedFiles +
      failedFiles,
    pendingFiles: 0,
    progressPercentage:
      totalFiles > 0 ? 100 : 0,
    currentFileName: null,
  } satisfies KnowledgeImportFlowSummary;
}
