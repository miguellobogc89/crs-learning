// lib/knowledge/import/generate-proposal.ts
import {
  getKnowledgeImportModel,
  getOpenAIClient,
} from "@/lib/ai/openai";
import { prisma } from "@/lib/prisma";
import type { ImportInventory } from "./build-import-map";
import { reviewKnowledgeImportBatch } from "./review-import-batch.service";
import { assertReviewedImportBatch, reviewedDocumentRoutes } from "./review-import-batch";
import { listKnowledgeStatus } from "@/lib/services/knowledge-library.service";

import {
  analyzeKnowledgeDocuments,
} from "./analyze-documents";
import {
  PROPOSAL_JSON_SCHEMA,
  PROPOSAL_SYSTEM_PROMPT,
  buildProposalPrompt,
} from "./proposal-prompts";
import {
  truncateDocument,
} from "./truncate-document";
import type {
  GenerateKnowledgeImportProposalResult,
  KnowledgeImportDocumentAnalysis,
  KnowledgeImportDocumentInput,
  KnowledgeImportProposal,
} from "./types";

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

type ProposalProgressCallback = (
  progress: KnowledgeImportProposalProgress,
) => void | Promise<void>;

type GenerateProposalInput = {
  importId: string;
  userId: string;
  workspaceId: string;
  onProgress?: ProposalProgressCallback;
};

async function isImportCancelled(
  importId: string,
) {
  const knowledgeImport =
    await prisma.knowledge_imports.findUnique({
      where: {
        id: importId,
      },
      select: {
        status: true,
        processing_status: true,
      },
    });

  return (
    knowledgeImport?.status ===
      "cancelled" ||
    knowledgeImport?.processing_status ===
      "cancelled"
  );
}

type ExistingKnowledge = Awaited<
  ReturnType<typeof listKnowledgeStatus>
>;

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
      `La IA ha devuelto una respuesta JSON no vÃ¡lida durante ${context}`,
    );
  }
}

function getExistingArticles(
  existingKnowledge: ExistingKnowledge,
) {
  return existingKnowledge.flatMap(
    (library) =>
      library.knowledge_sources,
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
        `La propuesta contiene un artÃ­culo duplicado: ${article.id}`,
      );
    }

    articleIds.add(article.id);

    if (
      article.action !== "create" &&
      article.action !== "update"
    ) {
      throw new Error(
        `El artÃ­culo ${article.id} contiene una acciÃ³n invÃ¡lida`,
      );
    }

    if (article.action === "create") {
      if (article.existingArticleId !== null) {
        throw new Error(
          `El artÃ­culo nuevo ${article.id} no puede apuntar a un artÃ­culo existente`,
        );
      }

      if (
        article.folderId &&
        !validFolderIds.has(article.folderId)
      ) {
        throw new Error(
          `El artÃ­culo ${article.id} apunta a una carpeta inexistente`,
        );
      }
    }

    if (article.action === "update") {
      if (!article.existingArticleId) {
        throw new Error(
          `El artÃ­culo ${article.id} debe indicar el artÃ­culo existente que actualizarÃ¡`,
        );
      }

      if (
        !existingArticlesById.has(
          article.existingArticleId,
        )
      ) {
        throw new Error(
          `El artÃ­culo ${article.id} intenta actualizar un artÃ­culo existente desconocido: ${article.existingArticleId}`,
        );
      }

      if (article.folderId !== null) {
        throw new Error(
          `El artÃ­culo actualizado ${article.id} debe conservar su carpeta actual`,
        );
      }
    }

    if (
      article.documentIds.length !==
      article.documentNames.length
    ) {
      throw new Error(
        `El artÃ­culo ${article.id} contiene un nÃºmero distinto de IDs y nombres de documento`,
      );
    }

    for (const documentId of article.documentIds) {
      if (!validDocumentIds.has(documentId)) {
        throw new Error(
          `El artÃ­culo ${article.id} contiene un documento desconocido: ${documentId}`,
        );
      }

      if (assignedDocumentIds.has(documentId)) {
        throw new Error(
          `El documento ${documentId} ha sido asignado a mÃ¡s de un artÃ­culo`,
        );
      }

      assignedDocumentIds.add(documentId);
    }
  }

  for (const documentId of validDocumentIds) {
    if (!assignedDocumentIds.has(documentId)) {
      throw new Error(
        `El documento ${documentId} no ha sido asignado a ningÃºn artÃ­culo`,
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
      "El total de artÃ­culos de la propuesta no coincide con la estructura generada",
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

async function generateGlobalProposal(
  inventory: ImportInventory,
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
    input: buildProposalPrompt(analyses, existingKnowledge) +
      "\nRevisión conjunta del lote (agrupa artículos cuando el propósito común lo justifique; los IDs de origen de los documentos lógicos corresponden a fileId):\n" +
      JSON.stringify({ groups: inventory.batchReview?.groups, documents: inventory.documents }),
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
    "la generaciÃ³n de la propuesta",
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
  workspaceId,
  onProgress,
}: GenerateProposalInput): Promise<GenerateKnowledgeImportProposalResult> {
  await onProgress?.({
    step: "preparing",
    progressPercentage: 3,
    message:
      "Preparando los documentos vÃ¡lidos",
  });

  await onProgress?.({ step: "preparing", progressPercentage: 5,
    message: "Revisando el lote completo y sus destinos" });
  // Also covers resumed imports. A persisted review is reused only while its
  // source fingerprint matches; individual classifications cannot bypass it.
  const reviewedInventory = await reviewKnowledgeImportBatch({ importId, userId, workspaceId });

  const knowledgeImport =
    await prisma.knowledge_imports.findFirst({
      where: {
        id: importId,
        owner_user_id: userId,
        knowledge_libraries: {
          workspace_id: workspaceId,
        },
      },
      include: {
        knowledge_import_files: {
          orderBy: {
            created_at: "asc",
          },
        },
      },
    });

  if (!knowledgeImport) {
    throw new Error(
      "ImportaciÃ³n no encontrada",
    );
  }

  if (
    knowledgeImport.status ===
      "cancelled" ||
    knowledgeImport.processing_status ===
      "cancelled"
  ) {
    throw new Error(
      "La importacion ha sido cancelada",
    );
  }

  if (
    knowledgeImport.status ===
    "proposal_generating"
  ) {
    throw new Error(
      "La propuesta ya se estÃ¡ generando",
    );
  }

  if (
    knowledgeImport.status !==
      "text_ready" &&
    knowledgeImport.status !==
      "proposal_ready"
  ) {
    throw new Error(
      "La importaciÃ³n todavÃ­a no estÃ¡ preparada para generar una propuesta",
    );
  }

  const files =
    knowledgeImport.knowledge_import_files.filter(file => file.status === "text_ready");

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

  await onProgress?.({
    step: "preparing",
    progressPercentage: 8,
    message: `${documents.length} documentos preparados`,
  });

  // The document inventory is the authoritative routing step. Do not
  // allow legacy "every document must become an article" logic to bypass it.
  const inventory = reviewedInventory;
  assertReviewedImportBatch(inventory, knowledgeImport.knowledge_import_files);
  const currentPayload = knowledgeImport.proposal_json;
  const currentMap = currentPayload && typeof currentPayload === "object" && !Array.isArray(currentPayload)
    ? currentPayload.globalImportMap : null;
  if (!currentMap || typeof currentMap !== "object" || Array.isArray(currentMap) ||
    !currentMap.batchReview || typeof currentMap.batchReview !== "object" || Array.isArray(currentMap.batchReview) ||
    currentMap.batchReview.sourceFingerprint !== inventory.batchReview?.sourceFingerprint) {
    throw new Error("El inventario cambió después de revisar el lote. Repite la revisión.");
  }

  const documentRoutes = reviewedDocumentRoutes(inventory, knowledgeImport.knowledge_import_files);
  const articleDocuments = documents.filter(document => documentRoutes[document.id].articleCandidate);

  const claimed = await prisma.knowledge_imports.updateMany({
    where: {
      id: importId,
      updated_at: knowledgeImport.updated_at,
      status: { in: ["text_ready", "proposal_ready"] },
      processing_status: { notIn: ["cancelled", "processing"] },
    },
    data: {
      status: "proposal_generating",
      error_message: null,
      updated_at: new Date(),
    },
  });

  if (claimed.count !== 1) throw new Error("La importación cambió antes de generar la propuesta.");

  try {
    const documentAnalyses =
      articleDocuments.length > 0
        ? await analyzeKnowledgeDocuments(
        articleDocuments,
        {
          onProgress: async ({
            analyzedDocuments,
            totalDocuments,
            batchIndex,
            totalBatches,
          }) => {
            await onProgress?.({
              step:
                "analyzing_documents",
              progressPercentage:
                10 +
                Math.round(
                  (
                    analyzedDocuments /
                    totalDocuments
                  ) * 55,
                ),
              message:
                totalBatches === 1
                  ? `${analyzedDocuments} de ${totalDocuments} documentos comprendidos`
                  : `Lote ${batchIndex} de ${totalBatches} Â· ${analyzedDocuments} de ${totalDocuments} documentos comprendidos`,
            });
          },
        },
      )
        : [];

    await onProgress?.({
      step: "reading_knowledge",
      progressPercentage: 70,
      message:
        "Revisando la estructura actual de Knowledge",
    });

    // Only existing ARTICLES may be reused as article destinations.
    // Independent reference documents are context, not updateable articles.
    const existingKnowledge = (await listKnowledgeStatus(
      userId,
      workspaceId,
    )).map(library => ({
      ...library,
      knowledge_sources: library.knowledge_sources.filter(
        source => source.knowledge_type !== "document",
      ),
    }));

    await onProgress?.({
      step: "designing_structure",
      progressPercentage: 76,
      message:
        "Definiendo carpetas y artí­culos",
    });

    const generatedProposal: GeneratedProposal =
      articleDocuments.length > 0
        ? await generateGlobalProposal(
            inventory,
            documentAnalyses,
            existingKnowledge,
          )
        : {
            title: "Documentos de consulta",
            description: "Los archivos se conservarán en Knowledge sin generar artículos innecesarios. Los candidatos a JSON no se insertarán automáticamente en Engine.",
            summary: { totalDocuments: 0, totalFolders: 0, totalArticles: 0, totalWarnings: 0 },
            folders: [],
            articles: [],
            warnings: [],
          };

    await onProgress?.({
      step: "validating_structure",
      progressPercentage: 91,
      message:
        "Validando la estructura propuesta",
    });

    // Preserve the original sources and their document-first routing decisions.
    // "totalDocuments" counts ALL sources, not merely sources assigned to an article.
    const proposal: KnowledgeImportProposal = {
      ...generatedProposal,
      summary: { ...generatedProposal.summary, totalDocuments: documents.length },
      documentAnalyses,
      documentRoutes,
      globalImportMap: inventory,
    };

    await onProgress?.({
      step: "saving_proposal",
      progressPercentage: 96,
      message:
        "Guardando la propuesta",
    });

    if (
      await isImportCancelled(
        importId,
      )
    ) {
      throw new Error(
        "La importacion ha sido cancelada",
      );
    }

    await prisma.knowledge_imports.updateMany({
      where: {
        id: importId,
        status: {
          not: "cancelled",
        },
        processing_status: {
          not: "cancelled",
        },
      },
      data: {
        status: "proposal_ready",
        proposal_json: proposal,
        error_message: null,
        updated_at: new Date(),
      },
    });

    await onProgress?.({
      step: "completed",
      progressPercentage: 100,
      message:
        "Estructura definida correctamente",
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
      .updateMany({
        where: {
          id: importId,
          status: {
            not: "cancelled",
          },
          processing_status: {
            not: "cancelled",
          },
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
