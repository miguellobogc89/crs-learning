// lib/knowledge/intake/types.ts

export type KnowledgeIntakeEntryPoint =
  | "library"
  | "folder"
  | "article"
  | "knowledge_root";

export type KnowledgeIntakeContext =
  | {
      entryPoint: "library";
      libraryId: string;
    }
  | {
      entryPoint: "folder";
      libraryId: string;
      folderId: string;
    }
  | {
      entryPoint: "article";
      libraryId: string;
      articleId: string;
    }
  | {
      entryPoint: "knowledge_root";
      companyId: string;
    };

export type KnowledgeIntakeSourceKind =
  | "file"
  | "folder"
  | "zip";

export type KnowledgeIntakeDocumentInput = {
  id: string;
  name: string;
  mimeType: string | null;
  size: number;
  text: string;
};

export type KnowledgeIntakeDocument = {
  id: string;
  fileName: string;
  documentName: string;
  mimeType: string | null;
  sizeBytes: number;
  relativePath: string;
  extractedText: string;
  sourceKind: KnowledgeIntakeSourceKind;
};

export type KnowledgeIntakeExistingFile = {
  id: string;
  name: string;
  extractedText: string;
};

export type KnowledgeIntakeExistingArticle = {
  id: string;
  title: string;
  description: string | null;
  summary: string | null;
  content: string;
  status: string;
  libraryId: string;
  libraryPath: string[];
  files: KnowledgeIntakeExistingFile[];
};

export type KnowledgeIntakeCandidateArticle = {
  id: string;
  title: string;
  description: string | null;
  summary: string | null;
  libraryId: string;
  libraryPath: string[];
  fileNames: string[];
  comparisonText: string;
  lexicalScore: number;
};

export type KnowledgeIntakeExistingFolder = {
  id: string;
  name: string;
  parentId: string | null;
  path: string[];
};

export type KnowledgeIntakeDecisionType =
  | "exact_duplicate"
  | "possible_duplicate"
  | "new_version"
  | "enrich_existing_article"
  | "create_article_in_existing_folder"
  | "create_article_in_new_folder";

export type KnowledgeIntakeDuplicateMatch = {
  articleId: string;
  articleTitle: string;
  fileId: string | null;
  fileName: string | null;
  similarity: number;
  reason: string;
};

export type KnowledgeIntakeDestination = {
  articleId: string | null;
  articleTitle: string;
  folderId: string | null;
  folderPath: string[];
  newFolderName: string | null;
};

type KnowledgeIntakeDecisionBase = {
  documentId: string;
  documentName: string;
  confidence: number;
  title: string;
  summary: string;
  reason: string;
  duplicateMatch: KnowledgeIntakeDuplicateMatch | null;
  destination: KnowledgeIntakeDestination;
  detectedTopics: string[];
  detectedEntities: string[];
  detectedKeywords: string[];
  warnings: string[];
};

export type KnowledgeIntakeDuplicateDecision =
  KnowledgeIntakeDecisionBase & {
    decision:
      | "exact_duplicate"
      | "possible_duplicate";
  };

export type KnowledgeIntakeNewVersionDecision =
  KnowledgeIntakeDecisionBase & {
    decision: "new_version";
    duplicateMatch: KnowledgeIntakeDuplicateMatch;
    destination: KnowledgeIntakeDestination & {
      articleId: string;
    };
  };

export type KnowledgeIntakeExistingArticleDecision =
  KnowledgeIntakeDecisionBase & {
    decision: "enrich_existing_article";
    destination: KnowledgeIntakeDestination & {
      articleId: string;
    };
  };

export type KnowledgeIntakeExistingFolderDecision =
  KnowledgeIntakeDecisionBase & {
    decision: "create_article_in_existing_folder";
    destination: KnowledgeIntakeDestination & {
      folderId: string;
    };
  };

export type KnowledgeIntakeNewFolderDecision =
  KnowledgeIntakeDecisionBase & {
    decision: "create_article_in_new_folder";
    destination: KnowledgeIntakeDestination & {
      newFolderName: string;
    };
  };

export type KnowledgeIntakeDocumentDecision =
  | KnowledgeIntakeDuplicateDecision
  | KnowledgeIntakeNewVersionDecision
  | KnowledgeIntakeExistingArticleDecision
  | KnowledgeIntakeExistingFolderDecision
  | KnowledgeIntakeNewFolderDecision;

export type KnowledgeIntakeProposalSummary = {
  totalDocuments: number;
  exactDuplicates: number;
  possibleDuplicates: number;
  newVersions: number;
  articleEnrichments: number;
  newArticlesInExistingFolders: number;
  newArticlesInNewFolders: number;
};

export type KnowledgeIntakeProposal = {
  title: string;
  description: string;
  libraryId: string;
  generatedAt: string;
  summary: KnowledgeIntakeProposalSummary;
  decisions: KnowledgeIntakeDocumentDecision[];
  warnings: string[];
  context?: KnowledgeIntakeContext;
};

export type AnalyzeKnowledgeIntakeInput = {
  userId: string;
  libraryId: string;
  documents: KnowledgeIntakeDocumentInput[];
};

export type AnalyzeKnowledgeIntakeResult = {
  status: "proposal_ready";
  proposal: KnowledgeIntakeProposal;
};

export type KnowledgeIntakeIgnoredDocument = {
  documentId: string;
  documentName: string;
  reason:
    | "exact_duplicate"
    | "possible_duplicate";
};

// lib/knowledge/intake/types.ts

export type KnowledgeIntakeCreatedArticle = {
  id: string;
  title: string;
  libraryId: string;
  path: string[];
  documentIds: string[];
};

export type KnowledgeIntakeUpdatedArticle = {
  id: string;
  title: string;
  path: string[];
  documentIds: string[];
};

export type ConfirmKnowledgeIntakeResult = {
  success: true;
  status: "completed";
  summary: {
    createdArticles: number;
    updatedArticles: number;
    ignoredDocuments: number;
    attachedDocuments: number;
  };
  createdArticles: KnowledgeIntakeCreatedArticle[];
  updatedArticles: KnowledgeIntakeUpdatedArticle[];
  ignoredDocuments: KnowledgeIntakeIgnoredDocument[];
};

export type AnalyzeStoredKnowledgeIntakeInput = {
  importId: string;
  userId: string;
  context: KnowledgeIntakeContext;
};

export type AnalyzeStoredKnowledgeIntakeResult = {
  importId: string;
  proposal: KnowledgeIntakeProposal;
};

