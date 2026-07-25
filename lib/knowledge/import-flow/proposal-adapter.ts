import type {
  ConfirmKnowledgeImportResult,
  KnowledgeImportProposal,
} from "@/lib/knowledge/import/types";
import type {
  ConfirmKnowledgeIntakeResult,
  KnowledgeIntakeDocumentDecision,
  KnowledgeIntakeProposal,
} from "@/lib/knowledge/intake/types";

function buildFolderPath(
  proposal: KnowledgeImportProposal,
  folderId: string | null,
) {
  if (!folderId) {
    return [] as string[];
  }

  const foldersById = new Map(
    proposal.folders.map((folder) => [
      folder.id,
      folder,
    ]),
  );

  const folderPath: string[] = [];
  const visited = new Set<string>();

  let currentFolderId:
    | string
    | null = folderId;

  while (
    currentFolderId &&
    !visited.has(currentFolderId)
  ) {
    visited.add(currentFolderId);

    const folder = foldersById.get(
      currentFolderId,
    );

    if (!folder) {
      break;
    }

    folderPath.unshift(folder.name);

    currentFolderId =
      folder.parentFolderId;
  }

  return folderPath;
}

export function adaptImportProposal(
  proposal: KnowledgeImportProposal,
  libraryId: string,
): KnowledgeIntakeProposal {
  const updatedArticles =
    proposal.articles.filter(
      (article) =>
        article.action === "update",
    );

  const versionArticles =
    updatedArticles.filter((article) =>
      proposal.warnings.some(
        (warning) =>
          warning.type === "version" &&
          warning.documentIds.some(
            (documentId) =>
              article.documentIds.includes(
                documentId,
              ),
          ),
      ),
    );

  const versionArticleIds = new Set(
    versionArticles.map(
      (article) => article.id,
    ),
  );

  const decisions: KnowledgeIntakeDocumentDecision[] =
    proposal.documentAnalyses.map(
      (analysis) => {
        const article =
          proposal.articles.find(
            (candidate) =>
              candidate.documentIds.includes(
                analysis.documentId,
              ),
          );

        const folderPath =
          buildFolderPath(
            proposal,
            article?.folderId ?? null,
          );

        const relatedWarnings =
          proposal.warnings.filter(
            (warning) =>
              warning.documentIds.includes(
                analysis.documentId,
              ),
          );

        const articleTitle =
          article?.title ||
          analysis.suggestedArticleTitle ||
          analysis.title;

        const confidence =
          article?.confidence ?? 0.75;

        const warnings =
          relatedWarnings.map(
            (warning) =>
              warning.description,
          );

        if (
          article?.action === "update"
        ) {
          if (
            !article.existingArticleId
          ) {
            throw new Error(
              `El artículo "${article.title}" no tiene existingArticleId`,
            );
          }

          const destination = {
            articleId:
              article.existingArticleId,
            articleTitle,
            folderId: null,
            folderPath: [],
            newFolderName: null,
          };

          const isNewVersion =
            versionArticleIds.has(
              article.id,
            );

          if (isNewVersion) {
            return {
              documentId:
                analysis.documentId,
              documentName:
                analysis.documentName,
              decision: "new_version",
              confidence,
              title: analysis.title,
              summary: analysis.summary,
              reason:
                article.description ||
                analysis.summary ||
                "La IA propone incorporar este documento como una nueva versión del artículo existente.",
              duplicateMatch: {
                articleId:
                  article.existingArticleId,
                articleTitle,
                fileId: null,
                fileName: null,
                similarity: confidence,
                reason:
                  relatedWarnings.find(
                    (warning) =>
                      warning.type ===
                      "version",
                  )?.description ||
                  "La IA ha detectado que el documento corresponde a una nueva versión del artículo existente.",
              },
              destination,
              detectedTopics:
                analysis.topics,
              detectedEntities:
                analysis.entities,
              detectedKeywords:
                analysis.keywords,
              warnings,
            };
          }

          return {
            documentId:
              analysis.documentId,
            documentName:
              analysis.documentName,
            decision:
              "enrich_existing_article",
            confidence,
            title: analysis.title,
            summary: analysis.summary,
            reason:
              article.description ||
              analysis.summary ||
              "La IA propone incorporar este documento al artículo existente.",
            duplicateMatch: null,
            destination,
            detectedTopics:
              analysis.topics,
            detectedEntities:
              analysis.entities,
            detectedKeywords:
              analysis.keywords,
            warnings,
          };
        }

        if (folderPath.length > 0) {
          return {
            documentId:
              analysis.documentId,
            documentName:
              analysis.documentName,
            decision:
              "create_article_in_new_folder",
            confidence,
            title: analysis.title,
            summary: analysis.summary,
            reason:
              article?.description ||
              analysis.summary ||
              "La IA propone crear un artículo nuevo para este documento.",
            duplicateMatch: null,
            destination: {
              articleId: null,
              articleTitle,
              folderId: null,
              folderPath,
              newFolderName:
                folderPath.at(-1) ??
                "Nueva carpeta",
            },
            detectedTopics:
              analysis.topics,
            detectedEntities:
              analysis.entities,
            detectedKeywords:
              analysis.keywords,
            warnings,
          };
        }

        return {
          documentId:
            analysis.documentId,
          documentName:
            analysis.documentName,
          decision:
            "create_article_in_existing_folder",
          confidence,
          title: analysis.title,
          summary: analysis.summary,
          reason:
            article?.description ||
            analysis.summary ||
            "La IA propone crear un artículo nuevo en la biblioteca.",
          duplicateMatch: null,
          destination: {
            articleId: null,
            articleTitle,
            folderId: libraryId,
            folderPath: [],
            newFolderName: null,
          },
          detectedTopics:
            analysis.topics,
          detectedEntities:
            analysis.entities,
          detectedKeywords:
            analysis.keywords,
          warnings,
        };
      },
    );

  return {
    title: proposal.title,
    description:
      proposal.description,
    libraryId,
    generatedAt:
      new Date().toISOString(),

    summary: {
      totalDocuments:
        proposal.summary.totalDocuments,

      exactDuplicates:
        proposal.warnings.filter(
          (warning) =>
            warning.type ===
            "duplicate",
        ).length,

      possibleDuplicates:
        proposal.warnings.filter(
          (warning) =>
            warning.type ===
            "possible_duplicate",
        ).length,

      newVersions:
        versionArticles.length,

      articleEnrichments:
        updatedArticles.length -
        versionArticles.length,

      newArticlesInExistingFolders:
        proposal.articles.filter(
          (article) =>
            article.action ===
              "create" &&
            article.folderId === null,
        ).length,

      newArticlesInNewFolders:
        proposal.articles.filter(
          (article) =>
            article.action ===
              "create" &&
            article.folderId !== null,
        ).length,
    },

    decisions,

    warnings:
      proposal.warnings.map(
        (warning) =>
          `${warning.title}: ${warning.description}`,
      ),
  };
}

export function adaptConfirmationResult(
  result: ConfirmKnowledgeImportResult,
  proposal: KnowledgeImportProposal,
): ConfirmKnowledgeIntakeResult {
  const createdArticles =
    result.log.articles.map(
      (article) => {
        const proposalArticle =
          proposal.articles.find(
            (candidate) =>
              candidate.id ===
              article.proposalArticleId,
          );

        return {
          id:
            article.databaseArticleId,
          title: article.title,
          libraryId:
            result.log.targetLibrary.id,
          path: buildFolderPath(
            proposal,
            proposalArticle?.folderId ??
              null,
          ),
          documentIds:
            article.documentIds,
        };
      },
    );

  return {
    success: true,
    status: "completed",

    summary: {
      createdArticles:
        createdArticles.length,
      updatedArticles: 0,
      ignoredDocuments: 0,
      attachedDocuments:
        result.log.documents.length,
    },

    createdArticles,
    updatedArticles: [],
    ignoredDocuments: [],
  };
}
