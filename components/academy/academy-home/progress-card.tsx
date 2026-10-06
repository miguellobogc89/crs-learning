// components/academy/academy-home/progress-card.tsx

import {
  Award,
  CheckCircle2,
  Clock3,
  Layers3,
  Mail,
  Target,
} from "lucide-react";

import type { AcademyHomeProgressSummary } from "@/lib/services/academy.service";

type ProgressCardProps = {
  progress: AcademyHomeProgressSummary;
};

export function ProgressCard({
  progress,
}: ProgressCardProps) {
  const percentage = Math.min(
    Math.max(progress.global, 0),
    100,
  );

  const radius = 48;
  const circumference =
    2 * Math.PI * radius;

  const offset =
    circumference -
    (percentage / 100) * circumference;

  return (
    <section
      className="
        flex h-full min-h-0 min-w-0 flex-col
        overflow-hidden
        rounded-lg
        bg-transparent
        px-4 pb-4 pt-3
      "
    >
      <div className="flex shrink-0 items-center gap-2">
        <Target
          aria-hidden="true"
          strokeWidth={2.2}
          className="h-[19px] w-[19px] text-[#4567F2]"
        />

        <h2 className="text-[14px] font-bold tracking-[-0.015em] text-[#07113D]">
          Tu progreso
        </h2>
      </div>

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-[42%_58%] items-center">
        <div className="flex items-center justify-center">
          <div className="relative h-[142px] w-[142px]">
            <svg
              viewBox="0 0 120 120"
              className="h-full w-full -rotate-90"
              aria-hidden="true"
            >
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke="#EDF1FA"
                strokeWidth="9"
              />

              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke="url(#academyProgressGradient)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />

              <defs>
                <linearGradient
                  id="academyProgressGradient"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="#315BFF"
                  />

                  <stop
                    offset="100%"
                    stopColor="#5865F2"
                  />
                </linearGradient>
              </defs>
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[27px] font-extrabold leading-none tracking-[-0.04em] text-[#07113D]">
                {percentage} %
              </span>

              <span className="mt-1 text-[11px] font-medium text-[#66728F]">
                Completado
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-3">
          <ProgressMetric
            icon={Mail}
            value={progress.completed}
            label="Cursos completados"
          />

          <ProgressMetric
            icon={Clock3}
            value={progress.inProgress}
            label="En progreso"
          />

          <ProgressMetric
            icon={CheckCircle2}
            value={progress.pending}
            label="Obligatorios pendientes"
          />

          <ProgressMetric
            icon={Award}
            value={progress.skills}
            label="Habilidades adquiridas"
          />
        </div>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-3 gap-2">
        <SummaryMetric
          icon={Clock3}
          value={progress.estimatedCompletedLabel}
          label="Horas de formación"
        />

        <SummaryMetric
          icon={Layers3}
          value={String(progress.skills)}
          label="Habilidades"
        />

        <SummaryMetric
          icon={Award}
          value={String(progress.badges)}
          label="Insignias"
        />
      </div>
    </section>
  );
}

type ProgressMetricProps = {
  icon: typeof Clock3;
  value: number;
  label: string;
};

function ProgressMetric({
  icon: Icon,
  value,
  label,
}: ProgressMetricProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className="
          flex h-7 w-7 shrink-0
          items-center justify-center
          rounded-full
          bg-[#F0F3FA]
        "
      >
        <Icon
          aria-hidden="true"
          strokeWidth={1.8}
          className="h-3.5 w-3.5 text-[#7886A8]"
        />
      </div>

      <span className="w-5 shrink-0 text-[13px] font-bold text-[#07113D]">
        {value}
      </span>

      <span className="truncate text-[11px] font-medium text-[#66728F]">
        {label}
      </span>
    </div>
  );
}

type SummaryMetricProps = {
  icon: typeof Clock3;
  value: string;
  label: string;
};

function SummaryMetric({
  icon: Icon,
  value,
  label,
}: SummaryMetricProps) {
  return (
    <div
      className="
        flex min-w-0 flex-col
        items-center justify-center
        rounded-md
        bg-[#F7F9FD]
        px-2 py-2.5
        text-center
      "
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.9}
        className="h-[20px] w-[20px] text-[#4567F2]"
      />

      <span className="mt-1.5 text-[13px] font-bold leading-none text-[#07113D]">
        {value}
      </span>

      <span className="mt-1 text-[10px] font-medium leading-tight text-[#66728F]">
        {label}
      </span>
    </div>
  );
}