// components/knowledge/import/knowledge-import-api.ts

import type {
  GenerateKnowledgeImportProposalResult,
  KnowledgeImportProposal,
} from "@/lib/knowledge/import/types";

type ApiErrorBody = {
  error?: string;
};

export type KnowledgeImportDuplicateFile = {
  name: string;
  relativePath: string;
  size: number;
  existingFileId: string;
  existingArticleId: string;
  existingArticleTitle: string;
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

  /*
   * Si todos los documentos ya existen, detenemos
   * aquí el proceso. No extraemos texto ni llamamos
   * posteriormente a la IA.
   */
  if (extraction.allFilesDuplicate) {
    return {
      importId,
      extraction,
      textExtraction: {
        importId,
        status: "text_ready",
        processingStatus: "completed",
        totalFiles: 0,
        successfulFiles: 0,
        failedFiles: 0,
        totalCharacters: 0,
      },
    };
  }

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
