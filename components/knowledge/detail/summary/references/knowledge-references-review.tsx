// components/knowledge/detail/summary/references/knowledge-references-review.tsx

import Link from "next/link";
import {
  ExternalLink,
  Link2,
} from "lucide-react";

import { KnowledgeReviewAccordionItem } from "../review/knowledge-review-accordion-item";
import { KnowledgeReviewBadge } from "../review/knowledge-review-badge";
import { KnowledgeReviewEmptyState } from "../review/knowledge-review-empty-state";
import { KnowledgeReviewSectionHeader } from "../review/knowledge-review-section-header";
import type { SourceReference } from "../summary.types";

type Props = {
  references: SourceReference[];
};

export function KnowledgeReferencesReview({
  references,
}: Props) {
  if (references.length === 0) {
    return (
      <KnowledgeReviewAccordionItem
        id="knowledge-references"
        title="Referencias"
        description="Artículos, documentos y fuentes relacionados con este conocimiento."
        icon={
          <Link2 className="h-5 w-5 text-violet-600" />
        }
        badge={
          <KnowledgeReviewBadge>
            0 referencias
          </KnowledgeReviewBadge>
        }
      >
        <KnowledgeReviewEmptyState
          icon={<Link2 className="h-6 w-6" />}
          title="No hay referencias relacionadas"
          description="La IA todavía no ha identificado artículos o fuentes adicionales vinculadas con este conocimiento."
        />
      </KnowledgeReviewAccordionItem>
    );
  }

  return (
    <KnowledgeReviewAccordionItem
      id="knowledge-references"
      title="Referencias"
      description="Fuentes utilizadas para respaldar afirmaciones concretas del artículo."
      icon={
        <Link2 className="h-5 w-5 text-violet-600" />
      }
      badge={
        <KnowledgeReviewBadge>
          {references.length} referencias
        </KnowledgeReviewBadge>
      }
    >
      <KnowledgeReviewSectionHeader
        title="Relaciones documentales"
        description="Cada referencia indica qué afirmación está respaldada, qué fuente la soporta y en qué sección del artículo se utiliza."
      />

      <div className="overflow-hidden rounded-xl border border-border">
        {references.map((reference, index) => (
          <div
            key={`${reference.section}-${reference.claim}-${index}`}
            className="border-b border-border p-4 last:border-b-0 hover:bg-muted/30"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                <Link2 className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {reference.section}
                </p>

                <p className="mt-1 text-sm font-medium leading-6 text-foreground">
                  {reference.claim}
                </p>

                {reference.sourceFiles.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reference.sourceFiles.map(
                      (sourceFile, sourceIndex) => {
                        const sourceId =
                          reference.sourceIds[
                            sourceIndex
                          ];

                        const page =
                          reference.pages[
                            sourceIndex
                          ];

                        if (!sourceId) {
                          return (
                            <span
                              key={`${sourceFile}-${sourceIndex}`}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground"
                            >
                              {sourceFile}

                              {page ? (
                                <span>
                                  · pág. {page}
                                </span>
                              ) : null}
                            </span>
                          );
                        }

                        return (
                          <Link
                            key={`${sourceId}-${sourceIndex}`}
                            href={`/knowledge/${sourceId}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50"
                          >
                            {sourceFile}

                            {page ? (
                              <span>
                                · pág. {page}
                              </span>
                            ) : null}

                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        );
                      },
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </KnowledgeReviewAccordionItem>
  );
}