// components/knowledge/detail/summary/summary.types.ts

import type { KnowledgeDocumentContribution } from "@/lib/knowledge/knowledge-analysis.types";

export type { KnowledgeFile } from "../knowledge-detail.types";

export type QualityReport = {
  documentCount: number;
  sourceCoverage: number;
  contradictionCount: number;
  duplicateTopics: string[];
  complementaryTopics: string[];
  unsupportedClaims: string[];
  confidenceNotes: string[];
};

export type SourceReference = {
  section: string;
  claim: string;
  sourceIds: string[];
  sourceFiles: string[];
  pages: number[];
};

export type Contradiction = {
  topic: string;
  description: string;
  severity: string;
  recommendedAction: string;
};

export type ParsedQualityAnalysis = {
  qualityReport: QualityReport;
  documentContributions: KnowledgeDocumentContribution[];
  sourceReferences: SourceReference[];
  contradictions: Contradiction[];
};