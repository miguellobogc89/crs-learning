
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

  isEditing?: boolean;
  htmlDraft?: string;
  onHtmlDraftChange?: (html: string) => void;
};

function getSavedSummaryHtml(
  analysisJson: unknown,
): string | null {
  if (
    typeof analysisJson !== "object" ||
    analysisJson === null ||
    Array.isArray(analysisJson)
  ) {
    return null;
  }

  const editableContent =
    (analysisJson as Record<string, unknown>)
      .editableContent;

  if (
    typeof editableContent !== "object" ||
    editableContent === null ||
    Array.isArray(editableContent)
  ) {
    return null;
  }

  const html =
    (editableContent as Record<string, unknown>)
      .generalSummaryHtml;

  return typeof html === "string"
    ? html
    : null;
}

export function KnowledgeGeneralActions({
  analysisJson,
  isEditing = false,
  htmlDraft,
  onHtmlDraftChange,
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
      savedHtml={getSavedSummaryHtml(analysisJson)}
      htmlDraft={htmlDraft}
      onHtmlDraftChange={onHtmlDraftChange}
    />
  );
}