
// components/knowledge/article/hooks/use-article-analysis.ts

import type { Knowledge } from
  "@/components/knowledge/detail/knowledge-detail.types";

import type {
  ArticleInsightMetrics,
} from "../header/article-insights";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getArticleMetrics(
  analysisJson: unknown,
  fallbackDocumentCount: number,
): ArticleInsightMetrics {
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
    typeof qualityReport.source_coverage === "number"
      ? qualityReport.source_coverage
      : 0;

  const coverage =
    rawCoverage > 0 && rawCoverage <= 1
      ? Math.round(rawCoverage * 100)
      : Math.round(rawCoverage);

  const documentCount =
    qualityReport &&
    typeof qualityReport.document_count === "number" &&
    qualityReport.document_count > 0
      ? qualityReport.document_count
      : fallbackDocumentCount;

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

export function useArticleAnalysis(
  knowledge: Knowledge,
) {
  const analysisJson =
    knowledge.knowledge_analysis?.analysis_json;

  return {
    hasAnalysis:
      analysisJson !== null &&
      analysisJson !== undefined,
    metrics: getArticleMetrics(
      analysisJson,
      knowledge.knowledge_files.length,
    ),
  };
}