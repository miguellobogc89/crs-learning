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
  return (
    <section
      className="
        flex h-full min-h-0 min-w-0 flex-col
        overflow-hidden rounded-xl
        border border-slate-200
        bg-white
      "
    >
      {/* Cabecera */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#07113D]">
          Continúa aprendiendo
        </h2>

        <Link
          href={academyHref("learning")}
          aria-label="Ver mi aprendizaje"
          className="
            flex h-7 w-7 shrink-0 items-center justify-center
            rounded-lg text-[#315BFF]
            transition-colors hover:bg-[#F1F5FF]
          "
        >
          <ArrowRight
            aria-hidden="true"
            className="h-[18px] w-[18px]"
          />
        </Link>
      </div>

      {/* Cursos */}
      {courses.length > 0 ? (
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-3 gap-3 px-4 pb-3">
          {courses.slice(0, 3).map((course) => (
            <CourseCard
              key={course.id}
              course={course}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-4">
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
}: {
  course: AcademyHomeCourse;
}) {
  return (
    <article
      className="
        flex h-full min-h-0 min-w-0 flex-col
        overflow-hidden rounded-xl
        border border-slate-200
        bg-white
        p-2
        shadow-sm
      "
    >
      {/* Imagen */}
      <AcademyThumbnail
        variant={course.thumbnail}
        url={course.thumbnailUrl}
        className="
          h-[76px] w-full
          shrink-0 rounded-lg
        "
      />

      {/* Categoría */}
      <div className="mt-1.5 shrink-0">
        <span
          className="
            inline-flex max-w-full truncate
            rounded-full
            bg-[#EDF3FF]
            px-2 py-0.5
            text-[10px] font-medium
            leading-[14px]
            text-[#315BFF]
          "
        >
          {course.category}
        </span>
      </div>

      {/* Título */}
      <h3
        className="
          mt-1 line-clamp-2
          min-h-[32px]
          shrink-0
          text-[13px] font-semibold
          leading-[16px]
          tracking-[-0.015em]
          text-[#07113D]
        "
      >
        {course.title}
      </h3>

      {/* Progreso */}
      <div className="mt-auto shrink-0 pt-1.5">
        <p className="text-[11px] font-medium leading-4 text-[#435176]">
          {course.progress}% completado
        </p>

        <Progress
          value={course.progress}
          aria-label={`Progreso de ${course.title}`}
          aria-valuenow={course.progress}
          className="
            mt-1 h-1.5
            bg-[#E4E8F1]
            [&_[data-slot=progress-indicator]]:bg-[#3282FF]
          "
        />

        {/* Tiempo restante */}
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-4 text-[#66728F]">
          <Clock3
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
          />

          <span className="truncate">
            {course.remaining}
          </span>
        </div>

        {/* Continuar */}
        <div className="mt-1.5 flex justify-center">
          <button
            type="button"
            className="
              flex h-7 min-w-[124px]
              items-center justify-center gap-2
              rounded-xl
              bg-[#315BFF]
              px-4
              text-[11px] font-semibold
              text-white
              shadow-sm
              transition-colors
              hover:bg-[#244BE8]
            "
          >
            Continuar

            <ArrowRight
              aria-hidden="true"
              className="h-3.5 w-3.5"
            />
          </button>
        </div>
      </div>
    </article>
  );
}