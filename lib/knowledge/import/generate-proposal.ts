// lib/knowledge/import/generate-proposal.ts
import {
  getKnowledgeImportModel,
  getOpenAIClient,
} from "@/lib/ai/openai";
import { prisma } from "@/lib/prisma";

import {
  DOCUMENT_ANALYSIS_JSON_SCHEMA,
  DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
  PROPOSAL_JSON_SCHEMA,
  PROPOSAL_SYSTEM_PROMPT,
  buildDocumentAnalysisPrompt,
  buildProposalPrompt,
} from "./proposal-prompts";
import {
  splitIntoBatches,
  truncateDocument,
} from "./truncate-document";
import type {
  GenerateKnowledgeImportProposalResult,
  KnowledgeImportDocumentAnalysis,
  KnowledgeImportDocumentInput,
  KnowledgeImportProposal,
} from "./types";

const DOCUMENTS_PER_ANALYSIS_BATCH = 4;

type GenerateProposalInput = {
  importId: string;
  userId: string;
};

type DocumentAnalysisResponse = {
  documents: KnowledgeImportDocumentAnalysis[];
};

function parseJsonResponse<T>(
  responseText: string,
  context: string,
): T {
  if (!responseText.trim()) {
    throw new Error(
      `La IA no ha devuelto contenido durante ${context}`,
    );
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(
      `La IA ha devuelto una respuesta JSON no válida durante ${context}`,
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
}

async function analyzeDocumentBatch(
  documents: KnowledgeImportDocumentInput[],
) {
  const openai = getOpenAIClient();
  const model = getKnowledgeImportModel();

  const response = await openai.responses.create({
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
    parseJsonResponse<DocumentAnalysisResponse>(
      response.output_text,
      "el análisis documental",
    );

  validateDocumentAnalyses(
    parsed.documents,
    documents,
  );

  return parsed.documents;
}

async function analyzeDocuments(
  documents: KnowledgeImportDocumentInput[],
) {
  const batches = splitIntoBatches(
    documents,
    DOCUMENTS_PER_ANALYSIS_BATCH,
  );

  const analyses: KnowledgeImportDocumentAnalysis[] =
    [];

  /*
   * Los lotes se procesan secuencialmente para no
   * lanzar muchas llamadas simultáneas ni provocar
   * límites de concurrencia innecesarios.
   */
  for (const batch of batches) {
    const batchAnalyses =
      await analyzeDocumentBatch(batch);

    analyses.push(...batchAnalyses);
  }

  return analyses;
}

async function generateGlobalProposal(
  analyses: KnowledgeImportDocumentAnalysis[],
) {
  const openai = getOpenAIClient();
  const model = getKnowledgeImportModel();

  const response = await openai.responses.create({
    model,
    instructions: PROPOSAL_SYSTEM_PROMPT,
    input: buildProposalPrompt(analyses),
    text: {
      format: {
        type: "json_schema",
        name: "knowledge_import_proposal",
        strict: true,
        schema: PROPOSAL_JSON_SCHEMA,
      },
    },
  });

  return parseJsonResponse<
    Omit<
      KnowledgeImportProposal,
      "documentAnalyses"
    >
  >(
    response.output_text,
    "la generación de la propuesta",
  );
}

export async function generateKnowledgeImportProposal({
  importId,
  userId,
}: GenerateProposalInput): Promise<GenerateKnowledgeImportProposalResult> {
  const knowledgeImport =
    await prisma.knowledge_imports.findFirst({
      where: {
        id: importId,
        owner_user_id: userId,
      },
      include: {
        knowledge_import_files: {
          where: {
            status: "text_ready",
          },
          orderBy: {
            created_at: "asc",
          },
        },
      },
    });

  if (!knowledgeImport) {
    throw new Error(
      "Importación no encontrada",
    );
  }

  if (
    knowledgeImport.status ===
    "proposal_generating"
  ) {
    throw new Error(
      "La propuesta ya se está generando",
    );
  }

  if (
    knowledgeImport.status !==
      "text_ready" &&
    knowledgeImport.status !==
      "proposal_ready"
  ) {
    throw new Error(
      "La importación todavía no está preparada para generar una propuesta",
    );
  }

  const files =
    knowledgeImport.knowledge_import_files;

  if (files.length === 0) {
    throw new Error(
      "No hay documentos con texto disponible para analizar",
    );
  }

  const documents: KnowledgeImportDocumentInput[] =
    files.map((file) => ({
      id: file.id,
      name: file.file_name,
      relativePath:
        file.relative_path,
      text: truncateDocument(
        file.extracted_text,
      ),
    }));

  await prisma.knowledge_imports.update({
    where: {
      id: importId,
    },
    data: {
      status: "proposal_generating",
      error_message: null,
      updated_at: new Date(),
    },
  });

  try {
    const documentAnalyses =
      await analyzeDocuments(documents);

    const generatedProposal =
      await generateGlobalProposal(
        documentAnalyses,
      );

    const proposal: KnowledgeImportProposal = {
      ...generatedProposal,
      documentAnalyses,
    };

    await prisma.knowledge_imports.update({
      where: {
        id: importId,
      },
      data: {
        status: "proposal_ready",
        proposal_json: proposal,
        error_message: null,
        updated_at: new Date(),
      },
    });

    return {
      importId,
      status: "proposal_ready",
      proposal,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "No se ha podido generar la propuesta";

    await prisma.knowledge_imports
      .update({
        where: {
          id: importId,
        },
        data: {
          status: "text_ready",
          error_message: errorMessage,
          updated_at: new Date(),
        },
      })
      .catch(() => undefined);

    throw error;
  }
}