
// components/knowledge/detail/general/knowledge-general-actions.tsx

"use client";

import { parseKnowledgeAnalysis } from
  "@/lib/knowledge/parse-knowledge-analysis";

import { KnowledgeSummaryPanel } from
  "./knowledge-summary-panel";

type Props = {
  analysisJson: unknown;
  isRebuilding: boolean;
  onRebuild: () => void;
};

export function KnowledgeGeneralActions({
  analysisJson,
}: Props) {
  const analysis = parseKnowledgeAnalysis(
    analysisJson as Parameters<
      typeof parseKnowledgeAnalysis
    >[0],
  );

  const summary = analysis?.executiveSummary;

  if (!summary) {
    return null;
  }

  return <KnowledgeSummaryPanel summary={summary} />;
}