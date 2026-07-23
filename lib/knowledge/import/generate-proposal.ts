// lib/knowledge/import/generate-proposal.ts
import {
  getKnowledgeImportModel,
  getOpenAIClient,
} from "@/lib/ai/openai";
import { prisma } from "@/lib/prisma";
import { listKnowledgeStatus } from "@/lib/services/knowledge-library.service";

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

type ExistingKnowledge = Awaited<
  ReturnType<typeof listKnowledgeStatus>
>;

type ExistingArticle =
  ExistingKnowledge[number]["knowledge_sources"][number];

type GeneratedProposal = Omit<
  KnowledgeImportProposal,
  "documentAnalyses"
>;

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

function normalizeComparableText(
  value: string,
) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsUpdateIntent(
  value: string,
) {
  const normalizedValue =
    normalizeComparableText(value);

  const updateExpressions = [
    "actualizar",
    "actualizacion",
    "ampliar",
    "ampliacion",
    "completar",
    "corregir",
    "correccion",
    "sustituir",
    "sustitucion",
    "incorporar",
    "incorporacion",
    "integrar",
    "integracion",
    "unificar",
    "unificacion",
    "consolidar",
    "consolidacion",
    "nueva version",
    "version actualizada",
    "material complementario",
    "complementar",
  ];

  return updateExpressions.some(
    (expression) =>
      normalizedValue.includes(expression),
  );
}

function getExistingArticles(
  existingKnowledge: ExistingKnowledge,
) {
  return existingKnowledge.flatMap(
    (library) =>
      library.knowledge_sources,
  );
}

function getArticleNarrative(
  article: GeneratedProposal["articles"][number],
  proposal: GeneratedProposal,
) {
  const articleDocumentIds = new Set(
    article.documentIds,
  );

  const relatedWarnings =
    proposal.warnings.filter((warning) =>
      warning.documentIds.some(
        (documentId) =>
          articleDocumentIds.has(documentId),
      ),
    );

  return [
    article.title,
    article.description,
    ...relatedWarnings.flatMap(
      (warning) => [
        warning.title,
        warning.description,
        warning.suggestedAction,
      ],
    ),
  ].join("\n");
}

function findReferencedExistingArticles(
  article: GeneratedProposal["articles"][number],
  narrative: string,
  existingArticles: ExistingArticle[],
) {
  const normalizedNarrative =
    normalizeComparableText(narrative);

  const normalizedProposedTitle =
    normalizeComparableText(article.title);

  return existingArticles.filter(
    (existingArticle) => {
      const normalizedExistingTitle =
        normalizeComparableText(
          existingArticle.title,
        );

      if (!normalizedExistingTitle) {
        return false;
      }

      if (
        normalizedProposedTitle ===
        normalizedExistingTitle
      ) {
        return true;
      }

      return normalizedNarrative.includes(
        normalizedExistingTitle,
      );
    },
  );
}

function normalizeGeneratedProposalSemantics(
  proposal: GeneratedProposal,
  existingKnowledge: ExistingKnowledge,
): GeneratedProposal {
  const existingArticles =
    getExistingArticles(existingKnowledge);

  const existingArticlesById = new Map(
    existingArticles.map(
      (article) =>
        [article.id, article] as const,
    ),
  );

  const normalizedArticles =
    proposal.articles.map((article) => {
      if (article.action !== "update") {
        return article;
      }

      if (!article.existingArticleId) {
        return article;
      }

      const existingArticle =
        existingArticlesById.get(
          article.existingArticleId,
        );

      if (!existingArticle) {
        return article;
      }

      return {
        ...article,
        title: existingArticle.title,
        folderId: null,
      };
    });

  return {
    ...proposal,
    articles: normalizedArticles,
  };
}

function validateGeneratedProposal(
  proposal: Omit<
    KnowledgeImportProposal,
    "documentAnalyses"
  >,
  analyses: KnowledgeImportDocumentAnalysis[],
  existingKnowledge: Awaited<
    ReturnType<typeof listKnowledgeStatus>
  >,
) {
  const validDocumentIds = new Set(
    analyses.map(
      (analysis) => analysis.documentId,
    ),
  );

  const existingArticlesById = new Map(
    existingKnowledge.flatMap((library) =>
      library.knowledge_sources.map((article) => [
        article.id,
        article,
      ] as const),
    ),
  );

const existingFolderIds = new Set(
  existingKnowledge.map(
    (library) => library.id,
  ),
);

const proposedFolderIds = new Set<string>();

const validFolderIds = new Set(
  existingFolderIds,
);
  const articleIds = new Set<string>();
  const assignedDocumentIds = new Set<string>();

for (const folder of proposal.folders) {
  if (proposedFolderIds.has(folder.id)) {
    throw new Error(
      `La propuesta contiene una carpeta duplicada: ${folder.id}`,
    );
  }

  proposedFolderIds.add(folder.id);
  validFolderIds.add(folder.id);
}

  for (const folder of proposal.folders) {
    if (
      folder.parentFolderId &&
      !validFolderIds.has(folder.parentFolderId)
    ) {
      throw new Error(
        `La carpeta ${folder.id} apunta a una carpeta padre inexistente`,
      );
    }

    if (folder.parentFolderId === folder.id) {
      throw new Error(
        `La carpeta ${folder.id} no puede ser su propia carpeta padre`,
      );
    }
  }

  for (const article of proposal.articles) {
    if (articleIds.has(article.id)) {
      throw new Error(
        `La propuesta contiene un artículo duplicado: ${article.id}`,
      );
    }

    articleIds.add(article.id);

    if (
      article.action !== "create" &&
      article.action !== "update"
    ) {
      throw new Error(
        `El artículo ${article.id} contiene una acción inválida`,
      );
    }

    if (article.action === "create") {
      if (article.existingArticleId !== null) {
        throw new Error(
          `El artículo nuevo ${article.id} no puede apuntar a un artículo existente`,
        );
      }

      if (
        article.folderId &&
        !validFolderIds.has(article.folderId)
      ) {
        throw new Error(
          `El artículo ${article.id} apunta a una carpeta inexistente`,
        );
      }
    }

    if (article.action === "update") {
      if (!article.existingArticleId) {
        throw new Error(
          `El artículo ${article.id} debe indicar el artículo existente que actualizará`,
        );
      }

      if (
        !existingArticlesById.has(
          article.existingArticleId,
        )
      ) {
        throw new Error(
          `El artículo ${article.id} intenta actualizar un artículo existente desconocido: ${article.existingArticleId}`,
        );
      }

      if (article.folderId !== null) {
        throw new Error(
          `El artículo actualizado ${article.id} debe conservar su carpeta actual`,
        );
      }
    }

    if (
      article.documentIds.length !==
      article.documentNames.length
    ) {
      throw new Error(
        `El artículo ${article.id} contiene un número distinto de IDs y nombres de documento`,
      );
    }

    for (const documentId of article.documentIds) {
      if (!validDocumentIds.has(documentId)) {
        throw new Error(
          `El artículo ${article.id} contiene un documento desconocido: ${documentId}`,
        );
      }

      if (assignedDocumentIds.has(documentId)) {
        throw new Error(
          `El documento ${documentId} ha sido asignado a más de un artículo`,
        );
      }

      assignedDocumentIds.add(documentId);
    }
  }

  for (const documentId of validDocumentIds) {
    if (!assignedDocumentIds.has(documentId)) {
      throw new Error(
        `El documento ${documentId} no ha sido asignado a ningún artículo`,
      );
    }
  }

  if (
    proposal.summary.totalDocuments !==
    validDocumentIds.size
  ) {
    throw new Error(
      "El total de documentos de la propuesta no coincide con los documentos analizados",
    );
  }

  if (
    proposal.summary.totalFolders !==
    proposal.folders.length
  ) {
    throw new Error(
      "El total de carpetas de la propuesta no coincide con la estructura generada",
    );
  }

  if (
    proposal.summary.totalArticles !==
    proposal.articles.length
  ) {
    throw new Error(
      "El total de artículos de la propuesta no coincide con la estructura generada",
    );
  }

  if (
    proposal.summary.totalWarnings !==
    proposal.warnings.length
  ) {
    throw new Error(
      "El total de avisos de la propuesta no coincide con los avisos generados",
    );
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
  existingKnowledge: Awaited<
    ReturnType<typeof listKnowledgeStatus>
  >,
) {
  const openai = getOpenAIClient();
  const model = getKnowledgeImportModel();

  const response = await openai.responses.create({
    model,
    instructions: PROPOSAL_SYSTEM_PROMPT,
    input: buildProposalPrompt(
      analyses,
      existingKnowledge,
    ),
    text: {
      format: {
        type: "json_schema",
        name: "knowledge_import_proposal",
        strict: true,
        schema: PROPOSAL_JSON_SCHEMA,
      },
    },
  });

const parsedProposal =
  parseJsonResponse<GeneratedProposal>(
    response.output_text,
    "la generación de la propuesta",
  );

const normalizedProposal =
  normalizeGeneratedProposalSemantics(
    parsedProposal,
    existingKnowledge,
  );

  console.log(
  "[knowledge-import] parsed proposal",
  JSON.stringify(parsedProposal, null, 2),
);

console.log(
  "[knowledge-import] normalized proposal",
  JSON.stringify(
    normalizedProposal,
    null,
    2,
  ),
);

validateGeneratedProposal(
  normalizedProposal,
  analyses,
  existingKnowledge,
);

return normalizedProposal;

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

const existingKnowledge =
  await listKnowledgeStatus(userId);

const generatedProposal =
  await generateGlobalProposal(
    documentAnalyses,
    existingKnowledge,
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