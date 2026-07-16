// components/knowledge/detail/summary/knowledge-review-panel.tsx

"use client";

import { KnowledgeContradictionsReview } from "./contradictions/knowledge-contradictions-review";
import { KnowledgeCoverageReview } from "./coverage/knowledge-coverage-review";
import { KnowledgeMergedDocumentsReview } from "./documents/knowledge-merged-documents-review";
import { KnowledgeReferencesReview } from "./references/knowledge-references-review";
import type { KnowledgeFile } from "./summary.types";
import { parseQualityAnalysis } from "./summary.utils";

type Props = {
  analysisJson: unknown;
  files: KnowledgeFile[];
};

export function KnowledgeReviewPanel({
  analysisJson,
  files,
}: Props) {
  const analysis = parseQualityAnalysis(
    analysisJson,
  );

  return (
    <div className="space-y-4">
      {analysis.contradictions.length > 0 ? (
        <KnowledgeContradictionsReview
          contradictions={
            analysis.contradictions
          }
        />
      ) : null}

      <KnowledgeCoverageReview
        qualityReport={analysis.qualityReport}
      />

      <KnowledgeMergedDocumentsReview
        files={files}
        analysis={analysis}
      />

      <KnowledgeReferencesReview
        references={analysis.sourceReferences}
      />
    </div>
  );
}