// lib/knowledge/intake/find-article-candidates.ts

import { prisma } from "@/lib/prisma";

import {
  normalizeIntakeText,
  removeIntakeFileExtension,
  tokenizeIntakeText,
} from "./normalize-intake-text";
import type { KnowledgeIntakeDocumentInput } from "./types";

const MAX_CANDIDATES_PER_DOCUMENT = 8;
const ARTICLE_CONTENT_PREVIEW_LENGTH = 4_000;
const FILE_TEXT_PREVIEW_LENGTH = 3_000;

export type KnowledgeIntakeArticleCandidate = {
  articleId: string;
  articleTitle: string;
  libraryId: string;
  libraryName: string;
  score: number;
  reasons: string[];
  summary: string | null;
  fileNames: string[];
};

export type KnowledgeIntakeDocumentCandidates = {
  documentId: string;
  documentName: string;
  candidates: KnowledgeIntakeArticleCandidate[];
};

type LibraryRecord = {
  id: string;
  parentId: string | null;
  name: string;
};

type ArticleRecord = {
  id: string;
  title: string;
  description: string | null;
  summary: string | null;
  content: string;
  libraryId: string;
  fileNames: string[];
  extractedText: string;
};

export async function findKnowledgeArticleCandidates({
  userId,
  libraryId,
  documents,
}: {
  userId: string;
  libraryId: string;
  documents: KnowledgeIntakeDocumentInput[];
}): Promise<KnowledgeIntakeDocumentCandidates[]> {
  const libraries = await loadAccessibleLibraryTree({
    userId,
    rootLibraryId: libraryId,
  });

  if (libraries.length === 0) {
    throw new Error(
      "No se ha encontrado la biblioteca o no tienes acceso a ella.",
    );
  }

  const libraryIds = libraries.map(
    (library) => library.id,
  );

  const libraryNameById = new Map(
    libraries.map((library) => [
      library.id,
      library.name,
    ]),
  );

  const articles = await loadArticles({
    userId,
    libraryIds,
  });

  return documents.map((document) => ({
    documentId: document.id,
    documentName: document.name,
    candidates: articles
      .map((article) =>
        scoreArticleCandidate({
          document,
          article,
          libraryName:
            libraryNameById.get(
              article.libraryId,
            ) ?? "Sin carpeta",
        }),
      )
      .filter(
        (
          candidate,
        ): candidate is KnowledgeIntakeArticleCandidate =>
          candidate !== null,
      )
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.articleTitle.localeCompare(
          right.articleTitle,
          "es",
        );
      })
      .slice(0, MAX_CANDIDATES_PER_DOCUMENT),
  }));
}

async function loadAccessibleLibraryTree({
  userId,
  rootLibraryId,
}: {
  userId: string;
  rootLibraryId: string;
}): Promise<LibraryRecord[]> {
  const root =
    await prisma.knowledge_libraries.findFirst({
      where: {
        id: rootLibraryId,
        OR: [
          {
            owner_user_id: userId,
          },
          {
            knowledge_library_permissions: {
              some: {
                user_id: userId,
              },
            },
          },
          {
            knowledge_library_team_permissions: {
              some: {
                knowledge_teams: {
                  knowledge_team_members: {
                    some: {
                      user_id: userId,
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        parent_id: true,
        name: true,
        owner_user_id: true,
        company_id: true,
      },
    });

  if (!root) {
    return [];
  }

  const possibleLibraries =
    await prisma.knowledge_libraries.findMany({
      where: {
        OR: [
          {
            owner_user_id: root.owner_user_id,
          },
          ...(root.company_id
            ? [
                {
                  company_id: root.company_id,
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        parent_id: true,
        name: true,
      },
      orderBy: [
        {
          position: "asc",
        },
        {
          name: "asc",
        },
      ],
    });

  const childrenByParentId = new Map<
    string,
    LibraryRecord[]
  >();

  for (const library of possibleLibraries) {
    if (!library.parent_id) {
      continue;
    }

    const siblings =
      childrenByParentId.get(
        library.parent_id,
      ) ?? [];

    siblings.push({
      id: library.id,
      parentId: library.parent_id,
      name: library.name,
    });

    childrenByParentId.set(
      library.parent_id,
      siblings,
    );
  }

  const result: LibraryRecord[] = [
    {
      id: root.id,
      parentId: root.parent_id,
      name: root.name,
    },
  ];

  const visited = new Set<string>([
    root.id,
  ]);

  const pendingIds = [root.id];

  while (pendingIds.length > 0) {
    const currentId = pendingIds.shift();

    if (!currentId) {
      continue;
    }

    const children =
      childrenByParentId.get(currentId) ??
      [];

    for (const child of children) {
      if (visited.has(child.id)) {
        continue;
      }

      visited.add(child.id);
      result.push(child);
      pendingIds.push(child.id);
    }
  }

  return result;
}

async function loadArticles({
  userId,
  libraryIds,
}: {
  userId: string;
  libraryIds: string[];
}): Promise<ArticleRecord[]> {
  const articles =
    await prisma.knowledge_sources.findMany({
      where: {
        library_id: {
          in: libraryIds,
        },
        OR: [
          {
            owner_user_id: userId,
          },
          {
            knowledge_libraries: {
              knowledge_library_permissions: {
                some: {
                  user_id: userId,
                },
              },
            },
          },
          {
            knowledge_libraries: {
              knowledge_library_team_permissions: {
                some: {
                  knowledge_teams: {
                    knowledge_team_members: {
                      some: {
                        user_id: userId,
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        summary: true,
        content: true,
        library_id: true,
        knowledge_files: {
          select: {
            file_name: true,
            extracted_text: true,
          },
          orderBy: {
            created_at: "desc",
          },
          take: 5,
        },
      },
      orderBy: {
        updated_at: "desc",
      },
    });

  return articles.flatMap((article) => {
    if (!article.library_id) {
      return [];
    }

    return [
      {
        id: article.id,
        title: article.title,
        description: article.description,
        summary: article.summary,
        content: article.content.slice(
          0,
          ARTICLE_CONTENT_PREVIEW_LENGTH,
        ),
        libraryId: article.library_id,
        fileNames:
          article.knowledge_files.map(
            (file) => file.file_name,
          ),
        extractedText:
          article.knowledge_files
            .map((file) =>
              file.extracted_text.slice(
                0,
                FILE_TEXT_PREVIEW_LENGTH,
              ),
            )
            .join("\n"),
      },
    ];
  });
}

function scoreArticleCandidate({
  document,
  article,
  libraryName,
}: {
  document: KnowledgeIntakeDocumentInput;
  article: ArticleRecord;
  libraryName: string;
}): KnowledgeIntakeArticleCandidate | null {
  const documentBaseName =
    removeIntakeFileExtension(document.name);

  const normalizedDocumentName =
    normalizeIntakeText(documentBaseName);

  const normalizedArticleTitle =
    normalizeIntakeText(article.title);

  const documentNameTokens =
    tokenizeIntakeText(documentBaseName);

  const documentTextTokens =
    tokenizeIntakeText(
      document.text.slice(0, 6_000),
    );

  const articleTitleTokens =
    tokenizeIntakeText(article.title);

  const articleBodyTokens =
    tokenizeIntakeText(
      [
        article.description ?? "",
        article.summary ?? "",
        article.content,
        article.extractedText,
        article.fileNames.join(" "),
      ].join("\n"),
    );

  const reasons: string[] = [];
  let score = 0;

  if (
    normalizedDocumentName &&
    normalizedDocumentName ===
      normalizedArticleTitle
  ) {
    score += 70;
    reasons.push(
      "El nombre del documento coincide con el título del artículo.",
    );
  } else if (
    normalizedDocumentName &&
    normalizedArticleTitle &&
    (
      normalizedDocumentName.includes(
        normalizedArticleTitle,
      ) ||
      normalizedArticleTitle.includes(
        normalizedDocumentName,
      )
    )
  ) {
    score += 40;
    reasons.push(
      "El nombre del documento y el título del artículo son muy similares.",
    );
  }

  const titleOverlap = calculateTokenOverlap(
    documentNameTokens,
    articleTitleTokens,
  );

  if (titleOverlap >= 0.75) {
    score += 35;
    reasons.push(
      "Comparten la mayoría de las palabras relevantes del título.",
    );
  } else if (titleOverlap >= 0.4) {
    score += 20;
    reasons.push(
      "Comparten varias palabras relevantes del título.",
    );
  } else if (titleOverlap > 0) {
    score += 8;
  }

  const bodyOverlap = calculateTokenOverlap(
    documentTextTokens,
    articleBodyTokens,
  );

  if (bodyOverlap >= 0.35) {
    score += 25;
    reasons.push(
      "El contenido del documento coincide significativamente con el artículo.",
    );
  } else if (bodyOverlap >= 0.15) {
    score += 12;
    reasons.push(
      "El documento y el artículo comparten conceptos relevantes.",
    );
  } else if (bodyOverlap >= 0.05) {
    score += 4;
  }

  const matchingFileName =
    article.fileNames.some((fileName) => {
      const normalizedExistingFileName =
        normalizeIntakeText(
          removeIntakeFileExtension(fileName),
        );

      return (
        normalizedExistingFileName ===
        normalizedDocumentName
      );
    });

  if (matchingFileName) {
    score += 45;
    reasons.push(
      "El artículo ya contiene un archivo con el mismo nombre.",
    );
  }

  const boundedScore = Math.min(
    100,
    Math.round(score),
  );

  if (boundedScore < 10) {
    return null;
  }

  return {
    articleId: article.id,
    articleTitle: article.title,
    libraryId: article.libraryId,
    libraryName,
    score: boundedScore,
    reasons,
    summary: article.summary,
    fileNames: article.fileNames,
  };
}

function calculateTokenOverlap(
  sourceTokens: string[],
  targetTokens: string[],
): number {
  if (
    sourceTokens.length === 0 ||
    targetTokens.length === 0
  ) {
    return 0;
  }

  const targetTokenSet = new Set(
    targetTokens,
  );

  const matches = sourceTokens.filter(
    (token) => targetTokenSet.has(token),
  ).length;

  return matches / sourceTokens.length;
}