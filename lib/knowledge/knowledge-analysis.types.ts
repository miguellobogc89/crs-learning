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

export type KnowledgeViewModel = {
  detectedType: string;
  meta: KnowledgeMeta;
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
  outputs: string[];
  glossary: KnowledgeGlossaryItem[];
  commonQuestions: string[];
  commonErrors: string[];
};

export type RawKnowledgeAnalysisJson = Record<string, unknown>;