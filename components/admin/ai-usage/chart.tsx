// components/admin/ai-usage/chart.tsx

"use client";

type AiUsageChartProps = {
  data: Array<{
    date: string;
    tokens: number;
  }>;
};

export function AiUsageChart({
  data,
}: AiUsageChartProps) {
  return (
    <section className="rounded-xl border border-border bg-background p-5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground">
          Consumo de IA
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Evolución del consumo de tokens en los últimos días.
        </p>
      </div>

      {data.length === 0 ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-lg bg-surface/50">
          <p className="text-sm text-muted-foreground">
            Aún no hay datos de consumo disponibles.
          </p>
        </div>
      ) : (
        <div className="min-h-[260px]">
          {/* Aquí conectaremos el gráfico real */}
        </div>
      )}
    </section>
  );
}