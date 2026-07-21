// lib/knowledge/intake/find-article-candidates.ts

import { truncateDocument } from "@/lib/knowledge/import/truncate-document";
import { prisma } from "@/lib/prisma";

import {
  normalizeIntakeText,
  removeIntakeFileExtension,
  tokenizeIntakeText,
} from "./normalize-intake-text";
import type {
  KnowledgeIntakeCandidateArticle,
  KnowledgeIntakeDocumentInput,
  KnowledgeIntakeExistingArticle,
  KnowledgeIntakeExistingFolder,
} from "./types";

const MAX_CANDIDATES_PER_DOCUMENT = 8;
const MAX_ARTICLE_COMPARISON_CHARACTERS =
  12_000;
const DOCUMENT_TEXT_PREVIEW_LENGTH = 6_000;

type LibraryRecord = {
  id: string;
  parentId: string | null;
  name: string;
};

type AccessibleLibraryRoot = {
  id: string;
  parentId: string | null;
  name: string;
  ownerUserId: string;
  companyId: string | null;
};

export type KnowledgeIntakeAnalysisContext = {
  targetLibrary: {
    id: string;
    name: string;
  };
  existingFolders: KnowledgeIntakeExistingFolder[];
  existingArticles: KnowledgeIntakeExistingArticle[];
  candidateArticlesByDocumentId: Map<
    string,
    KnowledgeIntakeCandidateArticle[]
  >;
};

export async function resolveKnowledgeIntakeAnalysisContext({
  userId,
  libraryId,
  documents,
}: {
  userId: string;
  libraryId: string;
  documents: KnowledgeIntakeDocumentInput[];
}): Promise<KnowledgeIntakeAnalysisContext> {
  const {
    root,
    libraries,
  } = await loadAccessibleLibraryTree({
    userId,
    rootLibraryId: libraryId,
  });

  const librariesById = new Map(
    libraries.map((library) => [
      library.id,
      library,
    ]),
  );

  const existingFolders =
    buildExistingFolders({
      libraries,
      librariesById,
    });

  const existingArticles =
    await loadExistingArticles({
      userId,
      libraryIds: libraries.map(
        (library) => library.id,
      ),
      librariesById,
    });

  const candidateArticlesByDocumentId =
    buildCandidateMap({
      documents,
      existingArticles,
    });

  return {
    targetLibrary: {
      id: root.id,
      name: root.name,
    },
    existingFolders,
    existingArticles,
    candidateArticlesByDocumentId,
  };
}

async function loadAccessibleLibraryTree({
  userId,
  rootLibraryId,
}: {
  userId: string;
  rootLibraryId: string;
}): Promise<{
  root: AccessibleLibraryRoot;
  libraries: LibraryRecord[];
}> {
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
    throw new Error(
      "No se ha encontrado la biblioteca o no tienes acceso a ella.",
    );
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

  const libraryRecords: LibraryRecord[] =
    possibleLibraries.map((library) => ({
      id: library.id,
      parentId: library.parent_id,
      name: library.name,
    }));

  const childrenByParentId = new Map<
    string,
    LibraryRecord[]
  >();

  for (const library of libraryRecords) {
    if (!library.parentId) {
      continue;
    }

    const siblings =
      childrenByParentId.get(
        library.parentId,
      ) ?? [];

    siblings.push(library);

    childrenByParentId.set(
      library.parentId,
      siblings,
    );
  }

  const rootRecord: LibraryRecord = {
    id: root.id,
    parentId: root.parent_id,
    name: root.name,
  };

  const result: LibraryRecord[] = [
    rootRecord,
  ];

  const visitedIds = new Set<string>([
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
      if (visitedIds.has(child.id)) {
        continue;
      }

      visitedIds.add(child.id);
      result.push(child);
      pendingIds.push(child.id);
    }
  }

  return {
    root: {
      id: root.id,
      parentId: root.parent_id,
      name: root.name,
      ownerUserId: root.owner_user_id,
      companyId: root.company_id,
    },
    libraries: result,
  };
}

function buildExistingFolders({
  libraries,
  librariesById,
}: {
  libraries: LibraryRecord[];
  librariesById: Map<
    string,
    LibraryRecord
  >;
}): KnowledgeIntakeExistingFolder[] {
  return libraries.map((library) => ({
    id: library.id,
    name: library.name,
    parentId: library.parentId,
    path: buildLibraryPath(
      library.id,
      librariesById,
    ),
  }));
}

async function loadExistingArticles({
  userId,
  libraryIds,
  librariesById,
}: {
  userId: string;
  libraryIds: string[];
  librariesById: Map<
    string,
    LibraryRecord
  >;
}): Promise<
  KnowledgeIntakeExistingArticle[]
> {
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
        status: true,
        library_id: true,
        knowledge_files: {
          select: {
            id: true,
            file_name: true,
            extracted_text: true,
          },
          orderBy: {
            created_at: "asc",
          },
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
        description:
          article.description,
        summary: article.summary,
        content: article.content,
        status: article.status,
        libraryId: article.library_id,
        libraryPath: buildLibraryPath(
          article.library_id,
          librariesById,
        ),
        files:
          article.knowledge_files.map(
            (file) => ({
              id: file.id,
              name: file.file_name,
              extractedText:
                file.extracted_text,
            }),
          ),
      },
    ];
  });
}

function buildCandidateMap({
  documents,
  existingArticles,
}: {
  documents: KnowledgeIntakeDocumentInput[];
  existingArticles: KnowledgeIntakeExistingArticle[];
}) {
  const result = new Map<
    string,
    KnowledgeIntakeCandidateArticle[]
  >();

  for (const document of documents) {
    result.set(
      document.id,
      buildCandidatesForDocument({
        document,
        existingArticles,
      }),
    );
  }

  return result;
}

function buildCandidatesForDocument({
  document,
  existingArticles,
}: {
  document: KnowledgeIntakeDocumentInput;
  existingArticles: KnowledgeIntakeExistingArticle[];
}): KnowledgeIntakeCandidateArticle[] {
  return existingArticles
    .map((article) =>
      buildCandidate({
        document,
        article,
      }),
    )
    .filter(
      (
        candidate,
      ): candidate is KnowledgeIntakeCandidateArticle =>
        candidate !== null,
    )
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

function buildCandidate({
  document,
  article,
}: {
  document: KnowledgeIntakeDocumentInput;
  article: KnowledgeIntakeExistingArticle;
}): KnowledgeIntakeCandidateArticle | null {
  const comparisonText =
    buildArticleComparisonText(article);

  const lexicalScore =
    calculateCandidateScore({
      document,
      article,
      comparisonText,
    });

  if (lexicalScore <= 0) {
    return null;
  }

  return {
    id: article.id,
    title: article.title,
    description: article.description,
    summary: article.summary,
    libraryId: article.libraryId,
    libraryPath: article.libraryPath,
    fileNames: article.files.map(
      (file) => file.name,
    ),
    comparisonText,
    lexicalScore,
  };
}

function calculateCandidateScore({
  document,
  article,
  comparisonText,
}: {
  document: KnowledgeIntakeDocumentInput;
  article: KnowledgeIntakeExistingArticle;
  comparisonText: string;
}) {
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
      document.text.slice(
        0,
        DOCUMENT_TEXT_PREVIEW_LENGTH,
      ),
    );

  const articleTitleTokens =
    tokenizeIntakeText(article.title);

  const articleBodyTokens =
    tokenizeIntakeText(comparisonText);

  let score = 0;

  if (
    normalizedDocumentName &&
    normalizedDocumentName ===
      normalizedArticleTitle
  ) {
    score += 0.45;
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
    score += 0.25;
  }

  const titleOverlap =
    calculateTokenOverlap(
      documentNameTokens,
      articleTitleTokens,
    );

  score += titleOverlap * 0.25;

  const bodyOverlap =
    calculateTokenOverlap(
      documentTextTokens,
      articleBodyTokens,
    );

  score += bodyOverlap * 0.2;

  const matchingFileName =
    article.files.some((file) => {
      const normalizedExistingFileName =
        normalizeIntakeText(
          removeIntakeFileExtension(
            file.name,
          ),
        );

      return (
        normalizedExistingFileName ===
        normalizedDocumentName
      );
    });

  if (matchingFileName) {
    score += 0.3;
  }

  return Math.min(1, score);
}

function buildArticleComparisonText(
  article: KnowledgeIntakeExistingArticle,
) {
  const fileText = article.files
    .map((file) =>
      [
        `FILE_NAME: ${file.name}`,
        file.extractedText,
      ].join("\n"),
    )
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

function buildLibraryPath(
  libraryId: string,
  librariesById: Map<
    string,
    LibraryRecord
  >,
) {
  const path: string[] = [];
  const visitedIds = new Set<string>();

  let currentId: string | null =
    libraryId;

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
    currentId = library.parentId;
  }

  return path;
}

function calculateTokenOverlap(
  sourceTokens: string[],
  targetTokens: string[],
) {
  if (
    sourceTokens.length === 0 ||
    targetTokens.length === 0
  ) {
    return 0;
  }

  const sourceSet = new Set(sourceTokens);
  const targetSet = new Set(targetTokens);

  let intersection = 0;

  for (const token of sourceSet) {
    if (targetSet.has(token)) {
      intersection += 1;
    }
  }

  const containment =
    intersection /
    Math.min(
      sourceSet.size,
      targetSet.size,
    );

  const union =
    sourceSet.size +
    targetSet.size -
    intersection;

  const jaccard =
    union > 0
      ? intersection / union
      : 0;

  return containment * 0.7 +
    jaccard * 0.3;
}