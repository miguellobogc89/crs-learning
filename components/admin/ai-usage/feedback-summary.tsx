// components/admin/ai-usage/feedback-summary.tsx

"use client";

import {
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

type AiFeedbackSummaryProps = {
  feedback: {
    positive: number;
    negative: number;
    total: number;
    satisfactionRate: number | null;
  };
};

export function AiFeedbackSummary({
  feedback,
}: AiFeedbackSummaryProps) {
  return (
    <section className="rounded-xl border border-border bg-background p-5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground">
          Feedback
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Valoración de las respuestas generadas por el asistente.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg bg-surface p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background">
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
          </div>

          <div>
            <div className="text-lg font-semibold">
              {feedback.positive}
            </div>

            <div className="text-xs text-muted-foreground">
              Positivos
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-surface p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background">
            <ThumbsDown className="h-4 w-4 text-muted-foreground" />
          </div>

          <div>
            <div className="text-lg font-semibold">
              {feedback.negative}
            </div>

            <div className="text-xs text-muted-foreground">
              Negativos
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-surface p-4">
          <div className="text-lg font-semibold">
            {feedback.satisfactionRate === null
              ? "—"
              : `${feedback.satisfactionRate}%`}
          </div>

          <div className="mt-1 text-xs text-muted-foreground">
            Satisfacción
          </div>
        </div>
      </div>
    </section>
  );
}