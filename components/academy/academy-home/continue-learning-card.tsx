// components/academy/academy-home/continue-learning-card.tsx

import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";

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
        overflow-hidden rounded-lg
        border border-slate-200/80
        bg-white
      "
    >
      {/* Cabecera */}
      <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-2.5">
        <h2 className="text-[14px] font-semibold tracking-[-0.015em] text-[#07113D]">
          Continúa aprendiendo
        </h2>

        <Link
          href={academyHref("learning")}
          aria-label="Ver mi aprendizaje"
          className="
            flex h-6 w-6 shrink-0 items-center justify-center
            rounded-md text-[#315BFF]
            transition-colors hover:bg-[#F1F5FF]
          "
        >
          <ArrowRight
            aria-hidden="true"
            className="h-[17px] w-[17px]"
          />
        </Link>
      </div>

      {/* Cursos */}
      {courses.length > 0 ? (
        <div
          className="
            grid min-h-0 min-w-0 flex-1
grid-cols-5 gap-2.5
overflow-hidden
px-3 pb-3
          "
        >
{courses.map((course) => (
  <CourseCard
    key={course.id}
    course={course}
  />
))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-3">
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
        flex
        h-full
        min-h-0
        w-full
        flex-col
        overflow-hidden
        rounded-lg
        border border-slate-200/60
        bg-white
        p-2
        shadow-[0_2px_7px_rgba(15,23,42,0.035)]
      "
    >
      {/* Imagen · ~30 % */}
      <AcademyThumbnail
        variant={course.thumbnail}
        url={course.thumbnailUrl}
        className="
          h-[29%]
          min-h-0
          w-full
          shrink-0
          rounded-md
        "
      />

      {/* Zona central · categoría + título */}
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div className="shrink-0">
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

        <h3
          className="
            mt-1
            line-clamp-2
            shrink-0
            text-[13px] font-bold
            leading-[17px]
            tracking-[-0.01em]
            text-[#07113D]
          "
        >
          {course.title}
        </h3>
      </div>

      {/* Zona inferior */}
      <div className="shrink-0">
        {/* Progreso */}
        <div>
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

        {/* Tiempo restante */}
        <div
          className="
            mt-2
            flex items-center gap-1.5
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
            {course.remaining ?? course.duration}
          </span>
        </div>

        {/* Botón */}
        <div className="flex justify-center pb-0.5 pt-3">
          <button
            type="button"
            className="
              flex h-9
              w-[62%]
              min-w-[120px]
              items-center justify-center gap-2
              rounded-lg
              bg-gradient-to-r
              from-[#315BFF] to-[#5865F2]
              px-4
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
      </div>
    </article>
  );
}