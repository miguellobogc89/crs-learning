
// components/academy/course-detail/academy-course-detail-header.tsx

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  GraduationCap,
  UserRound,
} from "lucide-react";

import { AcademyThumbnail } from "@/components/academy/academy-learning-sections";
import type { AcademyCourseDetail } from "@/lib/services/academy.service";

function formatDuration(minutes: number) {
  if (minutes <= 0) return "Sin estimación";

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function AcademyCourseDetailHeader({
  detail,
}: {
  detail: AcademyCourseDetail;
}) {
  const { course, canManage } = detail;

  const lessonCount = course.sections.reduce(
    (total, section) => total + section.lessons.length,
    0,
  );

  const hasContent = lessonCount > 0;

  const progress =
    course.user_course_progress[0]?.progress_percent ?? 0;

  const level =
    course.level === "advanced"
      ? "Avanzado"
      : course.level === "intermediate"
        ? "Intermedio"
        : "Básico";

  const formattedDate = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(course.updated_at);

  return (
    <header className="min-w-0 border-b border-slate-200 py-4 xl:py-5">
      <div className="grid min-w-0 grid-cols-[190px_minmax(0,1fr)] items-stretch gap-5 xl:grid-cols-[270px_minmax(0,1fr)] xl:gap-6 2xl:grid-cols-[310px_minmax(0,1fr)]">
        <AcademyThumbnail
          variant="knowledge"
          url={
            course.thumbnail_url
              ? `/api/academy/course-cover/${course.id}`
              : null
          }
          className="h-[170px] w-full rounded-xl xl:h-[210px] 2xl:h-[235px]"
        />

        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[#EDF3FF] px-3 py-1 text-xs font-semibold text-[#315BFF]">
                {course.category || "Academy"}
              </span>

              {!course.is_published && (
                <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Borrador
                </span>
              )}
            </div>

            {hasContent && (course.is_published || canManage) && (
              <Link
                href={`/courses/${course.id}/learn`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#315BFF] px-5 text-xs font-semibold text-white transition hover:bg-[#244BE8] xl:text-sm"
              >
                {!course.is_published
                  ? "Probar formación"
                  : progress > 0
                    ? "Continuar curso"
                    : "Iniciar curso"}

                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>

          <h1 className="mt-3 line-clamp-2 text-2xl font-bold tracking-tight text-[#07113D] xl:text-3xl">
            {course.title}
          </h1>

          {course.description && (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#66728F]">
              {course.description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Chip icon={<GraduationCap className="h-4 w-4" />}>
              {level}
            </Chip>

            <Chip icon={<Clock3 className="h-4 w-4" />}>
              {formatDuration(detail.estimatedMinutes)}
            </Chip>

            <Chip icon={<BookOpen className="h-4 w-4" />}>
              {course.sections.length} módulos
            </Chip>

            <Chip icon={<BookOpen className="h-4 w-4" />}>
              {lessonCount} lecciones
            </Chip>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 pt-4">
            {course.users?.name && (
              <div className="flex items-center gap-2 text-xs text-[#53617F]">
                <UserRound className="h-4 w-4 text-[#315BFF]" />
                Creado por{" "}
                <strong className="text-[#07113D]">
                  {course.users.name}
                </strong>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-[#53617F]">
              <CalendarDays className="h-4 w-4 text-[#315BFF]" />
              Actualizado el {formattedDate}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Chip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-[#53617F]">
      <span className="text-[#315BFF]">{icon}</span>
      {children}
    </span>
  );
}
