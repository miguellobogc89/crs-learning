// components/academy/academy-home/recommended-for-you-card.tsx

import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Star,
} from "lucide-react";

import { AcademyThumbnail } from "@/components/academy/academy-learning-sections";
import type { AcademyHomeCourse } from "@/lib/services/academy.service";

type RecommendedForYouCardProps = {
  courses: AcademyHomeCourse[];
};

const RECOMMENDATION_LABELS = [
  "Por tu puesto",
  "Relacionado con tu trabajo",
  "Tendencia en tu área",
  "Por tu desarrollo",
];

export function RecommendedForYouCard({
  courses,
}: RecommendedForYouCardProps) {
  const visibleCourses = courses.slice(0, 4);

  return (
    <section
      className="
        flex h-full min-h-0 min-w-0 flex-col
        overflow-hidden
        rounded-lg
        bg-white
      "
    >
      {/* Cabecera */}
      <div
        className="
          flex shrink-0 items-center justify-between
          px-4 pb-2 pt-2.5
        "
      >
        <h2
          className="
            text-[14px] font-semibold
            tracking-[-0.015em]
            text-[#07113D]
          "
        >
          Recomendados para ti
        </h2>

        <Link
          href="/courses?view=catalog"
          aria-label="Ver todos los cursos recomendados"
          className="
            flex h-6 w-6 shrink-0
            items-center justify-center
            rounded-md
            text-[#315BFF]
            transition-colors
            hover:bg-[#F1F5FF]
          "
        >
          <ArrowRight
            aria-hidden="true"
            className="h-[17px] w-[17px]"
          />
        </Link>
      </div>

      {/* Cursos */}
      {visibleCourses.length > 0 ? (
        <div
          className="
            grid min-h-0 min-w-0 flex-1
            grid-cols-4
            gap-2.5
            overflow-hidden
            px-3 pb-3
          "
        >
          {visibleCourses.map(
            (course, index) => (
              <RecommendedCourseCard
                key={course.id}
                course={course}
                reason={
                  RECOMMENDATION_LABELS[
                    index %
                      RECOMMENDATION_LABELS.length
                  ]
                }
              />
            ),
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-3">
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">
              No hay recomendaciones disponibles
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Cuando haya nuevos cursos aparecerán
              aquí.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function RecommendedCourseCard({
  course,
  reason,
}: {
  course: AcademyHomeCourse;
  reason: string;
}) {
  return (
    <article
      className="
        flex h-full min-h-0 min-w-0
        flex-col
        overflow-hidden
        rounded-lg
        border border-slate-200/70
        bg-white
        shadow-[0_2px_7px_rgba(15,23,42,0.035)]
      "
    >
      {/* Imagen */}
      <div
        className="
          relative h-[39%] min-h-[64px]
          w-full shrink-0
        "
      >
        <AcademyThumbnail
          variant={course.thumbnail}
          url={course.thumbnailUrl}
          className="
            h-full w-full
            rounded-none
          "
        />

        {/* Motivo de recomendación */}
        <span
          className="
            absolute bottom-[-9px] left-2
            inline-flex max-w-[calc(100%-16px)]
            items-center
            truncate
            rounded-full
            bg-[#E6F4FF]
            px-2.5 py-0.5
            text-[10px] font-medium
            leading-[16px]
            text-[#1677D2]
            shadow-[0_1px_2px_rgba(15,23,42,0.05)]
          "
        >
          {reason}
        </span>
      </div>

      {/* Contenido */}
      <div
        className="
          flex min-h-0 flex-1
          flex-col
          px-2.5 pb-2 pt-3
        "
      >
        <h3
          className="
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

        <p
          className="
            mt-1
            line-clamp-2
            min-h-0
            text-[11px] font-normal
            leading-[15px]
            text-[#66728F]
          "
        >
          {course.description ||
            "Amplía tus conocimientos con este curso de Academy."}
        </p>

        {/* Footer */}
        <div
          className="
            mt-auto
            flex shrink-0
            items-center justify-between
            border-t border-slate-100
            pt-2
          "
        >
          <div
            className="
              flex min-w-0 items-center
              gap-1.5
              text-[#66728F]
            "
          >
            <Clock3
              aria-hidden="true"
              strokeWidth={1.8}
              className="h-[14px] w-[14px] shrink-0"
            />

            <span
              className="
                truncate
                text-[11px] font-medium
              "
            >
              {course.duration}
            </span>
          </div>

          <div
            className="
              flex shrink-0
              items-center gap-1
            "
          >
            <Star
              aria-hidden="true"
              strokeWidth={1.8}
              className="
                h-[14px] w-[14px]
                text-[#FFB020]
              "
            />

            <span
              className="
                text-[11px] font-medium
                text-[#66728F]
              "
            >
              Nuevo
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}