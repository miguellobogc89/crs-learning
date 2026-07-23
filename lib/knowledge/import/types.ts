// lib/knowledge/import/types.ts
export type KnowledgeImportDocumentInput = {
  id: string;
  name: string;
  relativePath: string;
  text: string;
};

export type KnowledgeImportDocumentAnalysis = {
  documentId: string;
  documentName: string;

  title: string;
  summary: string;

  documentType:
    | "procedure"
    | "process"
    | "manual"
    | "template"
    | "spreadsheet"
    | "presentation"
    | "policy"
    | "reference"
    | "report"
    | "other";

  topics: string[];
  entities: string[];
  keywords: string[];

  versionLabel: string | null;
  likelyCurrentVersion: boolean;

  suggestedArticleTitle: string;
  suggestedFolderPath: string[];

  relatedDocumentIds: string[];
};

export type KnowledgeImportArticleProposal = {
  id: string;

    action: "create" | "update";
  existingArticleId: string | null;

  title: string;
  description: string;

  /**
   * null significa que el artículo se propone
   * en la raíz de la biblioteca.
   */
  folderId: string | null;

  documentIds: string[];
  documentNames: string[];

  /**
   * Confianza global de la IA en que los documentos
   * asociados forman una misma unidad de conocimiento.
   */
  confidence: number;
};

export type KnowledgeImportFolderProposal = {
  id: string;

  name: string;
  description: string;

  /**
   * null significa que es una carpeta raíz.
   *
   * La propuesta se almacena de forma plana.
   * La UI reconstruye la jerarquía usando parentFolderId.
   */
  parentFolderId: string | null;
};

export type KnowledgeImportWarningType =
  | "duplicate"
  | "possible_duplicate"
  | "version"
  | "contradiction"
  | "orphan";

export type KnowledgeImportWarningSeverity =
  | "low"
  | "medium"
  | "high";

export type KnowledgeImportWarning = {
  id: string;

  type: KnowledgeImportWarningType;
  severity: KnowledgeImportWarningSeverity;

  title: string;
  description: string;

  documentIds: string[];
  suggestedAction: string;
};

export type KnowledgeImportProposal = {
  title: string;
  description: string;

  summary: {
    totalDocuments: number;
    totalFolders: number;
    totalArticles: number;
    totalWarnings: number;
  };

  /**
   * Estructura plana.
   *
   * Las relaciones entre carpetas se resuelven mediante:
   * folder.parentFolderId
   *
   * La ubicación de los artículos se resuelve mediante:
   * article.folderId
   */
  folders: KnowledgeImportFolderProposal[];
  articles: KnowledgeImportArticleProposal[];

  warnings: KnowledgeImportWarning[];

  documentAnalyses: KnowledgeImportDocumentAnalysis[];
};

export type GenerateKnowledgeImportProposalResult = {
  importId: string;
  status: "proposal_ready";
  proposal: KnowledgeImportProposal;
};

export type KnowledgeImportCreatedFolderLog = {
  proposalFolderId: string;
  databaseFolderId: string;
  name: string;
  parentProposalFolderId: string | null;
  parentDatabaseFolderId: string;
};

export type KnowledgeImportCreatedDocumentLog = {
  importFileId: string;
  knowledgeFileId: string;
  fileName: string;
  articleId: string;
  articleTitle: string;
  extractedCharacters: number;
  storagePath: string | null;
};

export type KnowledgeImportCreatedArticleLog = {
  proposalArticleId: string;

  action: "create" | "update";
  existingArticleId: string | null;

  databaseArticleId: string;
  title: string;
  description: string;
  proposalFolderId: string | null;
  databaseFolderId: string;
  confidence: number;
  documentIds: string[];
  knowledgeFileIds: string[];
};

export type KnowledgeImportExecutionLog = {
  version:
  | "knowledge-import-confirm-v1"
  | "knowledge-import-confirm-v2";

  importId: string;
  status: "completed";

  startedAt: string;
  completedAt: string;
  durationMs: number;

  targetLibrary: {
    id: string;
    name: string;
  };

  userId: string;
  companyId: string | null;

  summary: {
    foldersCreated: number;
    articlesCreated: number;
    articlesUpdated: number;
    documentsCreated: number;
    extractedCharactersStored: number;
    warningsAccepted: number;
  };

  folders: KnowledgeImportCreatedFolderLog[];
  articles: KnowledgeImportCreatedArticleLog[];
  documents: KnowledgeImportCreatedDocumentLog[];

  proposalSnapshot: KnowledgeImportProposal;
};

export type ConfirmKnowledgeImportResult = {
  success: true;
  importId: string;
  status: "completed";
  log: KnowledgeImportExecutionLog;
};