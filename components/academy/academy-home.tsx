import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Clock3, MessageSquare, Sparkles } from "lucide-react";
import { AppCard } from "@/components/app/layouts/app-card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { academyHref } from "@/lib/navigation/academy-sections";
import { AcademyMockAction } from "./academy-mock-action";
import { academyLearning, academyRecommendations } from "./academy-mock-data";

export function AcademyHome() {
  const completed = academyLearning.filter((course) => course.progress === 100);
  const inProgress = academyLearning.filter((course) => course.progress > 0 && course.progress < 100);
  const pending = academyLearning.filter((course) => course.progress === 0);
  const assigned = academyLearning.filter((course) => "assignment" in course && course.progress < 100);
  const overallProgress = Math.round(
    academyLearning.reduce((total, course) => total + course.progress, 0) / academyLearning.length,
  );

  return (
    <div className="space-y-6">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="academy-pending" className="min-w-0">
          <AppCard className="h-full p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="academy-pending" className="text-sm font-semibold text-slate-900">Formación pendiente</h2>
              <Badge variant="secondary">{assigned.length} asignadas</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">Tus próximas fechas límite.</p>
            <ul className="mt-4 divide-y divide-slate-100">
              {assigned.map((course) => (
                <li key={course.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-amber-700">{course.assignment}</p>
                    <h3 className="mt-1 text-sm font-medium text-slate-800">{course.title}</h3>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      Fecha límite: <time dateTime={course.deadline}>{course.deadlineLabel}</time>
                    </p>
                  </div>
                  <AcademyMockAction title={course.title} label={course.progress > 0 ? "Continuar" : "Empezar"} />
                </li>
              ))}
            </ul>
          </AppCard>
        </section>

        <section aria-labelledby="academy-progress" className="min-w-0">
          <AppCard className="h-full p-5">
            <h2 id="academy-progress" className="text-sm font-semibold text-slate-900">Tu progreso</h2>
            <div className="mt-5 flex items-baseline justify-between gap-3">
              <p className="text-3xl font-semibold tracking-tight text-slate-950">{overallProgress}<span className="text-lg text-slate-400"> %</span></p>
              <span className="text-xs text-slate-500">Progreso global</span>
            </div>
            <Progress value={overallProgress} aria-label="Progreso global" aria-valuenow={overallProgress} className="mt-3 h-2 bg-blue-50 [&_[data-slot=progress-indicator]]:bg-blue-600" />
            <p className="mt-2 text-xs text-slate-500">Avance medio en tus {academyLearning.length} cursos.</p>
            <dl className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
              {[
                { label: "Completados", value: completed.length, color: "text-emerald-600" },
                { label: "En curso", value: inProgress.length, color: "text-blue-600" },
                { label: "Pendientes", value: pending.length, color: "text-amber-600" },
              ].map((stat) => (
                <div key={stat.label} className="flex min-w-0 flex-col gap-1">
                  <dt className="text-[11px] text-slate-500">{stat.label}</dt>
                  <dd className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</dd>
                </div>
              ))}
            </dl>
          </AppCard>
        </section>
      </div>

      <section aria-labelledby="academy-recommended">
        <h2 id="academy-recommended" className="text-sm font-semibold text-slate-900">Recomendados para ti</h2>
        <p className="mt-1 text-xs text-slate-500">Un siguiente paso para seguir creciendo.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {academyRecommendations.slice(0, 4).map((course) => (
            <AppCard key={course.id} className="flex h-full flex-col p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><BookOpen aria-hidden="true" className="h-4 w-4" /></span>
                <p className="text-[11px] font-medium text-slate-500">{course.category}</p>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-800">{course.title}</h3>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{course.duration}</p>
              <div className="mt-auto pt-4">
                <p className="flex items-start gap-2 rounded-xl bg-blue-50/70 p-3 text-xs leading-relaxed text-blue-700"><Sparkles aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{course.reason}</p>
              </div>
            </AppCard>
          ))}
        </div>
      </section>

      <section aria-labelledby="academy-continue">
        <h2 id="academy-continue" className="text-sm font-semibold text-slate-900">Continúa aprendiendo</h2>
        <p className="mt-1 text-xs text-slate-500">Retoma donde lo dejaste.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {inProgress.slice(0, 3).map((course) => (
            <AppCard key={course.id} className="flex h-full flex-col p-5">
              <p className="text-[11px] font-medium text-slate-500">{course.category}</p>
              <h3 className="mt-2 text-sm font-semibold text-slate-800">{course.title}</h3>
              <div className="mt-auto pt-5">
                <div className="mb-2 flex justify-between gap-2 text-xs text-slate-500"><span>{course.duration}</span><span className="font-medium text-blue-600">{course.progress} %</span></div>
                <Progress value={course.progress} aria-label={`Progreso: ${course.title}`} aria-valuenow={course.progress} className="h-1.5 bg-blue-50 [&_[data-slot=progress-indicator]]:bg-blue-600" />
                <div className="mt-4"><AcademyMockAction title={course.title} label="Continuar" /></div>
              </div>
            </AppCard>
          ))}
        </div>
      </section>

      <Link href={academyHref("requests")} className="flex w-fit max-w-full items-center gap-2 rounded-lg py-2 text-xs text-slate-500 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <MessageSquare aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>¿Echas en falta una formación? Propón o vota en Solicitudes</span>
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      </Link>
    </div>
  );
}
