// components/knowledge/detail/header/knowledge-header-insights.tsx

import {
  AlertTriangle,
  FileCheck2,
  FileText,
  Link2,
} from "lucide-react";

export type KnowledgeInsightMetrics = {
  coverage: number;
  documentCount: number;
  referenceCount: number;
  contradictionCount: number;
};

type Props = {
  metrics: KnowledgeInsightMetrics;
};

export function KnowledgeHeaderInsights({
  metrics,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InsightPill
        icon={<FileCheck2 className="h-3.5 w-3.5" />}
        value={`${metrics.coverage} %`}
        label="Cobertura"
        className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
      />

      <InsightPill
        icon={<FileText className="h-3.5 w-3.5" />}
        value={String(metrics.documentCount)}
        label="Documentos fusionados"
        className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
      />

      <InsightPill
        icon={<Link2 className="h-3.5 w-3.5" />}
        value={String(metrics.referenceCount)}
        label="Referencias"
        className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300"
      />

      <InsightPill
        icon={
          <AlertTriangle className="h-3.5 w-3.5" />
        }
        value={String(metrics.contradictionCount)}
        label={
          metrics.contradictionCount === 1
            ? "Contradicción"
            : "Contradicciones"
        }
        className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
      />
    </div>
  );
}

type InsightPillProps = {
  icon: React.ReactNode;
  value: string;
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
    <button
      type="button"
      className={[
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-opacity hover:opacity-80",
        className,
      ].join(" ")}
    >
      {icon}

      <span className="font-semibold">
        {value}
      </span>

      <span>{label}</span>
    </button>
  );
}