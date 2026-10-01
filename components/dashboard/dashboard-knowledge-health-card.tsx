// components/dashboard/dashboard-knowledge-health-card.tsx

type DashboardKnowledgeHealthCardProps = {
  healthy: number;
  review: number;
  pending: number;
};

export function DashboardKnowledgeHealthCard({
  healthy,
  review,
  pending,
}: DashboardKnowledgeHealthCardProps) {
  const healthyEnd = healthy;
  const reviewEnd = healthy + review;

  return (
    <article
      className="
        flex h-[164px] min-w-0 flex-col
        rounded-2xl
        border border-white/70
        bg-white/90
        px-4 py-4
        shadow-[0_8px_30px_rgba(31,64,120,0.035)]
        xl:h-[176px]
        xl:px-5
        xl:py-5
      "
    >
      <h2 className="shrink-0 text-[13px] font-semibold text-slate-950 xl:text-sm">
        Salud del conocimiento
      </h2>

      <div className="flex min-h-0 flex-1 items-center gap-4 xl:gap-5">
        {/* Donut */}
        <div
          className="
            relative flex size-[82px] shrink-0
            items-center justify-center rounded-full
            xl:size-82px]
          "
          style={{
            background: `conic-gradient(
              #22c55e 0 ${healthyEnd}%,
              #f59e0b ${healthyEnd}% ${reviewEnd}%,
              #ef4444 ${reviewEnd}% 100%
            )`,
          }}
        >
          <div
            className="
              flex size-[58px] flex-col
              items-center justify-center
              rounded-full bg-white
              xl:size-[68px]
            "
          >
            <span className="text-[17px] font-semibold leading-none tracking-tight text-slate-950 xl:text-lg">
              {healthy}%
            </span>

            <span className="mt-1 text-[8px] text-slate-400 xl:text-[9px]">
              Saludable
            </span>
          </div>
        </div>

        {/* Leyenda */}
        <div className="min-w-0 flex-1 space-y-2 xl:space-y-2.5">
          <HealthLegend
            color="bg-emerald-500"
            label="Saludable"
            value={healthy}
          />

          <HealthLegend
            color="bg-amber-500"
            label="Revisar"
            value={review}
          />

          <HealthLegend
            color="bg-red-500"
            label="Pendiente"
            value={pending}
          />
        </div>
      </div>
    </article>
  );
}

function HealthLegend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={`size-2 shrink-0 rounded-full ${color}`}
      />

      <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500 xl:text-[11px]">
        {label}
      </span>

      <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-700 xl:text-[11px]">
        {value}%
      </span>
    </div>
  );
}