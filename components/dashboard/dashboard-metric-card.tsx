// components/dashboard/dashboard-metric-card.tsx

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type MetricTone =
  | "blue"
  | "violet"
  | "emerald"
  | "amber";

type DashboardMetricCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: MetricTone;
  chart: number[];
  helper?: string;
};

const toneStyles: Record<
  MetricTone,
  {
    icon: string;
    stroke: string;
    fill: string;
    helper: string;
  }
> = {
  blue: {
    icon: "bg-blue-50 text-blue-600",
    stroke: "#2563EB",
    fill: "#2563EB",
    helper: "text-emerald-600",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600",
    stroke: "#7C3AED",
    fill: "#7C3AED",
    helper: "text-emerald-600",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600",
    stroke: "#10B981",
    fill: "#10B981",
    helper: "text-emerald-600",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600",
    stroke: "#F59E0B",
    fill: "#F59E0B",
    helper: "text-emerald-600",
  },
};

export function DashboardMetricCard({
  label,
  value,
  icon: Icon,
  tone,
  chart,
  helper,
}: DashboardMetricCardProps) {
  const styles = toneStyles[tone];

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
      {/* Título */}
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            styles.icon,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>

        <p className="truncate text-[12px] font-medium text-slate-700">
          {label}
        </p>
      </div>

      {/* Métrica */}
      <div className="mt-3">
        <p className="text-[24px] font-semibold leading-none tracking-[-0.025em] text-slate-950 xl:text-[26px]">
          {value}
        </p>

        {helper ? (
          <p
            className={cn(
              "mt-2 text-[10px] font-medium",
              styles.helper,
            )}
          >
            {helper}
          </p>
        ) : (
          <div className="h-[20px]" />
        )}
      </div>

      {/* Gráfica */}
      <div className="mt-auto h-[38px] w-full">
        <DashboardSparkline
          values={chart}
          stroke={styles.stroke}
          fill={styles.fill}
        />
      </div>
    </article>
  );
}

function DashboardSparkline({
  values,
  stroke,
  fill,
}: {
  values: number[];
  stroke: string;
  fill: string;
}) {
  if (values.length < 2) {
    return null;
  }

  const width = 220;
  const height = 40;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);

  const points = values.map(
    (value, index) => ({
      x:
        (index /
          (values.length - 1)) *
        width,
      y:
        height -
        5 -
        ((value - min) / range) *
          (height - 12),
    }),
  );

  const linePath =
    buildSmoothPath(points);

  const areaPath = [
    linePath,
    `L ${points[points.length - 1].x} ${height}`,
    `L ${points[0].x} ${height}`,
    "Z",
  ].join(" ");

  const gradientId = `sparkline-${stroke.replace(
    "#",
    "",
  )}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-full w-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stopColor={fill}
            stopOpacity="0.12"
          />

          <stop
            offset="100%"
            stopColor={fill}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>

      <path
        d={areaPath}
        fill={`url(#${gradientId})`}
      />

      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function buildSmoothPath(
  points: Array<{
    x: number;
    y: number;
  }>,
) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (
    let index = 0;
    index < points.length - 1;
    index += 1
  ) {
    const current =
      points[index];

    const next =
      points[index + 1];

    const midX =
      (current.x + next.x) / 2;

    const midY =
      (current.y + next.y) / 2;

    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  const last =
    points[points.length - 1];

  path += ` T ${last.x} ${last.y}`;

  return path;
}