// lib/knowledge/intake/analyze-new-documents.ts

import {
  getKnowledgeImportModel,
  getOpenAIClient,
} from "@/lib/ai/openai";
import { truncateDocument } from "@/lib/knowledge/import/truncate-document";

import {
  resolveKnowledgeIntakeAnalysisContext,
} from "./find-article-candidates";
import {
  buildKnowledgeIntakePrompt,
  KNOWLEDGE_INTAKE_JSON_SCHEMA,
  KNOWLEDGE_INTAKE_SYSTEM_PROMPT,
} from "./proposal-prompts";
import type {
  AnalyzeKnowledgeIntakeInput,
  AnalyzeKnowledgeIntakeResult,
  KnowledgeIntakeCandidateArticle,
  KnowledgeIntakeDecisionType,
  KnowledgeIntakeDocumentDecision,
  KnowledgeIntakeDocumentInput,
  KnowledgeIntakeExistingArticle,
  KnowledgeIntakeExistingFolder,
  KnowledgeIntakeProposal,
  KnowledgeIntakeProposalSummary,
} from "./types";

const MAX_DOCUMENTS_PER_BATCH = 4;

const DECISION_TYPES =
  new Set<KnowledgeIntakeDecisionType>([
    "exact_duplicate",
    "possible_duplicate",
    "new_version",
    "enrich_existing_article",
    "create_article_in_existing_folder",
    "create_article_in_new_folder",
  ]);

type GeneratedProposalPayload = {
  title: string;
  description: string;
  decisions: KnowledgeIntakeDocumentDecision[];
  warnings: string[];
};

function parseJsonResponse<T>(
  responseText: string,
): T {
  if (!responseText.trim()) {
    throw new Error(
      "La IA no ha devuelto contenido al analizar los documentos",
    );
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(
      "La IA ha devuelto una propuesta JSON no válida",
    );
  }
}

function splitIntoBatches<T>(
  values: T[],
  batchSize: number,
) {
  const batches: T[][] = [];

  for (
    let index = 0;
    index < values.length;
    index += batchSize
  ) {
    batches.push(
      values.slice(
        index,
        index + batchSize,
      ),
    );
  }

  return batches;
}

function validateGeneratedDecisions(
  decisions: KnowledgeIntakeDocumentDecision[],
  documents: KnowledgeIntakeDocumentInput[],
  existingArticles: KnowledgeIntakeExistingArticle[],
  existingFolders: KnowledgeIntakeExistingFolder[],
) {
  const documentById = new Map(
    documents.map((document) => [
      document.id,
      document,
    ]),
  );

  const articleById = new Map(
    existingArticles.map((article) => [
      article.id,
      article,
    ]),
  );

  const folderById = new Map(
    existingFolders.map((folder) => [
      folder.id,
      folder,
    ]),
  );

  const receivedDocumentIds =
    new Set<string>();

  for (const decision of decisions) {
    const sourceDocument =
      documentById.get(decision.documentId);

    if (!sourceDocument) {
      throw new Error(
        `La IA ha devuelto un documento desconocido: ${decision.documentId}`,
      );
    }

    if (
      receivedDocumentIds.has(
        decision.documentId,
      )
    ) {
      throw new Error(
        `La IA ha analizado dos veces el documento ${decision.documentName}`,
      );
    }

    receivedDocumentIds.add(
      decision.documentId,
    );

    if (
      !DECISION_TYPES.has(
        decision.decision,
      )
    ) {
      throw new Error(
        `La IA ha devuelto una decisión desconocida para ${decision.documentName}`,
      );
    }

    if (
      decision.confidence < 0 ||
      decision.confidence > 1
    ) {
      throw new Error(
        `La confianza de ${decision.documentName} no es válida`,
      );
    }

    const needsExistingArticle =
      decision.decision ===
        "enrich_existing_article" ||
      decision.decision ===
        "new_version";

    if (needsExistingArticle) {
      if (
        !decision.destination.articleId
      ) {
        throw new Error(
          `La decisión ${decision.decision} necesita un artículo de destino`,
        );
      }

      if (
        !articleById.has(
          decision.destination.articleId,
        )
      ) {
        throw new Error(
          `La IA ha seleccionado un artículo inexistente para ${decision.documentName}`,
        );
      }
    }

    if (
      decision.decision ===
        "create_article_in_existing_folder" &&
      (
        !decision.destination.folderId ||
        !folderById.has(
          decision.destination.folderId,
        )
      )
    ) {
      throw new Error(
        `La IA ha seleccionado una carpeta inexistente para ${decision.documentName}`,
      );
    }

    if (
      decision.decision ===
        "create_article_in_new_folder" &&
      (
        !decision.destination
          .newFolderName ||
        decision.destination.folderId !==
          null
      )
    ) {
      throw new Error(
        `La nueva carpeta propuesta para ${decision.documentName} no es válida`,
      );
    }

    const requiresDuplicateMatch =
      decision.decision ===
        "exact_duplicate" ||
      decision.decision ===
        "possible_duplicate" ||
      decision.decision ===
        "new_version";

    if (
      requiresDuplicateMatch &&
      !decision.duplicateMatch
    ) {
      throw new Error(
        `La decisión ${decision.decision} no contiene la coincidencia detectada`,
      );
    }

    if (decision.duplicateMatch) {
      if (
        !articleById.has(
          decision.duplicateMatch.articleId,
        )
      ) {
        throw new Error(
          `La coincidencia de ${decision.documentName} apunta a un artículo inexistente`,
        );
      }

      if (
        decision.duplicateMatch
          .similarity < 0 ||
        decision.duplicateMatch
          .similarity > 1
      ) {
        throw new Error(
          `La similitud de ${decision.documentName} no es válida`,
        );
      }
    }
  }

  for (const document of documents) {
    if (
      !receivedDocumentIds.has(
        document.id,
      )
    ) {
      throw new Error(
        `La IA no ha analizado el documento ${document.name}`,
      );
    }
  }
}

function buildSummary(
  decisions: KnowledgeIntakeDocumentDecision[],
): KnowledgeIntakeProposalSummary {
  const summary: KnowledgeIntakeProposalSummary =
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
        summary
          .newArticlesInExistingFolders +=
          1;
        break;

      case "create_article_in_new_folder":
        summary.newArticlesInNewFolders +=
          1;
        break;
    }
  }

  return summary;
}

async function analyzeDocumentBatch({
  documents,
  existingArticles,
  existingFolders,
  candidateArticlesByDocumentId,
}: {
  documents: KnowledgeIntakeDocumentInput[];
  existingArticles: KnowledgeIntakeExistingArticle[];
  existingFolders: KnowledgeIntakeExistingFolder[];
  candidateArticlesByDocumentId: Map<
    string,
    KnowledgeIntakeCandidateArticle[]
  >;
}) {
  const batchCandidateArticles =
    new Map<
      string,
      KnowledgeIntakeCandidateArticle[]
    >();

  for (const document of documents) {
    batchCandidateArticles.set(
      document.id,
      candidateArticlesByDocumentId.get(
        document.id,
      ) ?? [],
    );
  }

  const openai = getOpenAIClient();
  const model = getKnowledgeImportModel();

  const response =
    await openai.responses.create({
      model,
      instructions:
        KNOWLEDGE_INTAKE_SYSTEM_PROMPT,
      input: buildKnowledgeIntakePrompt({
        documents,
        candidateArticlesByDocumentId:
          batchCandidateArticles,
        folders: existingFolders,
      }),
      text: {
        format: {
          type: "json_schema",
          name:
            "knowledge_intake_proposal",
          strict: true,
          schema:
            KNOWLEDGE_INTAKE_JSON_SCHEMA,
        },
      },
    });

  const parsed =
    parseJsonResponse<GeneratedProposalPayload>(
      response.output_text,
    );

  validateGeneratedDecisions(
    parsed.decisions,
    documents,
    existingArticles,
    existingFolders,
  );

  return parsed;
}

export async function analyzeNewKnowledgeDocuments({
  userId,
  libraryId,
  documents,
}: AnalyzeKnowledgeIntakeInput): Promise<AnalyzeKnowledgeIntakeResult> {
  if (!userId.trim()) {
    throw new Error("Usuario no válido");
  }

  if (!libraryId.trim()) {
    throw new Error(
      "No se ha indicado la biblioteca de destino",
    );
  }

  if (documents.length === 0) {
    throw new Error(
      "Debes seleccionar al menos un documento",
    );
  }

  const duplicatedDocumentIds =
    new Set<string>();

  for (const document of documents) {
    if (!document.id.trim()) {
      throw new Error(
        "Uno de los documentos no contiene identificador",
      );
    }

    if (
      duplicatedDocumentIds.has(
        document.id,
      )
    ) {
      throw new Error(
        `El documento ${document.name} aparece más de una vez`,
      );
    }

    duplicatedDocumentIds.add(
      document.id,
    );

    if (!document.name.trim()) {
      throw new Error(
        "Uno de los documentos no contiene nombre",
      );
    }

    if (
      document.text.trim().length < 20
    ) {
      throw new Error(
        `No se ha podido extraer texto suficiente de ${document.name}`,
      );
    }
  }

  const preparedDocuments =
    documents.map((document) => ({
      ...document,
      text: truncateDocument(
        document.text,
      ),
    }));

  const {
    targetLibrary,
    existingArticles,
    existingFolders,
    candidateArticlesByDocumentId,
  } =
    await resolveKnowledgeIntakeAnalysisContext({
      userId,
      libraryId,
      documents: preparedDocuments,
    });

  const batches = splitIntoBatches(
    preparedDocuments,
    MAX_DOCUMENTS_PER_BATCH,
  );

  const decisions: KnowledgeIntakeDocumentDecision[] =
    [];

  const warnings: string[] = [];

  let generatedTitle =
    "Propuesta de incorporación de conocimiento";

  let generatedDescription =
    "Análisis de documentos nuevos antes de modificar la biblioteca.";

  for (const batch of batches) {
    const generated =
      await analyzeDocumentBatch({
        documents: batch,
        existingArticles,
        existingFolders,
        candidateArticlesByDocumentId,
      });

    if (generated.title.trim()) {
      generatedTitle =
        generated.title.trim();
    }

    if (
      generated.description.trim()
    ) {
      generatedDescription =
        generated.description.trim();
    }

    decisions.push(
      ...generated.decisions,
    );

    warnings.push(
      ...generated.warnings,
    );
  }

  validateGeneratedDecisions(
    decisions,
    preparedDocuments,
    existingArticles,
    existingFolders,
  );

  const proposal: KnowledgeIntakeProposal =
    {
      title: generatedTitle,
      description:
        generatedDescription,
      libraryId,
      generatedAt:
        new Date().toISOString(),
      summary:
        buildSummary(decisions),
      decisions,
      warnings: Array.from(
        new Set(
          warnings
            .map((warning) =>
              warning.trim(),
            )
            .filter(Boolean),
        ),
      ),
    };

  return {
    status: "proposal_ready",
    proposal: {
      ...proposal,
      description: [
        proposal.description,
        `Biblioteca analizada: ${targetLibrary.name}.`,
      ]
        .filter(Boolean)
        .join(" "),
    },
  };
}