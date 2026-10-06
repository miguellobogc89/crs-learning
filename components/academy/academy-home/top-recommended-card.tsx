// components/academy/academy-home/top-recommended-card.tsx

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Clock3,
  MoreVertical,
  Sparkles,
} from "lucide-react";

import { AcademyThumbnail } from "@/components/academy/academy-learning-sections";
import type { AcademyHomeCourse } from "@/lib/services/academy.service";

type TopRecommendedCardProps = {
  course: AcademyHomeCourse | null;
};

export function TopRecommendedCard({
  course,
}: TopRecommendedCardProps) {
  return (
    <section
      className="
        flex h-full min-h-0 min-w-0 flex-col
        overflow-hidden
        rounded-lg
        bg-white
        px-4 pb-3 pt-3
      "
    >
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Sparkles
            aria-hidden="true"
            strokeWidth={2}
            className="h-[19px] w-[19px] text-[#4567F2]"
          />

          <h2 className="text-sm font-semibold text-slate-950">
            Más recomendado
          </h2>
        </div>

        <ChevronDown
          aria-hidden="true"
          strokeWidth={2.2}
          className="h-4 w-4 text-[#66728F]"
        />
      </div>

      {course ? (
        <div
          className="
            mt-3 flex min-h-0 flex-1 flex-col
            rounded-lg
            border border-slate-200
            bg-white
            p-2
          "
        >
          <div className="flex min-h-0 flex-1 gap-3">
            <AcademyThumbnail
              variant={course.thumbnail}
              url={course.thumbnailUrl}
              className="
                h-[92px] w-[138px]
                shrink-0
                rounded-md
              "
            />

            <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                <h3
                    className="
                    truncate
                    text-[14px] font-bold
                    leading-5
                    text-[#07113D]
                    "
                >
                    {course.title}
                </h3>

                <span
                    className="
                    mt-1 inline-flex
                    max-w-full items-center
                    truncate rounded-full
                    bg-[#EEF2FF]
                    px-2 py-0.5
                    text-[10px] font-medium
                    text-[#4567F2]
                    "
                >
                    {course.category}
                </span>
                </div>

                <MoreVertical
                aria-hidden="true"
                strokeWidth={2.2}
                className="
                    mt-0.5 h-[17px] w-[17px]
                    shrink-0 text-[#66728F]
                "
                />
            </div>

            <p
                className="
                mt-1
                line-clamp-2
                text-[12px] font-normal
                leading-[18px]
                text-[#66728F]
                "
            >
                {course.description ||
                "Continúa ampliando tus conocimientos con este curso."}
            </p>
            </div>
          </div>

          <div
            className="
              mt-2 flex shrink-0
              items-center justify-between
              gap-3
            "
          >
            <div className="flex min-w-0 items-center gap-5">
              <div className="flex items-center gap-2">
                <Clock3
                  aria-hidden="true"
                  strokeWidth={1.8}
                  className="h-[17px] w-[17px] text-[#7886A8]"
                />

                <span className="whitespace-nowrap text-[11px] font-normal text-[#66728F]">
                  {course.duration}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <BarChart3
                  aria-hidden="true"
                  strokeWidth={1.8}
                  className="h-[17px] w-[17px] text-[#7886A8]"
                />

                <span className="whitespace-nowrap text-[11px] font-normal text-[#66728F]">
                  Nivel {course.level.toLowerCase()}
                </span>
              </div>
            </div>

            <Link
              href={`/courses/${course.id}`}
              className="
                flex h-10 w-[142px]
                shrink-0 items-center
                justify-center gap-2
                rounded-lg
                bg-[#EEF2FF]
                text-[12px] font-semibold
                text-[#315BFF]
                transition-colors
                hover:bg-[#E4EAFF]
              "
            >
              Ver curso

              <ArrowRight
                aria-hidden="true"
                strokeWidth={2}
                className="h-4 w-4"
              />
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-xs font-medium text-[#66728F]">
            No hay cursos recomendados disponibles.
          </p>
        </div>
      )}
    </section>
  );
}