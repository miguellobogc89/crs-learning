// lib/knowledge/knowledge-analysis.types.ts
export type KnowledgeMeta = {
  language: string;
  domain: string;
  level: string;
  confidence: number;
};

export type KnowledgeImportantDate = {
  label: string;
  value: string;
};

export type KnowledgeSystem = {
  name: string;
  description: string;
};

export type KnowledgeActor = {
  name: string;
  role: string;
};

export type KnowledgeConcept = {
  name: string;
  definition: string;
};

export type KnowledgeProcedureStep = {
  order: number;
  title: string;
  instruction: string;
  expectedResult: string;
};

export type KnowledgeProcedure = {
  name: string;
  goal: string;
  steps: KnowledgeProcedureStep[];
};

export type KnowledgeGlossaryItem = {
  term: string;
  definition: string;
};

export type KnowledgeExecutiveSummary = {
  synthesis: string;
  keyPoints: string[];
  conclusion: string | null;
};

export type KnowledgeCatalogTable = {
  title: string;
  description: string;
  columns: string[];
  rows: string[][];
};

export type KnowledgeResponsibility = {
  action: string;
  responsible: string;
  confidence: "identified" | "undetermined" | string;
  notes: string;
};

export type KnowledgeChecklist = {
  title: string;
  items: string[];
};

export type KnowledgeDocumentRole =
  | "procedure"
  | "process"
  | "manual"
  | "policy"
  | "checklist"
  | "form"
  | "faq"
  | "technical"
  | "functional"
  | "catalog"
  | "reference"
  | "evidence"
  | "other";

export type KnowledgeContributionType =
  | "primary"
  | "complementary"
  | "policy"
  | "form"
  | "checklist"
  | "faq"
  | "reference";

export type KnowledgeContributionFocus =
  | "procedure_steps"
  | "validation"
  | "governance"
  | "data_capture"
  | "answers"
  | "technical_detail"
  | "reference_context"
  | "evidence"
  | "mixed";

export type KnowledgeDocumentContribution = {
  sourceId: string;
  fileName: string;
  documentRole: KnowledgeDocumentRole | string;
  contributionType: KnowledgeContributionType | string;
  contributionFocus: KnowledgeContributionFocus | string;
  summary: string;
  supportedSections: string[];
};

export type KnowledgeViewModel = {
  detectedType: string;
  meta: KnowledgeMeta;
  executiveSummary: KnowledgeExecutiveSummary;
  summary: string;
  objective: string;
  scope: string;
  importantDates: KnowledgeImportantDate[];
  systems: KnowledgeSystem[];
  actors: KnowledgeActor[];
  topics: string[];
  concepts: KnowledgeConcept[];
  prerequisites: string[];
  triggers: string[];
  businessRules: string[];
  warnings: string[];
  procedures: KnowledgeProcedure[];
  responsibilities: KnowledgeResponsibility[];
  checklists: KnowledgeChecklist[];
  catalogTables: KnowledgeCatalogTable[];
  outputs: string[];
  glossary: KnowledgeGlossaryItem[];
  commonQuestions: string[];
  commonErrors: string[];
};

export type RawKnowledgeAnalysisJson = Record<string, unknown>;
