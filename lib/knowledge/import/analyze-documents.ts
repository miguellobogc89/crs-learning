// lib/knowledge/import/analyze-documents.ts

import {
  getKnowledgeImportModel,
  getOpenAIClient,
} from "@/lib/ai/openai";

import {
  DOCUMENT_ANALYSIS_JSON_SCHEMA,
  DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
  buildDocumentAnalysisPrompt,
} from "./proposal-prompts";
import {
  splitIntoBatches,
} from "./truncate-document";
import type {
  KnowledgeImportDocumentAnalysis,
  KnowledgeImportDocumentInput,
} from "./types";

const DOCUMENTS_PER_ANALYSIS_BATCH = 4;

type DocumentAnalysisResponse = {
  documents: KnowledgeImportDocumentAnalysis[];
};

export type KnowledgeDocumentAnalysisProgress = {
  analyzedDocuments: number;
  totalDocuments: number;
  batchIndex: number;
  totalBatches: number;
};

type AnalyzeKnowledgeDocumentsOptions = {
  onProgress?: (
    progress: KnowledgeDocumentAnalysisProgress,
  ) => void | Promise<void>;
};

function parseDocumentAnalysisResponse(
  responseText: string,
) {
  if (!responseText.trim()) {
    throw new Error(
      "La IA no ha devuelto contenido durante el análisis documental",
    );
  }

  try {
    return JSON.parse(
      responseText,
    ) as DocumentAnalysisResponse;
  } catch {
    throw new Error(
      "La IA ha devuelto una respuesta JSON no válida durante el análisis documental",
    );
  }
}

function validateDocumentAnalyses(
  analyses: KnowledgeImportDocumentAnalysis[],
  expectedDocuments: KnowledgeImportDocumentInput[],
) {
  const expectedIds = new Set(
    expectedDocuments.map(
      (document) => document.id,
    ),
  );

  const receivedIds = new Set(
    analyses.map(
      (analysis) => analysis.documentId,
    ),
  );

  for (const documentId of expectedIds) {
    if (!receivedIds.has(documentId)) {
      throw new Error(
        `La IA no ha analizado el documento ${documentId}`,
      );
    }
  }

  for (const documentId of receivedIds) {
    if (!expectedIds.has(documentId)) {
      throw new Error(
        `La IA ha devuelto un documento desconocido: ${documentId}`,
      );
    }
  }

  if (
    receivedIds.size !==
    analyses.length
  ) {
    throw new Error(
      "La IA ha devuelto análisis documentales duplicados",
    );
  }
}

async function analyzeDocumentBatch(
  documents: KnowledgeImportDocumentInput[],
) {
  const openai = getOpenAIClient();
  const model = getKnowledgeImportModel();

  const response =
    await openai.responses.create({
      model,
      instructions:
        DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
      input:
        buildDocumentAnalysisPrompt(
          documents,
        ),
      text: {
        format: {
          type: "json_schema",
          name: "knowledge_document_analysis",
          strict: true,
          schema:
            DOCUMENT_ANALYSIS_JSON_SCHEMA,
        },
      },
    });

  const parsed =
    parseDocumentAnalysisResponse(
      response.output_text,
    );

  validateDocumentAnalyses(
    parsed.documents,
    documents,
  );

  return parsed.documents;
}

export async function analyzeKnowledgeDocuments(
  documents: KnowledgeImportDocumentInput[],
  options: AnalyzeKnowledgeDocumentsOptions = {},
) {
  if (documents.length === 0) {
    throw new Error(
      "No hay documentos disponibles para analizar",
    );
  }

  const batches = splitIntoBatches(
    documents,
    DOCUMENTS_PER_ANALYSIS_BATCH,
  );

  const analyses: KnowledgeImportDocumentAnalysis[] =
    [];

  for (
    let batchIndex = 0;
    batchIndex < batches.length;
    batchIndex += 1
  ) {
    const batch = batches[batchIndex];

    const batchAnalyses =
      await analyzeDocumentBatch(batch);

    analyses.push(...batchAnalyses);

    await options.onProgress?.({
      analyzedDocuments:
        analyses.length,
      totalDocuments:
        documents.length,
      batchIndex:
        batchIndex + 1,
      totalBatches:
        batches.length,
    });
  }

  return analyses;
}
