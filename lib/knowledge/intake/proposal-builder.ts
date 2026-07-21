// lib/knowledge/intake/proposal-builder.ts

import type { ResolvedKnowledgeIntakeContext } from "./resolve-intake-context";
import type {
  KnowledgeIntakeDocument,
  KnowledgeIntakeDocumentDecision,
  KnowledgeIntakeProposal,
} from "./types";

type BuildKnowledgeIntakeProposalInput = {
  context: ResolvedKnowledgeIntakeContext;
  originalContext: KnowledgeIntakeProposal["context"];
  documents: KnowledgeIntakeDocument[];
};

export async function buildKnowledgeIntakeProposal({
  context,
  originalContext,
  documents,
}: BuildKnowledgeIntakeProposalInput): Promise<KnowledgeIntakeProposal> {
  const decisions =
    documents.map((document) =>
      buildProvisionalDecision({
        context,
        document,
      }),
    );

  return {
    title:
      "Propuesta de incorporación de conocimiento",
    description:
      "Análisis provisional de los documentos antes de modificar la biblioteca.",
    libraryId: context.libraryId,
    generatedAt: new Date().toISOString(),
    context: originalContext,
    summary: buildSummary(decisions),
    decisions,
    warnings:
      documents.length === 0
        ? [
            "La importación no contiene documentos disponibles para analizar.",
          ]
        : [],
  };
}

function buildProvisionalDecision({
  context,
  document,
}: {
  context: ResolvedKnowledgeIntakeContext;
  document: KnowledgeIntakeDocument;
}): KnowledgeIntakeDocumentDecision {
  const articleTitle =
    removeFileExtension(document.fileName);

  const baseDecision = {
    documentId: document.id,
    documentName: document.documentName,
    confidence: 0,
    title: articleTitle,
    summary:
      "Documento pendiente de análisis inteligente.",
    reason:
      "Decisión provisional pendiente del análisis inteligente del documento.",
    duplicateMatch: null,
    detectedTopics: [],
    detectedEntities: [],
    detectedKeywords: [],
    warnings: [],
  };

  if (context.articleId) {
    return {
      ...baseDecision,
      decision: "enrich_existing_article",
      destination: {
        articleId: context.articleId,
        articleTitle,
        folderId: context.folderId,
        folderPath: [],
        newFolderName: null,
      },
    };
  }

  if (context.folderId) {
    return {
      ...baseDecision,
      decision:
        "create_article_in_existing_folder",
      destination: {
        articleId: null,
        articleTitle,
        folderId: context.folderId,
        folderPath: [],
        newFolderName: null,
      },
    };
  }

  return {
    ...baseDecision,
    decision: "create_article_in_new_folder",
    destination: {
      articleId: null,
      articleTitle,
      folderId: null,
      folderPath: [
        "Documentos importados",
      ],
      newFolderName:
        "Documentos importados",
    },
  };
}

function buildSummary(
  decisions: KnowledgeIntakeDocumentDecision[],
): KnowledgeIntakeProposal["summary"] {
  const summary: KnowledgeIntakeProposal["summary"] =
    {
      totalDocuments: decisions.length,
      exactDuplicates: 0,
      possibleDuplicates: 0,
      newVersions: 0,
      articleEnrichments: 0,
      newArticlesInExistingFolders: 0,
      newArticlesInNewFolders: 0,
    };

  for (const decision of decisions) {
    switch (decision.decision) {
      case "exact_duplicate":
        summary.exactDuplicates += 1;
        break;

      case "possible_duplicate":
        summary.possibleDuplicates += 1;
        break;

      case "new_version":
        summary.newVersions += 1;
        break;

      case "enrich_existing_article":
        summary.articleEnrichments += 1;
        break;

      case "create_article_in_existing_folder":
        summary.newArticlesInExistingFolders +=
          1;
        break;

      case "create_article_in_new_folder":
        summary.newArticlesInNewFolders += 1;
        break;
    }
  }

  return summary;
}

function removeFileExtension(
  fileName: string,
): string {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex <= 0) {
    return fileName;
  }

  return fileName.slice(0, lastDotIndex);
}