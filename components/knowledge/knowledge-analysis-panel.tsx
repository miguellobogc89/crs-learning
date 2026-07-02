// components/knowledge/knowledge-analysis-panel.tsx
import { KnowledgeSummary } from "@/components/knowledge/knowledge-summary";
import { parseKnowledgeAnalysis } from "@/lib/knowledge/parse-knowledge-analysis";

type Props = {
  analysisJson: unknown;
  status?: string | null;
  model?: string | null;
};

export function KnowledgeAnalysisPanel({
  analysisJson,
  status,
  model,
}: Props) {
  const analysis = parseKnowledgeAnalysis(
  analysisJson as Parameters<typeof parseKnowledgeAnalysis>[0]
);

  if (status === "processing") {
    return (
      <div className="rounded-lg border border-border bg-panel p-6">
        <p className="text-sm font-medium text-foreground">
          Analizando Knowledge...
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-brand" />
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-border bg-panel p-6">
        <p className="text-sm font-medium text-destructive">
          El análisis falló.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Revisa la columna error_message en knowledge_analysis.
        </p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          Todavía no hay análisis disponible.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Guarda o actualiza este Knowledge para generar la comprensión IA.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Comprensión IA
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            Resumen del Knowledge
          </h2>
        </div>

        <div className="text-right text-xs text-muted-foreground">
          <p>{status ?? "completed"}</p>
          {model && <p>{model}</p>}
        </div>
      </div>

      <KnowledgeSummary analysis={analysis} />
    </div>
  );
}