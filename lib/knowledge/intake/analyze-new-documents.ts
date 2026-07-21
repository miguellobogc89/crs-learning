// lib/knowledge/intake/analyze-new-documents.ts

import {
  getKnowledgeImportModel,
  getOpenAIClient,
} from "@/lib/ai/openai";
import { truncateDocument } from "@/lib/knowledge/import/truncate-document";
import { prisma } from "@/lib/prisma";

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
const MAX_CANDIDATES_PER_DOCUMENT = 8;
const MAX_ARTICLE_COMPARISON_CHARACTERS =
  12_000;

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

type LibraryRow = {
  id: string;
  name: string;
  parent_id: string | null;
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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return new Set<string>();
  }

  return new Set(
    normalized
      .split(" ")
      .filter((token) => token.length >= 3),
  );
}

function calculateLexicalScore(
  left: string,
  right: string,
) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);

  if (
    leftTokens.size === 0 ||
    rightTokens.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const containment =
    intersection /
    Math.min(
      leftTokens.size,
      rightTokens.size,
    );

  const union =
    leftTokens.size +
    rightTokens.size -
    intersection;

  const jaccard =
    union > 0 ? intersection / union : 0;

  return containment * 0.7 + jaccard * 0.3;
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
      values.slice(index, index + batchSize),
    );
  }

  return batches;
}

function buildLibraryPath(
  libraryId: string,
  librariesById: Map<string, LibraryRow>,
) {
  const path: string[] = [];
  const visitedIds = new Set<string>();

  let currentId: string | null = libraryId;

  while (currentId) {
    if (visitedIds.has(currentId)) {
      break;
    }

    visitedIds.add(currentId);

    const library =
      librariesById.get(currentId);

    if (!library) {
      break;
    }

    path.unshift(library.name);
    currentId = library.parent_id;
  }

  return path;
}

function isLibraryInsideTarget(
  libraryId: string,
  targetLibraryId: string,
  librariesById: Map<string, LibraryRow>,
) {
  const visitedIds = new Set<string>();

  let currentId: string | null = libraryId;

  while (currentId) {
    if (currentId === targetLibraryId) {
      return true;
    }

    if (visitedIds.has(currentId)) {
      return false;
    }

    visitedIds.add(currentId);

    const library =
      librariesById.get(currentId);

    if (!library) {
      return false;
    }

    currentId = library.parent_id;
  }

  return false;
}

function buildArticleComparisonText(
  article: KnowledgeIntakeExistingArticle,
) {
  const fileText = article.files
    .map((file) => {
      return [
        `FILE_NAME: ${file.name}`,
        file.extractedText,
      ].join("\n");
    })
    .join("\n\n");

  return truncateDocument(
    [
      `TITLE: ${article.title}`,
      `DESCRIPTION: ${article.description ?? ""}`,
      `SUMMARY: ${article.summary ?? ""}`,
      "",
      "CONTENT:",
      article.content,
      "",
      "FILES:",
      fileText,
    ].join("\n"),
    MAX_ARTICLE_COMPARISON_CHARACTERS,
  );
}

function buildCandidatesForDocument(
  document: KnowledgeIntakeDocumentInput,
  existingArticles: KnowledgeIntakeExistingArticle[],
) {
  const documentComparisonText = [
    document.name,
    document.text,
  ].join("\n");

  return existingArticles
    .map((article) => {
      const comparisonText =
        buildArticleComparisonText(article);

      const lexicalScore =
        calculateLexicalScore(
          documentComparisonText,
          comparisonText,
        );

      const candidate: KnowledgeIntakeCandidateArticle =
        {
          id: article.id,
          title: article.title,
          description:
            article.description,
          summary: article.summary,
          libraryId: article.libraryId,
          libraryPath:
            article.libraryPath,
          fileNames: article.files.map(
            (file) => file.name,
          ),
          comparisonText,
          lexicalScore,
        };

      return candidate;
    })
    .sort(
      (left, right) =>
        right.lexicalScore -
        left.lexicalScore,
    )
    .slice(
      0,
      MAX_CANDIDATES_PER_DOCUMENT,
    );
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
      !DECISION_TYPES.has(decision.decision)
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
      decision.decision === "new_version";

    if (needsExistingArticle) {
      if (!decision.destination.articleId) {
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
      (!decision.destination.folderId ||
        !folderById.has(
          decision.destination.folderId,
        ))
    ) {
      throw new Error(
        `La IA ha seleccionado una carpeta inexistente para ${decision.documentName}`,
      );
    }

    if (
      decision.decision ===
        "create_article_in_new_folder" &&
      (!decision.destination.newFolderName ||
        decision.destination.folderId !==
          null)
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
      decision.decision === "new_version";

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
        decision.duplicateMatch.similarity <
          0 ||
        decision.duplicateMatch.similarity >
          1
      ) {
        throw new Error(
          `La similitud de ${decision.documentName} no es válida`,
        );
      }
    }
  }

  for (const document of documents) {
    if (
      !receivedDocumentIds.has(document.id)
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

async function loadKnowledgeContext({
  userId,
  libraryId,
}: {
  userId: string;
  libraryId: string;
}) {
  const libraries =
    await prisma.knowledge_libraries.findMany({
      where: {
        owner_user_id: userId,
      },
      select: {
        id: true,
        name: true,
        parent_id: true,
      },
    });

  const librariesById = new Map(
    libraries.map((library) => [
      library.id,
      library,
    ]),
  );

  const targetLibrary =
    librariesById.get(libraryId);

  if (!targetLibrary) {
    throw new Error(
      "La biblioteca seleccionada no existe",
    );
  }

  const availableLibraries =
    libraries.filter((library) =>
      isLibraryInsideTarget(
        library.id,
        libraryId,
        librariesById,
      ),
    );

  const availableLibraryIds =
    availableLibraries.map(
      (library) => library.id,
    );

  const sourceRows =
    await prisma.knowledge_sources.findMany({
      where: {
        owner_user_id: userId,
        library_id: {
          in: availableLibraryIds,
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        summary: true,
        content: true,
        status: true,
        library_id: true,
      },
      orderBy: {
        updated_at: "desc",
      },
    });

  const sourceRowsWithLibrary =
    sourceRows.filter(
      (
        source,
      ): source is typeof source & {
        library_id: string;
      } => source.library_id !== null,
    );

  const sourceIds =
    sourceRowsWithLibrary.map(
      (source) => source.id,
    );

  const fileRows =
    sourceIds.length > 0
      ? await prisma.knowledge_files.findMany(
          {
            where: {
              knowledge_source_id: {
                in: sourceIds,
              },
            },
            select: {
              id: true,
              knowledge_source_id: true,
              file_name: true,
              extracted_text: true,
            },
            orderBy: {
              created_at: "asc",
            },
          },
        )
      : [];

  const filesBySourceId = new Map<
    string,
    typeof fileRows
  >();

  for (const file of fileRows) {
    const currentFiles =
      filesBySourceId.get(
        file.knowledge_source_id,
      ) ?? [];

    currentFiles.push(file);

    filesBySourceId.set(
      file.knowledge_source_id,
      currentFiles,
    );
  }

  const existingArticles: KnowledgeIntakeExistingArticle[] =
    sourceRowsWithLibrary.map((source) => {
      const sourceFiles =
        filesBySourceId.get(source.id) ?? [];

      return {
        id: source.id,
        title: source.title,
        description: source.description,
        summary: source.summary,
        content: source.content,
        status: source.status,
        libraryId: source.library_id,
        libraryPath: buildLibraryPath(
          source.library_id,
          librariesById,
        ),
        files: sourceFiles.map((file) => ({
          id: file.id,
          name: file.file_name,
          extractedText:
            file.extracted_text,
        })),
      };
    });

  const existingFolders: KnowledgeIntakeExistingFolder[] =
    availableLibraries.map((library) => ({
      id: library.id,
      name: library.name,
      parentId: library.parent_id,
      path: buildLibraryPath(
        library.id,
        librariesById,
      ),
    }));

  return {
    targetLibrary,
    existingArticles,
    existingFolders,
  };
}

async function analyzeDocumentBatch({
  documents,
  existingArticles,
  existingFolders,
}: {
  documents: KnowledgeIntakeDocumentInput[];
  existingArticles: KnowledgeIntakeExistingArticle[];
  existingFolders: KnowledgeIntakeExistingFolder[];
}) {
  const candidateArticlesByDocumentId =
    new Map<
      string,
      KnowledgeIntakeCandidateArticle[]
    >();

  for (const document of documents) {
    candidateArticlesByDocumentId.set(
      document.id,
      buildCandidatesForDocument(
        document,
        existingArticles,
      ),
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
        candidateArticlesByDocumentId,
        folders: existingFolders,
      }),
      text: {
        format: {
          type: "json_schema",
          name: "knowledge_intake_proposal",
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
      duplicatedDocumentIds.has(document.id)
    ) {
      throw new Error(
        `El documento ${document.name} aparece más de una vez`,
      );
    }

    duplicatedDocumentIds.add(document.id);

    if (!document.name.trim()) {
      throw new Error(
        "Uno de los documentos no contiene nombre",
      );
    }

    if (document.text.trim().length < 20) {
      throw new Error(
        `No se ha podido extraer texto suficiente de ${document.name}`,
      );
    }
  }

  const {
    targetLibrary,
    existingArticles,
    existingFolders,
  } = await loadKnowledgeContext({
    userId,
    libraryId,
  });

  const preparedDocuments = documents.map(
    (document) => ({
      ...document,
      text: truncateDocument(document.text),
    }),
  );

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
      });

    if (generated.title.trim()) {
      generatedTitle =
        generated.title.trim();
    }

    if (generated.description.trim()) {
      generatedDescription =
        generated.description.trim();
    }

    decisions.push(...generated.decisions);
    warnings.push(...generated.warnings);
  }

  validateGeneratedDecisions(
    decisions,
    preparedDocuments,
    existingArticles,
    existingFolders,
  );

  const proposal: KnowledgeIntakeProposal = {
    title: generatedTitle,
    description: generatedDescription,
    libraryId,
    generatedAt: new Date().toISOString(),
    summary: buildSummary(decisions),
    decisions,
    warnings: Array.from(
      new Set(
        warnings
          .map((warning) => warning.trim())
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