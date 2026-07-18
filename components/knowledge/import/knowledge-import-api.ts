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
  fileCount: number;
  totalSize: number;
};

type ExtractTextResponse = {
  importId: string;
  status:
    | "text_ready"
    | "text_error";
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalCharacters: number;
};

export type KnowledgeImportPipelineResult = {
  importId: string;

  extraction: AnalyzeImportResponse;

  textExtraction: ExtractTextResponse;

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

export async function runKnowledgeImportPipeline(
  importId: string,
): Promise<KnowledgeImportPipelineResult> {
  const extraction =
    await analyzeImport(importId);

  const textExtraction =
    await extractImportText(importId);

  if (
    textExtraction.successfulFiles === 0
  ) {
    throw new Error(
      "No se ha podido obtener texto de ninguno de los documentos",
    );
  }

  const proposalResult =
    await generateImportProposal(
      importId,
    );

  return {
    importId,
    extraction,
    textExtraction,
    proposal:
      proposalResult.proposal,
  };
}