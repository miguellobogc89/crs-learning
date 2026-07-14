// components/knowledge/detail/hooks/use-knowledge-analysis.ts

import type { Knowledge } from "../knowledge-detail.types";
import {
  getSourceContributions,
  isRecord,
} from "../knowledge-detail.utils";

type UseKnowledgeAnalysisParams = {
  knowledge: Knowledge;
};

export function useKnowledgeAnalysis({
  knowledge,
}: UseKnowledgeAnalysisParams) {
  const analysisJson =
    knowledge.knowledge_analysis?.analysis_json;

  const hasAnalysis =
    analysisJson !== null &&
    analysisJson !== undefined;

  const sourceContributions =
    getSourceContributions(analysisJson);

  const metrics = getKnowledgeMetrics({
    analysisJson,
    fallbackDocumentCount:
      knowledge.knowledge_files.length,
  });

  function getContributionPercentage(
    knowledgeFileId: string,
  ) {
    const contribution = sourceContributions.find(
      (item) =>
        item.knowledgeFileId === knowledgeFileId,
    );

    return contribution?.percentage ?? null;
  }

  return {
    hasAnalysis,
    sourceContributions,
    metrics,
    getContributionPercentage,
  };
}

function getKnowledgeMetrics({
  analysisJson,
  fallbackDocumentCount,
}: {
  analysisJson: unknown;
  fallbackDocumentCount: number;
}) {
  if (!isRecord(analysisJson)) {
    return {
      coverage: 0,
      documentCount: fallbackDocumentCount,
      referenceCount: 0,
      contradictionCount: 0,
    };
  }

  const qualityReport = isRecord(
    analysisJson.quality_report,
  )
    ? analysisJson.quality_report
    : null;

  const rawCoverage =
    qualityReport &&
    typeof qualityReport.source_coverage ===
      "number"
      ? qualityReport.source_coverage
      : 0;

  let coverage = Math.round(rawCoverage);

  if (rawCoverage > 0 && rawCoverage <= 1) {
    coverage = Math.round(rawCoverage * 100);
  }

  let documentCount = fallbackDocumentCount;

  if (
    qualityReport &&
    typeof qualityReport.document_count ===
      "number" &&
    qualityReport.document_count > 0
  ) {
    documentCount =
      qualityReport.document_count;
  }

  const referenceCount = Array.isArray(
    analysisJson.source_references,
  )
    ? analysisJson.source_references.length
    : 0;

  const contradictionCount = Array.isArray(
    analysisJson.contradictions,
  )
    ? analysisJson.contradictions.length
    : 0;

  return {
    coverage,
    documentCount,
    referenceCount,
    contradictionCount,
  };
}