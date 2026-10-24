import type { ImportInventory } from "@/lib/knowledge/import/build-import-map";

// components/knowledge/import/knowledge-import-api.ts

import type {
  ConfirmKnowledgeImportResult,
  GenerateKnowledgeImportProposalResult,
  KnowledgeImportProposal,
} from "@/lib/knowledge/import/types";

import type {
  AnalyzeImportFlowFile,
} from "@/components/knowledge/import/types/import-flow.types";

import {
  KnowledgeImportReviewRequiredError,
  readKnowledgeImportReview,
} from "./knowledge-import-review";

type ApiErrorBody = {
  error?: string;
};

export type KnowledgeImportUploadResult = {
  importId: string;
  status: "uploaded";
  mode: "files" | "folder" | "zip";
  fileCount: number;
  totalSize: number;
  inventoryFileCount?: number;
  skippedDuplicateFiles?: Array<{ fileName: string; relativePath: string }>;
  storedFiles?: Array<{ id: string; name: string; relativePath: string; size: number }>;
};

export type KnowledgeImportDuplicateFile = {
  name: string;
  relativePath: string;
  size: number;
  existingFileId?: string;
  existingArticleId?: string;
  existingArticleTitle?: string;
};

type AnalyzeImportResponse = {
  importId: string;

  status:
    | "extracted"
    | "completed";

  processingStatus:
    | "pending"
    | "completed";

  fileCount: number;
  completedFiles: number;
  failedFiles: number;
  totalSize: number;

  duplicateCount: number;
  allFilesDuplicate: boolean;

  duplicateFiles:
    KnowledgeImportDuplicateFile[];

  unsupportedCount: number;
  files: AnalyzeImportFlowFile[];
};

type ExtractTextResponse = {
  importId: string;
  status:
    | "text_ready"
    | "text_error";
  processingStatus:
    | "completed"
    | "error";
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalCharacters: number;
  files?: Array<{ id: string; name: string; hasTables?: boolean; status: "text_ready" | "text_error"; characters: number; error?: string }>;
};

type CancelKnowledgeImportResponse = {
  importId: string;
  status: "cancelled";
  processingStatus: "cancelled";
};

export type KnowledgeImportProgressFile = {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  fileType: string | null;
  status: string;
  processingOrder: number | null;
  processingStatus: string | null;
  processingStep: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  error: string | null;
};

export type KnowledgeImportProgress = {
  importId: string;

  status: string;
  processingStatus: string;

  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  processedFiles: number;
  pendingFiles: number;

  totalSize: number;
  progressPercentage: number;

  isFinished: boolean;
  proposalReady: boolean;

  currentFile: {
    id: string;
    name: string;
    relativePath: string;
    size: number;
    processingOrder: number | null;
    processingStatus: string | null;
    processingStep: string | null;
    startedAt: string | null;
    completedAt: string | null;
    error: string | null;
  } | null;

  files: KnowledgeImportProgressFile[];

  error: string | null;

  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeImportAnalysisStage =
  | "analyzing"
  | "extracting_text";

type RunKnowledgeImportAnalysisOptions = {
  onStageChange?: (
    stage: KnowledgeImportAnalysisStage,
  ) => void;

  onAnalysisReady?: (
    analysis: AnalyzeImportResponse,
  ) => void;

  // Process each file as a complete unit: extract -> recognize -> persist,
  // and only then move to the next file.
  onFileStart?: (file: AnalyzeImportFlowFile, position: number, total: number) => void;
  onFileExtracted?: (
    file: AnalyzeImportFlowFile,
    result: NonNullable<ExtractTextResponse["files"]>[number],
    position: number,
    total: number,
  ) => Promise<void>;
};

export type KnowledgeImportAnalysisResult = {
  importId: string;
  extraction: AnalyzeImportResponse;
  textExtraction: ExtractTextResponse;
};

export type KnowledgeImportProposalResult = {
  importId: string;
  proposal: KnowledgeImportProposal;
};

export type KnowledgeImportProposalProgressStep =
  | "preparing"
  | "analyzing_documents"
  | "reading_knowledge"
  | "designing_structure"
  | "validating_structure"
  | "saving_proposal"
  | "completed";

export type KnowledgeImportProposalProgress = {
  step: KnowledgeImportProposalProgressStep;
  progressPercentage: number;
  message: string;
};

type GenerateProposalStreamEvent =
  | {
      type: "progress";
      progress: KnowledgeImportProposalProgress;
    }
  | {
      type: "completed";
      result: GenerateKnowledgeImportProposalResult;
    }
  | {
      type: "error";
      error: string;
    };

type GenerateKnowledgeImportProposalOptions = {
  onProgress?: (
    progress: KnowledgeImportProposalProgress,
  ) => void;
};

async function readResponse<T>(
  response: Response,
  fallbackError: string,
): Promise<T> {
  const body = (await response
    .json()
    .catch(() => null)) as
    | T
    | ApiErrorBody
    | null;

  if (!response.ok) {
    const errorMessage =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : fallbackError;

    throw new Error(errorMessage);
  }

  return body as T;
}

/*
 * La revisión es una respuesta funcional del pipeline:
 * no debe convertirse en un error genérico que pierda
 * el inventario y los documentos afectados.
 */
async function readImportResponse<T>(
  response: Response,
  fallbackError: string,
): Promise<T> {
  const review = await readKnowledgeImportReview(response);
  if (review) {
    throw new KnowledgeImportReviewRequiredError(review);
  }

  return readResponse<T>(
    response,
    fallbackError,
  );
}

export async function uploadKnowledgeImport(
  formData: FormData,
): Promise<KnowledgeImportUploadResult> {
  const response = await fetch(
    "/api/knowledge/import/upload",
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === "object" && "error" in body &&
      typeof body.error === "string" ? body.error : "No se han podido subir los documentos";
    const code = body && typeof body === "object" && "code" in body &&
      typeof body.code === "string" ? body.code : null;
    throw new Error(`${message} (HTTP ${response.status}${code ? ` · ${code}` : ""})`);
  }
  return readImportResponse<KnowledgeImportUploadResult>(
    response,
    "No se han podido subir los documentos",
  );
}

async function analyzeImport(
  importId: string,
) {
  const response = await fetch(
    `/api/knowledge/import/${importId}/analyze`,
    {
      method: "POST",
    },
  );

  return readImportResponse<AnalyzeImportResponse>(
    response,
    "No se ha podido extraer la documentación",
  );
}

async function extractImportText(
  importId: string,
  fileId?: string,
) {
  const response = await fetch(
    `/api/knowledge/import/${importId}/extract-text`,
    {
      method: "POST",
      headers: fileId ? { "Content-Type": "application/json" } : undefined,
      body: fileId ? JSON.stringify({ fileId }) : undefined,
    },
  );

  return readResponse<ExtractTextResponse>(
    response,
    "No se ha podido leer el contenido de los documentos",
  );
}

async function generateImportProposal(
  importId: string,
  options: GenerateKnowledgeImportProposalOptions,
) {
  const response = await fetch(
    `/api/knowledge/import/${importId}/generate-proposal`,
    {
      method: "POST",
      headers: {
        Accept:
          "application/x-ndjson",
      },
    },
  );

  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as
      | ApiErrorBody
      | null;

    throw new Error(
      body?.error ??
        "No se ha podido iniciar la generación de la propuesta",
    );
  }

  if (!response.body) {
    throw new Error(
      "El servidor no ha iniciado el flujo de generación",
    );
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";

  let completedResult:
    | GenerateKnowledgeImportProposalResult
    | null = null;

  while (true) {
    const {
      done,
      value,
    } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(
      value,
      {
        stream: true,
      },
    );

    const lines =
      buffer.split("\n");

    buffer =
      lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event =
        JSON.parse(
          line,
        ) as GenerateProposalStreamEvent;

      if (
        event.type ===
        "progress"
      ) {
        options.onProgress?.(
          event.progress,
        );
        continue;
      }

      if (
        event.type ===
        "error"
      ) {
        throw new Error(
          event.error,
        );
      }

      completedResult =
        event.result;
    }
  }

  const remainingLine =
    buffer.trim();

  if (remainingLine) {
    const event =
      JSON.parse(
        remainingLine,
      ) as GenerateProposalStreamEvent;

    if (
      event.type ===
      "progress"
    ) {
      options.onProgress?.(
        event.progress,
      );
    } else if (
      event.type ===
      "error"
    ) {
      throw new Error(
        event.error,
      );
    } else {
      completedResult =
        event.result;
    }
  }

  if (!completedResult) {
    throw new Error(
      "La generación terminó sin devolver una propuesta",
    );
  }

  return completedResult;
}

export async function getKnowledgeImportProgress(
  importId: string,
) {
  const response = await fetch(
    `/api/knowledge/import/${importId}/progress`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  return readResponse<KnowledgeImportProgress>(
    response,
    "No se ha podido consultar el progreso de la importación",
  );
}

export async function cancelKnowledgeImport(
  importId: string,
) {
  const response = await fetch(
    `/api/knowledge/import/${importId}/cancel`,
    {
      method: "POST",
    },
  );

  return readResponse<CancelKnowledgeImportResponse>(
    response,
    "No se ha podido cancelar la importacion",
  );
}

export async function confirmKnowledgeImport(
  importId: string,
) {
  const response = await fetch(
    `/api/knowledge/import/${importId}/confirm`,
    {
      method: "POST",
    },
  );

  return readResponse<ConfirmKnowledgeImportResult>(
    response,
    "No se ha podido aplicar la propuesta",
  );
}

export async function runKnowledgeImportAnalysis(
  importId: string,
  options: RunKnowledgeImportAnalysisOptions = {},
): Promise<KnowledgeImportAnalysisResult> {
  options.onStageChange?.("analyzing");
  const extraction = await analyzeImport(importId);
  options.onAnalysisReady?.(extraction);

  if (extraction.fileCount === 0) {
    return {
      importId,
      extraction,
      textExtraction: {
        importId, status: "text_ready", processingStatus: "completed",
        totalFiles: 0, successfulFiles: 0, failedFiles: 0, totalCharacters: 0,
        files: [],
      },
    };
  }

  options.onStageChange?.("extracting_text");
  const queue = extraction.files.filter(file => file.status === "ready")
    .sort((a, b) => (a.processingOrder ?? 0) - (b.processingOrder ?? 0));
  const results: NonNullable<ExtractTextResponse["files"]> = [];

  // Sequential, awaited iteration. Recognition happens inside onFileExtracted
  // before the next extraction request is made.
  for (let index = 0; index < queue.length; index++) {
    const file = queue[index];
    options.onFileStart?.(file, index + 1, queue.length);
    const response = await extractImportText(importId, file.id);
    const extracted = response.files?.find(item => item.id === file.id);
    if (!extracted) throw new Error(`La extracción de ${file.name} no devolvió un resultado de archivo`);
    results.push(extracted);
    await options.onFileExtracted?.(file, extracted, index + 1, queue.length);
  }

  const successfulFiles = results.filter(file => file.status === "text_ready").length;
  const failedFiles = results.length - successfulFiles;
  return {
    importId, extraction,
    textExtraction: {
      importId,
      status: successfulFiles ? "text_ready" : "text_error",
      processingStatus: successfulFiles ? "completed" : "error",
      totalFiles: queue.length, successfulFiles, failedFiles,
      totalCharacters: results.reduce((sum, file) =>
        sum + (file.status === "text_ready" ? (file.characters ?? 0) : 0), 0),
      files: results,
    },
  };
}

export async function generateKnowledgeImportProposal(
  importId: string,
  options: GenerateKnowledgeImportProposalOptions = {},
): Promise<KnowledgeImportProposalResult> {
  const proposalResult =
    await generateImportProposal(
      importId,
      options,
    );

  return {
    importId,
    proposal:
      proposalResult.proposal,
  };
}

export async function reviewKnowledgeImportBatch(importId: string): Promise<ImportInventory> {
  const response = await fetch(`/api/knowledge/import/${encodeURIComponent(importId)}/review-batch`, {
    method: "POST",
  });
  const result = await readResponse<{ map: ImportInventory }>(response, "No se ha podido revisar el lote completo");
  if (result.map?.batchReview?.status !== "reviewed") throw new Error("La revisión del lote no está completa");
  return result.map;
}
