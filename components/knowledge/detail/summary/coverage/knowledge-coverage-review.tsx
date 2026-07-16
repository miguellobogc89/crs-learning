// components/knowledge/detail/summary/coverage/knowledge-coverage-review.tsx

import {
  FileCheck2,
  ShieldAlert,
} from "lucide-react";

import { KnowledgeReviewAccordionItem } from "../review/knowledge-review-accordion-item";
import { KnowledgeReviewBadge } from "../review/knowledge-review-badge";
import { KnowledgeReviewEmptyState } from "../review/knowledge-review-empty-state";
import { KnowledgeReviewSectionHeader } from "../review/knowledge-review-section-header";
import type { QualityReport } from "../summary.types";
import { getCoveragePercentage } from "../summary.utils";

type Props = {
  qualityReport: QualityReport;
};

export function KnowledgeCoverageReview({
  qualityReport,
}: Props) {
  const coverage = getCoveragePercentage(
    qualityReport.sourceCoverage,
  );

  return (
    <KnowledgeReviewAccordionItem
      id="knowledge-coverage"
      title="Cobertura documental"
      description="Explica por qué el artículo tiene este porcentaje de cobertura y qué información falta para alcanzar el 100 %."
      icon={
        <FileCheck2 className="h-5 w-5 text-emerald-600" />
      }
      badge={
        <KnowledgeReviewBadge
          variant={
            coverage === 100
              ? "success"
              : "info"
          }
        >
          {coverage} %
        </KnowledgeReviewBadge>
      }
    >
      <KnowledgeReviewSectionHeader
        title={`${coverage} % de cobertura`}
        description="En el futuro esta sección mostrará exactamente qué afirmaciones están respaldadas, cuáles no tienen evidencia suficiente y qué acciones recomienda la IA para completar el conocimiento."
      />

      {qualityReport.unsupportedClaims.length ===
      0 ? (
        <KnowledgeReviewEmptyState
          icon={
            <FileCheck2 className="h-6 w-6" />
          }
          title="No se han detectado lagunas documentales"
          description="Toda la información consolidada dispone actualmente de una fuente documental asociada."
        />
      ) : (
        <div className="space-y-3">
          {qualityReport.unsupportedClaims.map(
            (claim) => (
              <div
                key={claim}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Información sin respaldo
                    </p>

                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {claim}
                    </p>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </KnowledgeReviewAccordionItem>
  );
}