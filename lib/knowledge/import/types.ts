import type { ImportInventory } from "./build-import-map";
import type { ImportRoute } from "./recommend-route";
import type { ImportContentClassification } from "./classify-content";
// lib/knowledge/import/types.ts

export type KnowledgeImportDocumentInput = {
  id: string;
  name: string;
  relativePath: string;
  text: string;
};

export type KnowledgeImportOrganizationArea = {
  name: string;
  aliases: string[];
  areaType:
    | "direction"
    | "division"
    | "business_unit"
    | "department"
    | "area"
    | "team"
    | "office"
    | "committee"
    | "operational_center"
    | "unknown";
  description: string;
  parentAreaName: string | null;
  confidence: number;
  evidence: {
    text: string;
    reason: string;
  }[];
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


  organizationAreas: KnowledgeImportOrganizationArea[];
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
   * null significa que el artÃ­culo se propone
   * en la raÃ­z de la biblioteca.
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
   * null significa que es una carpeta raÃ­z.
   *
   * La propuesta se almacena de forma plana.
   * La UI reconstruye la jerarquÃ­a usando parentFolderId.
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

/** Document-first decision, independent of whether an article will be generated. */
export type KnowledgeImportDocumentRoute = {
  knowledge: true;
  articleCandidate: boolean;
  structuredCandidate: boolean;
  reason: string;
  structuredFields: string[];
  existingArticleId: string | null;
  existingStructureKeys: string[];
};

export type KnowledgeImportProposal = {
  globalImportMap?: ImportInventory;
  /** One entry per original file. Files without an article remain available in Knowledge. */
  documentRoutes?: Record<string, KnowledgeImportDocumentRoute>;
  contentClassification?: Record<string, ImportContentClassification>;
  recommendedRoutes?: Record<string, ImportRoute>;
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
   * La ubicaciÃ³n de los artÃ­culos se resuelve mediante:
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
  /** "document" is a Knowledge source, not a generated article. */
  sourceKind?: "article" | "document";
  importFileId: string;
  knowledgeFileId: string;
  fileName: string;
  fileSize: number | null;
  articleId: string | null;
  articleTitle: string;
  extractedCharacters: number;
  storagePath: string | null;
};

export type KnowledgeImportSkippedDocumentReason =
  | "duplicate_name_and_size"
  | "duplicate_in_import_batch";

export type KnowledgeImportSkippedDocumentLog = {
  importFileId: string;
  existingKnowledgeFileId: string | null;
  duplicateImportFileId?: string;
  fileName: string;
  fileSize: number | null;
  articleId: string | null;
  articleTitle: string;
  reason: KnowledgeImportSkippedDocumentReason;
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

  /**
   * Todos los documentos que la propuesta asignaba
   * originalmente al artÃ­culo.
   */
  documentIds: string[];

  /**
   * Documentos que se han incorporado realmente.
   */
  createdDocumentIds: string[];

  /**
   * Documentos omitidos por ser duplicados.
   */
  skippedDocumentIds: string[];

  knowledgeFileIds: string[];

  /**
   * Indica si se modificÃ³ realmente el contenido
   * persistente del artÃ­culo.
   */
  contentChanged: boolean;
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
    articlesUnchanged: number;
    documentsCreated: number;
    documentsSkippedAsDuplicates: number;
    extractedCharactersStored: number;
    warningsAccepted: number;
  };

  folders: KnowledgeImportCreatedFolderLog[];
  articles: KnowledgeImportCreatedArticleLog[];
  documents: KnowledgeImportCreatedDocumentLog[];
  skippedDocuments: KnowledgeImportSkippedDocumentLog[];

  engineImports?: Array<{
    knowledgeFileId: string;
    fileName: string;
    status: "completed" | "completed_with_issues" | "no_records_imported" | "error";
    recordsCreated: number;
    recordsUpdated?: number;
    fieldsCompleted?: number;
    recordsReused: number;
    error?: string;
    stages?: Array<{ stage: string; durationMs: number; details: Record<string, number | boolean> }>;
  }>;

  proposalSnapshot: KnowledgeImportProposal;
};

export type ConfirmKnowledgeImportResult = {
  success: true;
  importId: string;
  status: "completed";
  log: KnowledgeImportExecutionLog;
};
