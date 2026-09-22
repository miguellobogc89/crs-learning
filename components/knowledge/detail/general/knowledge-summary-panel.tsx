import { BookOpenText } from "lucide-react";

import type { KnowledgeExecutiveSummary } from "@/lib/knowledge/knowledge-analysis.types";

type Props = {
  summary: KnowledgeExecutiveSummary;
};

export function KnowledgeSummaryPanel({
  summary,
}: Props) {
  const synthesis = summary.synthesis.trim();
  const keyPoints = summary.keyPoints.filter(
    (point) => point.trim().length > 0,
  );
  const conclusion = summary.conclusion?.trim() ?? "";

  if (
    !synthesis &&
    keyPoints.length === 0 &&
    !conclusion
  ) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-panel p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <BookOpenText className="h-5 w-5" />
        </div>

        <h2 className="mt-5 text-base font-semibold text-foreground">
          No hay resumen disponible
        </h2>

        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          El analisis existe, pero todavia no incluye un
          resumen breve para este articulo.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-panel p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-cyan-600">
          <BookOpenText className="h-5 w-5" />
        </span>

        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Resumen
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sintesis, puntos clave y conclusion operativa.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-7">
        {synthesis ? (
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Sintesis
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">
              {synthesis}
            </p>
          </div>
        ) : null}

        {keyPoints.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Puntos clave
            </h3>
            <ul className="mt-3 space-y-3">
              {keyPoints.map((point) => (
                <li
                  key={point}
                  className="border-l-2 border-cyan-500 pl-4 text-sm leading-7 text-muted-foreground"
                >
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {conclusion ? (
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Conclusion
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">
              {conclusion}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
