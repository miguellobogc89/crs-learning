// components/knowledge/article/header/article-insights.tsx

import {
  AlertTriangle,
  FileCheck2,
  FileText,
  Link2,
} from "lucide-react";

export type ArticleInsightMetrics = {
  coverage: number;
  documentCount: number;
  referenceCount: number;
  contradictionCount: number;
};

type ArticleInsightsProps = {
  metrics: ArticleInsightMetrics;
  knowledgeTypeLabel: string;
};

type InsightPillProps = {
  icon?: React.ReactNode;
  value?: string;
  label: string;
  className: string;
};

function InsightPill({
  icon,
  value,
  label,
  className,
}: InsightPillProps) {
  return (
    <div
      className={[
        "inline-flex h-[26px] items-center gap-1 rounded-full border px-2 text-[10px] font-medium",
        className,
      ].join(" ")}
    >
      {icon}

      {value ? (
        <span className="font-semibold">
          {value}
        </span>
      ) : null}

      <span>{label}</span>
    </div>
  );
}

export function ArticleInsights({
  metrics,
  knowledgeTypeLabel,
}: ArticleInsightsProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <InsightPill
        label={knowledgeTypeLabel}
        className="border-blue-200 bg-blue-50 text-blue-700"
      />

      <InsightPill
        icon={
          <FileCheck2 className="h-3 w-3" />
        }
        value={`${metrics.coverage} %`}
        label="Cobertura"
        className="border-emerald-200 bg-emerald-50 text-emerald-700"
      />

      <InsightPill
        icon={
          <FileText className="h-3 w-3" />
        }
        value={String(
          metrics.documentCount,
        )}
        label="Documentos fusionados"
        className="border-blue-200 bg-blue-50 text-blue-700"
      />

      <InsightPill
        icon={
          <Link2 className="h-3 w-3" />
        }
        value={String(
          metrics.referenceCount,
        )}
        label="Referencias"
        className="border-violet-200 bg-violet-50 text-violet-700"
      />

      <InsightPill
        icon={
          <AlertTriangle className="h-3 w-3" />
        }
        value={String(
          metrics.contradictionCount,
        )}
        label={
          metrics.contradictionCount ===
          1
            ? "Contradicción"
            : "Contradicciones"
        }
        className="border-amber-200 bg-amber-50 text-amber-700"
      />
    </div>
  );
}