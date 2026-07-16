// components/knowledge/detail/summary/contradictions/knowledge-contradictions-review.tsx

"use client";

import {
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import { KnowledgeReviewAccordionItem } from "../review/knowledge-review-accordion-item";
import { KnowledgeReviewBadge } from "../review/knowledge-review-badge";
import { KnowledgeReviewEmptyState } from "../review/knowledge-review-empty-state";
import { KnowledgeReviewSectionHeader } from "../review/knowledge-review-section-header";
import type { Contradiction } from "../summary.types";

type Props = {
  contradictions: Contradiction[];
};

export function KnowledgeContradictionsReview({
  contradictions,
}: Props) {
  if (contradictions.length === 0) {
    return (
      <KnowledgeReviewAccordionItem
        id="knowledge-contradictions"
        title="Contradicciones"
        description="Conflictos detectados entre distintas fuentes documentales."
        icon={
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        }
        badge={
          <KnowledgeReviewBadge variant="success">
            Sin incidencias
          </KnowledgeReviewBadge>
        }
      >
        <KnowledgeReviewEmptyState
          icon={
            <CheckCircle2 className="h-6 w-6" />
          }
          title="No se han encontrado contradicciones"
          description="La IA considera consistente toda la documentación utilizada para construir este artículo."
        />
      </KnowledgeReviewAccordionItem>
    );
  }

  return (
    <KnowledgeReviewAccordionItem
      id="knowledge-contradictions"
      defaultOpen
      title="Contradicciones"
      description="Antes de reconstruir el conocimiento es recomendable resolver estos conflictos."
      icon={
        <AlertTriangle className="h-5 w-5 text-amber-600" />
      }
      badge={
        <KnowledgeReviewBadge variant="warning">
          {contradictions.length} pendientes
        </KnowledgeReviewBadge>
      }
    >
      <KnowledgeReviewSectionHeader
        title="Revisión necesaria"
        description="Cada contradicción representa dos afirmaciones incompatibles detectadas por la IA. En la siguiente iteración aquí aparecerá la comparación completa entre documentos para que puedas decidir cuál conservar."
      />

      <div className="space-y-4">
        {contradictions.map(
          (contradiction, index) => (
            <div
              key={`${contradiction.topic}-${index}`}
              className="rounded-xl border border-border bg-background p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-foreground">
                      {contradiction.topic}
                    </h4>

                    <KnowledgeReviewBadge variant="warning">
                      {contradiction.severity}
                    </KnowledgeReviewBadge>
                  </div>

                  {contradiction.description ? (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {contradiction.description}
                    </p>
                  ) : null}

                  {contradiction.recommendedAction ? (
                    <div className="mt-4 rounded-lg bg-muted/40 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Recomendación de la IA
                      </p>

                      <p className="mt-1 text-sm leading-6 text-foreground">
                        {contradiction.recommendedAction}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    </KnowledgeReviewAccordionItem>
  );
}