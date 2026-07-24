// components/knowledge/import/knowledge-import-api.ts

import type {
  GenerateKnowledgeImportProposalResult,
  KnowledgeImportProposal,
} from "@/lib/knowledge/import/types";

type ApiErrorBody = {
  error?: string;
};

type AnalyzeImportResponse = {
  importId: string;
  status: "extracted";
  processingStatus: string;
  fileCount: number;
  completedFiles: number;
  failedFiles: number;
  totalSize: number;
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
};

export type KnowledgeImportProgressFile = {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  status: string;
  processingOrder: number | null;
  processingStatus: string | null;
  processingStep: string | null;
  startedAt: string | null;
  completedAt: string | null;
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

  onProgress?: (
    progress: KnowledgeImportProgress,
  ) => void;
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

async function analyzeImport(
  importId: string,
) {
  const response = await fetch(
    `/api/knowledge/import/${importId}/analyze`,
    {
      method: "POST",
    },
  );

  return readResponse<AnalyzeImportResponse>(
    response,
    "No se ha podido extraer la documentación",
  );
}

async function extractImportText(
  importId: string,
) {
  const response = await fetch(
    `/api/knowledge/import/${importId}/extract-text`,
    {
      method: "POST",
    },
  );

  return readResponse<ExtractTextResponse>(
    response,
    "No se ha podido leer el contenido de los documentos",
  );
}

async function generateImportProposal(
  importId: string,
) {
  const response = await fetch(
    `/api/knowledge/import/${importId}/generate-proposal`,
    {
      method: "POST",
    },
  );

  return readResponse<GenerateKnowledgeImportProposalResult>(
    response,
    "No se ha podido generar la propuesta de organización",
  );
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

function startProgressPolling(
  importId: string,
  onProgress:
    | ((
        progress: KnowledgeImportProgress,
      ) => void)
    | undefined,
) {
  if (!onProgress) {
    return () => undefined;
  }

  const progressCallback = onProgress;

  let stopped = false;
  let timeoutId:
    | ReturnType<typeof setTimeout>
    | null = null;

  async function poll() {
    if (stopped) {
      return;
    }

    try {
      const progress =
        await getKnowledgeImportProgress(
          importId,
        );

      if (!stopped) {
        progressCallback(progress);
      }
    } catch (error) {
      console.error(
        "Error polling knowledge import progress:",
        error,
      );
    }

    if (!stopped) {
      timeoutId = setTimeout(
        poll,
        750,
      );
    }
  }

  void poll();

  return () => {
    stopped = true;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}

export async function runKnowledgeImportAnalysis(
  importId: string,
  options: RunKnowledgeImportAnalysisOptions = {},
): Promise<KnowledgeImportAnalysisResult> {
  options.onStageChange?.("analyzing");

  const extraction =
    await analyzeImport(importId);

  options.onStageChange?.(
    "extracting_text",
  );

  const stopPolling =
    startProgressPolling(
      importId,
      options.onProgress,
    );

  let textExtraction: ExtractTextResponse;

  try {
    textExtraction =
      await extractImportText(importId);

    const finalProgress =
      await getKnowledgeImportProgress(
        importId,
      ).catch(() => null);

    if (finalProgress) {
      options.onProgress?.(
        finalProgress,
      );
    }
  } finally {
    stopPolling();
  }

  return {
    importId,
    extraction,
    textExtraction,
  };
}

export async function generateKnowledgeImportProposal(
  importId: string,
): Promise<KnowledgeImportProposalResult> {
  const proposalResult =
    await generateImportProposal(
      importId,
    );

  return {
    importId,
    proposal:
      proposalResult.proposal,
  };
}