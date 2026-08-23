// components/ai-usage/admin/stats.tsx
"use client";

import {
  Activity,
  Bot,
  Gauge,
  ThumbsUp,
} from "lucide-react";

type AiUsageStatsProps = {
  stats: {
    weeklyTokens: number;
    activeUsers: number;
    averageTokensPerUser: number;
    satisfactionRate: number | null;
  };
};

export function AiUsageStats({
  stats,
}: AiUsageStatsProps) {
  const items = [
    {
      label: "Consumo esta semana",
      value: stats.weeklyTokens.toLocaleString(),
      detail: "Tokens procesados",
      icon: Bot,
    },
    {
      label: "Usuarios activos",
      value: stats.activeUsers.toLocaleString(),
      detail: "Usuarios que usaron IA",
      icon: Activity,
    },
    {
      label: "Consumo medio",
      value:
        stats.averageTokensPerUser.toLocaleString(),
      detail: "Tokens por usuario activo",
      icon: Gauge,
    },
    {
      label: "Satisfacción",
      value:
        stats.satisfactionRate === null
          ? "—"
          : `${stats.satisfactionRate}%`,
      detail: "Sobre respuestas valoradas",
      icon: ThumbsUp,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-background p-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {item.label}
              </span>

              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="text-xl font-semibold tracking-tight text-foreground">
              {item.value}
            </div>

            <div className="mt-1 text-xs text-muted-foreground">
              {item.detail}
            </div>
          </div>
        );
      })}
    </div>
  );
}