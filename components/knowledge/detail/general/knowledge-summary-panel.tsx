
// components/knowledge/detail/general/knowledge-summary-panel.tsx

"use client";

import { useMemo } from "react";

import { KnowledgeEditor } from
  "@/components/knowledge/editor/knowledge-editor";

import type { KnowledgeExecutiveSummary } from
  "@/lib/knowledge/knowledge-analysis.types";

type Props = {
  summary: KnowledgeExecutiveSummary;
  isEditing?: boolean;
  draft?: KnowledgeExecutiveSummary;
  onDraftChange?: (draft: KnowledgeExecutiveSummary) => void;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(value: string) {
  return escapeHtml(value)
    .split("\n")
    .map((line) => `<p>${line || "<br>"}</p>`)
    .join("");
}

function summaryToHtml(summary: KnowledgeExecutiveSummary) {
  const points = summary.keyPoints
    .filter((point) => point.trim().length > 0)
    .map((point) => `<li><p>${escapeHtml(point)}</p></li>`)
    .join("");

  return [
    "<h2>Resumen</h2>",
    textToHtml(summary.synthesis),
    "<h2>Puntos clave</h2>",
    `<ul>${points || "<li><p></p></li>"}</ul>`,
  ].join("");
}

export function KnowledgeSummaryPanel({
  summary,
  isEditing = false,
  draft,
  onDraftChange,
}: Props) {
  const initialHtml = useMemo(
    () => summaryToHtml(summary),
    [summary],
  );

  const synthesis = summary.synthesis.trim();

  const keyPoints = summary.keyPoints
    .map((point) => point.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (isEditing) {
    return (
      <div className="w-full min-w-0">
        <KnowledgeEditor
          value={initialHtml}
          onChange={() => {
            // La conexión del borrador HTML y su guardado
            // se realizará en el siguiente paso.
          }}
          editable
          className="w-full"
        />
      </div>
    );
  }

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