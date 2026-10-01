import Link from "next/link";
import {
  BarChart3,
  BookOpenCheck,
  Clock3,
  Layers3,
  MessageSquare,
  Sparkles,
  ThumbsUp,
  Trophy,
} from "lucide-react";

import { AppCard } from "@/components/app/layouts/app-card";
import { AcademyMockAction } from "@/components/academy/academy-mock-action";
import { AcademyThumbnail } from "@/components/academy/academy-learning-sections";
import {
  academyProgressSummary,
  academyTeamRequests,
  academyWorkRecommendation,
} from "@/components/academy/academy-mock-data";
import { Button } from "@/components/ui/button";
import { academyHref } from "@/lib/navigation/academy-sections";

export function AcademyProgressPanel() {
  const progress = academyProgressSummary.global;

  const metrics = [
    { label: "completados", value: academyProgressSummary.completed, icon: BookOpenCheck },
    { label: "en curso", value: academyProgressSummary.inProgress, icon: Clock3 },
    { label: "pendientes", value: academyProgressSummary.pending, icon: Layers3 },
    { label: "habilidades", value: academyProgressSummary.skills, icon: Sparkles },
  ];

  return (
    <AppCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-slate-950">Tu progreso</h2>
        <Link href={academyHref("learning")} className="text-xs font-medium text-brand hover:text-brand-hover">
          Ver detalles
        </Link>
      </div>
      <div className="mt-5 grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[auto_minmax(0,1fr)]">
        <div
          className="mx-auto flex h-32 w-32 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(var(--brand) ${progress * 3.6}deg, rgb(226 232 240) 0deg)`,
          }}
          aria-label={`Progreso global ${progress}%`}
        >
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-3xl font-semibold text-slate-950 shadow-inner">
            {progress}%
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <div key={metric.label} className="min-w-0 rounded-xl bg-surface/70 p-3">
                <Icon aria-hidden="true" className="h-4 w-4 text-brand" />
                <p className="mt-2 text-lg font-semibold leading-none text-slate-950">{metric.value}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{metric.label}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-brand-soft p-3">
          <p className="text-lg font-semibold leading-none text-slate-950">{academyProgressSummary.hours}</p>
          <p className="mt-1 text-xs text-slate-500">de formacion</p>
        </div>
        <div className="rounded-xl bg-warning-soft p-3">
          <Trophy aria-hidden="true" className="h-4 w-4 text-warning" />
          <p className="mt-2 text-lg font-semibold leading-none text-slate-950">{academyProgressSummary.badges}</p>
          <p className="mt-1 text-xs text-slate-500">insignias</p>
        </div>
      </div>
    </AppCard>
  );
}

export function WorkBasedRecommendationPanel() {
  const course = academyWorkRecommendation;

  return (
    <AppCard className="p-4 sm:p-5">
      <h2 className="text-base font-semibold tracking-tight text-slate-950">Basado en tu trabajo</h2>
      <article className="mt-4 rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-card">
        <div className="flex min-w-0 gap-3">
          <AcademyThumbnail variant={course.thumbnail} className="h-20 w-24" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-950">{course.title}</h3>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-500">
              {course.description}
            </p>
          </div>
        </div>
        <div className="mt-3 flex min-w-0 items-center gap-3">
          <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs text-slate-600">
            <Clock3 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {course.duration}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-slate-600">
            <BarChart3 aria-hidden="true" className="h-3.5 w-3.5 text-brand" />
            {course.level}
          </p>
          <AcademyMockAction title={course.title} label="Ver curso" variant="brand" size="xs" />
        </div>
      </article>
    </AppCard>
  );
}

export function TeamLearningRequestsPanel() {
  return (
    <AppCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold tracking-tight text-slate-950">
          Lo que tu equipo quiere aprender
        </h2>
        <Link href={academyHref("requests")} className="shrink-0 text-xs font-medium text-brand hover:text-brand-hover">
          Ver solicitudes
        </Link>
      </div>
      <div className="mt-4 space-y-2">
        {academyTeamRequests.map((request) => (
          <div
            key={request.id}
            className="flex min-w-0 items-center gap-3 rounded-xl bg-white/70 p-2.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <MessageSquare aria-hidden="true" className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-950">{request.title}</p>
            <p className="shrink-0 text-xs text-slate-500">{request.votes} votos</p>
            <Button variant="outline" size="xs" className="shrink-0">
              <ThumbsUp aria-hidden="true" />
              Votar
            </Button>
          </div>
        ))}
      </div>
    </AppCard>
  );
}
