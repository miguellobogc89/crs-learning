import Link from "next/link";
import {
  AlertTriangle,
  Bookmark,
  CalendarClock,
  Clock3,
  ShieldCheck,
  Star,
} from "lucide-react";

import { AppCard } from "@/components/app/layouts/app-card";
import { AcademyMockAction } from "@/components/academy/academy-mock-action";
import type { AcademyRecommendation } from "@/components/academy/academy-mock-data";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { academyHref } from "@/lib/navigation/academy-sections";
import type {
  AcademyHomeAssignment,
  AcademyHomeCourse,
  AcademyThumbnailVariant,
} from "@/lib/services/academy.service";

const thumbnailStyles: Record<AcademyThumbnailVariant, string> = {
  analytics: "from-sky-100 via-white to-blue-200 text-blue-600",
  team: "from-slate-100 via-white to-indigo-200 text-indigo-600",
  security: "from-cyan-950 via-slate-900 to-blue-800 text-cyan-200",
  risk: "from-amber-100 via-white to-orange-200 text-orange-600",
  ai: "from-cyan-950 via-slate-900 to-violet-800 text-cyan-200",
  agile: "from-emerald-100 via-white to-amber-200 text-emerald-700",
  knowledge: "from-blue-50 via-white to-violet-100 text-blue-600",
};

function SectionHeading({
  title,
  href,
  action,
}: {
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <h2 className="min-w-0 text-base font-semibold tracking-tight text-slate-950">
        {title}
      </h2>
      {href && action ? (
        <Link
          href={href}
          className="shrink-0 text-xs font-medium text-brand hover:text-brand-hover"
        >
          {action}
        </Link>
      ) : null}
    </div>
  );
}

export function AcademyThumbnail({
  variant,
  url,
  className,
}: {
  variant: AcademyThumbnailVariant;
  url?: string | null;
  className?: string;
}) {
  if (url) {
    return (
      <div
        className={cn(
          "shrink-0 overflow-hidden rounded-xl bg-cover bg-center",
          className,
        )}
        style={{
          backgroundImage: `url(${url})`,
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative isolate flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br",
        thumbnailStyles[variant],
        className,
      )}
    >
      <div className="absolute inset-x-2 top-3 h-px bg-current/20" />
      <div className="absolute bottom-2 left-2 h-5 w-8 rounded-md bg-white/45 shadow-sm" />
      <div className="absolute right-2 top-2 h-8 w-6 rounded-md bg-white/35 shadow-sm" />
      <ShieldCheck aria-hidden="true" className="relative h-7 w-7" />
    </div>
  );
}

export function ContinueLearningSection({ courses }: { courses: AcademyHomeCourse[] }) {
  return (
    <AppCard className="p-4 sm:p-5">
      <SectionHeading
        title="Continua aprendiendo"
        href={academyHref("learning")}
        action="Ver mi aprendizaje"
      />
      {courses.length > 0 ? (
        <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-3">
          {courses.map((course) => (
          <article
            key={course.id}
            className="min-w-0 rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-card"
          >
            <div className="flex min-w-0 gap-3">
              <AcademyThumbnail
                variant={course.thumbnail}
                url={course.thumbnailUrl}
                className="h-16 w-20"
              />
              <div className="min-w-0 flex-1">
                <Badge
                  variant="secondary"
                  className="max-w-full justify-start truncate bg-brand-soft text-[11px] text-brand"
                >
                  {course.category}
                </Badge>
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-slate-950">
                  {course.title}
                </h3>
                <p className="mt-2 text-xs text-slate-600">{course.progress}% completado</p>
              </div>
            </div>
            <Progress
              value={course.progress}
              aria-label={`Progreso: ${course.title}`}
              aria-valuenow={course.progress}
              className="mt-3 h-1.5 bg-slate-100 [&_[data-slot=progress-indicator]]:bg-brand"
            />
            <div className="mt-3 flex min-w-0 items-center gap-2">
              <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs text-slate-500">
                <Clock3 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                {course.remaining ?? course.duration}
              </p>
              <Bookmark aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
              <AcademyMockAction
                title={course.title}
                label="Continuar"
                variant="brand"
                size="xs"
              />
            </div>
          </article>
          ))}
        </div>
      ) : (
        <EmptyAcademyBlock
          title="No tienes cursos en progreso"
          description="Cuando empieces un curso publicado, aparecera aqui para que puedas retomarlo."
        />
      )}
    </AppCard>
  );
}

export function PendingTrainingSection({ courses }: { courses: AcademyHomeAssignment[] }) {
  return (
    <AppCard className="p-4 sm:p-5">
      <SectionHeading
        title="Formacion pendiente"
        href={academyHref("required")}
        action="Ver todas"
      />
      {courses.length > 0 ? (
        <div className="mt-4 space-y-2">
          {courses.map((course) => (
          <article
            key={course.id}
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-card sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-amber-600">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              </span>
              <AcademyThumbnail
                variant={course.thumbnail}
                url={course.thumbnailUrl}
                className="hidden h-11 w-16 sm:flex"
              />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-slate-950">{course.title}</h3>
                  {course.assignment ? (
                    <Badge
                      variant={course.assignment === "Obligatorio" ? "destructive" : "secondary"}
                      className="h-5 text-[11px]"
                    >
                      {course.assignment}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  Completa el curso antes del {course.deadlineLabel}.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
              <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                {course.dueLabel}
              </p>
              <AcademyMockAction title={course.title} label="Comenzar" size="xs" />
            </div>
          </article>
          ))}
        </div>
      ) : (
        <EmptyAcademyBlock
          title="No tienes formacion pendiente"
          description="Las asignaciones obligatorias o recomendadas apareceran aqui cuando tu equipo las cree."
        />
      )}
    </AppCard>
  );
}

export function RecommendedCoursesSection({
  courses,
}: {
  courses: AcademyRecommendation[];
}) {
  return (
    <AppCard className="p-4 sm:p-5">
      <SectionHeading
        title="Recomendados para ti"
        href={academyHref("catalog")}
        action="Ver todos"
      />
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {courses.map((course) => (
          <article
            key={course.id}
            className="min-w-0 overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 shadow-card"
          >
            <AcademyThumbnail variant={course.thumbnail} className="h-20 w-full rounded-b-none" />
            <div className="p-3">
              <Badge variant="secondary" className="bg-brand-soft text-[11px] text-brand">
                {course.reason}
              </Badge>
              <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-slate-950">
                {course.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                {course.category}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                  {course.duration}
                </span>
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <Star aria-hidden="true" className="h-3.5 w-3.5 fill-warning text-warning" />
                  {course.rating}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </AppCard>
  );
}

function EmptyAcademyBlock({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white/50 p-4">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  );
}
