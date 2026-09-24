
// components/knowledge/detail/general/knowledge-summary-panel.tsx

import type { KnowledgeExecutiveSummary } from
  "@/lib/knowledge/knowledge-analysis.types";

type Props = {
  summary: KnowledgeExecutiveSummary;
};

export function KnowledgeSummaryPanel({
  summary,
}: Props) {
  const synthesis = summary.synthesis.trim();

  const keyPoints = summary.keyPoints
    .map((point) => point.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (!synthesis && keyPoints.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Todavía no hay un resumen disponible para este artículo.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-12">
      {synthesis ? (
        <section className="space-y-4 border-b border-border pb-12">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Resumen
          </h2>

          <p className="max-w-4xl whitespace-pre-line text-base leading-8 text-foreground/85">
            {synthesis}
          </p>
        </section>
      ) : null}

      {keyPoints.length > 0 ? (
        <section className="space-y-5">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Puntos clave
          </h2>

          <ul className="max-w-4xl space-y-3">
            {keyPoints.map((point, index) => (
              <li
                key={`${index}-${point}`}
                className="flex items-start gap-3 text-sm leading-7 text-muted-foreground"
              >
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}