// components/academy/academy-home/continue-learning-card.tsx

import Link from "next/link";
import {
  ArrowRight,
  Clock3,
} from "lucide-react";

import { AcademyThumbnail } from "@/components/academy/academy-learning-sections";
import { Progress } from "@/components/ui/progress";
import { academyHref } from "@/lib/navigation/academy-sections";
import type { AcademyHomeCourse } from "@/lib/services/academy.service";

type ContinueLearningCardProps = {
  courses: AcademyHomeCourse[];
};

export function ContinueLearningCard({
  courses,
}: ContinueLearningCardProps) {
  const visibleCourses =
    courses.slice(0, 5);

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between px-1 pb-2 pt-1">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#07113D]">
          Continúa aprendiendo
        </h2>

        <Link
          href={academyHref("learning")}
          className="
            flex shrink-0 items-center gap-1.5
            text-[11px] font-semibold
            text-[#315BFF]
            transition-opacity
            hover:opacity-75
          "
        >
          Ver todas

          <ArrowRight
            aria-hidden="true"
            className="h-3.5 w-3.5"
          />
        </Link>
      </div>

      {visibleCourses.length > 0 ? (
        <div
          className="
            grid min-w-0
            grid-cols-[repeat(auto-fit,minmax(170px,1fr))]
            gap-2.5
          "
        >
          {visibleCourses.map(
            (course, index) => (
              <CourseCard
                key={course.id}
                course={course}
                hiddenOnLaptop={
                  index === 4
                }
              />
            ),
          )}
        </div>
      ) : (
        <div className="flex min-h-[190px] items-center justify-center rounded-lg border border-slate-200/60 bg-white px-5">
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">
              No tienes cursos en progreso
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Los cursos que empieces aparecerán aquí.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function CourseCard({
  course,
  hiddenOnLaptop,
}: {
  course: AcademyHomeCourse;
  hiddenOnLaptop: boolean;
}) {
  return (
    <article
      className={`
        ${
          hiddenOnLaptop
            ? "hidden 2xl:flex"
            : "flex"
        }
        min-w-0 flex-col
        overflow-hidden
        rounded-lg
        border border-slate-200/60
        bg-white
        p-2
        shadow-[0_2px_7px_rgba(15,23,42,0.035)]
      `}
    >
      <AcademyThumbnail
        variant={course.thumbnail}
        url={course.thumbnailUrl}
        className="
          h-[76px]
          w-full
          shrink-0
          rounded-md
        "
      />

      <div className="min-w-0 pt-2">
        <span
          className="
            inline-flex
            max-w-full
            truncate
            rounded-full
            bg-[#EDF3FF]
            px-2 py-0.5
            text-[10px]
            font-medium
            leading-[14px]
            text-[#315BFF]
          "
        >
          {course.category}
        </span>

        <h3
          className="
            mt-1
            line-clamp-2
            min-h-[34px]
            text-[13px]
            font-bold
            leading-[17px]
            tracking-[-0.01em]
            text-[#07113D]
          "
        >
          {course.title}
        </h3>
      </div>

      <div className="mt-2">
        <p className="text-[11px] font-medium leading-4 text-[#435176]">
          {course.progress} % completado
        </p>

        <Progress
          value={course.progress}
          aria-label={`Progreso de ${course.title}`}
          aria-valuenow={course.progress}
          className="
            mt-1.5 h-[8px]
            bg-[#E4E8F1]
            [&_[data-slot=progress-indicator]]:bg-[#3282FF]
          "
        />
      </div>

      <div
        className="
          mt-2
          flex min-w-0
          items-center gap-1.5
          text-[11px] leading-4
          text-[#66728F]
        "
      >
        <Clock3
          aria-hidden="true"
          strokeWidth={1.8}
          className="h-3.5 w-3.5 shrink-0"
        />

        <span className="truncate">
          {course.remaining ??
            course.duration}
        </span>
      </div>

      <div className="mt-auto flex justify-center pb-0.5 pt-3">
        <button
          type="button"
          className="
            flex h-9
            w-full max-w-[150px]
            items-center justify-center
            gap-2
            rounded-lg
            bg-gradient-to-r
            from-[#315BFF]
            to-[#5865F2]
            px-3
            text-[12px] font-semibold
            text-white
            shadow-[0_2px_6px_rgba(49,91,255,0.14)]
            transition
            hover:brightness-105
          "
        >
          Continuar

          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4"
          />
        </button>
      </div>
    </article>
  );
}