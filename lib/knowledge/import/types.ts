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

  title: string;
  description: string;

  documentIds: string[];
  documentNames: string[];

  confidence: number;
};

export type KnowledgeImportFolderProposal = {
  id: string;

  name: string;
  description: string;

  folders: KnowledgeImportFolderProposal[];
  articles: KnowledgeImportArticleProposal[];
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

  folders: KnowledgeImportFolderProposal[];
  rootArticles: KnowledgeImportArticleProposal[];
  warnings: KnowledgeImportWarning[];

  documentAnalyses: KnowledgeImportDocumentAnalysis[];
};

export type GenerateKnowledgeImportProposalResult = {
  importId: string;
  status: "proposal_ready";
  proposal: KnowledgeImportProposal;
};