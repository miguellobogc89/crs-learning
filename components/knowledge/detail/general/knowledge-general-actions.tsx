
﻿// components/knowledge/detail/general/knowledge-general-actions.tsx

"use client";

import { parseKnowledgeAnalysis } from
  "@/lib/knowledge/parse-knowledge-analysis";

import type { KnowledgeExecutiveSummary } from
  "@/lib/knowledge/knowledge-analysis.types";

import { KnowledgeSummaryPanel } from
  "./knowledge-summary-panel";

type Props = {
  analysisJson: unknown;
  isRebuilding: boolean;
  onRebuild: () => void;

  isEditing?: boolean;
  draft?: KnowledgeExecutiveSummary;
  onDraftChange?: (draft: KnowledgeExecutiveSummary) => void;
};

export function KnowledgeGeneralActions({
  analysisJson,
  isEditing = false,
  draft,
  onDraftChange,
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

  return (
    <KnowledgeSummaryPanel
      summary={summary}
      isEditing={isEditing}
      draft={draft}
      onDraftChange={onDraftChange}
    />
  );
}