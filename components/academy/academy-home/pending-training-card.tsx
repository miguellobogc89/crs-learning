// components/academy/academy-home/pending-training-card.tsx

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
} from "lucide-react";

import { AcademyThumbnail } from "@/components/academy/academy-learning-sections";
import { academyHref } from "@/lib/navigation/academy-sections";
import type { AcademyHomeAssignment } from "@/lib/services/academy.service";

type PendingTrainingCardProps = {
  courses: AcademyHomeAssignment[];
};

export function PendingTrainingCard({
  courses,
}: PendingTrainingCardProps) {
  const visibleCourses =
    courses.slice(0, 2);

  return (
    <section className="min-w-0 rounded-lg bg-white">
      <div className="flex items-center justify-between px-1 pb-2 pt-1">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#07113D]">
          Formación pendiente
        </h2>

        <Link
          href={academyHref(
            "learning",
          )}
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

      {visibleCourses.length >
      0 ? (
        <div
          className="
            grid min-w-0
            grid-cols-[repeat(auto-fit,minmax(360px,1fr))]
            gap-2.5
          "
        >
          {visibleCourses.map(
            (course) => (
              <PendingCourseCard
                key={course.id}
                course={course}
              />
            ),
          )}
        </div>
      ) : (
        <div
          className="
            flex min-h-[84px]
            items-center justify-center
            rounded-lg
            border border-slate-200
            bg-white
          "
        >
          <p className="text-xs font-medium text-slate-500">
            No tienes formación
            pendiente.
          </p>
        </div>
      )}
    </section>
  );
}

function PendingCourseCard({
  course,
}: {
  course: AcademyHomeAssignment;
}) {
  const hasStarted =
    course.progress > 0;

  const isOverdue =
    course.dueAt !== null &&
    new Date(
      course.dueAt,
    ).getTime() <
      new Date().setHours(
        0,
        0,
        0,
        0,
      );

  return (
    <article
      className="
        flex min-w-0
        items-center gap-2.5
        rounded-lg
        border border-slate-200
        bg-white
        p-2
        shadow-[0_2px_7px_rgba(15,23,42,0.025)]
      "
    >
      <AcademyThumbnail
        variant={course.thumbnail}
        url={course.thumbnailUrl}
        className="
          h-[54px] w-[74px]
          shrink-0
          rounded-md
        "
      />

      <div className="min-w-0 flex-1">
        <h3
          className="
            truncate
            text-[12px] font-semibold
            tracking-[-0.01em]
            text-[#07113D]
          "
        >
          {course.title}
        </h3>

        <div className="mt-1">
          <AssignmentBadge
            required={
              course.isRequired
            }
          />
        </div>
      </div>

      <div
        className="
          flex min-w-0
          shrink items-center
          border-l border-slate-200
          pl-2.5
        "
      >
        <CalendarDays
          aria-hidden="true"
          strokeWidth={1.8}
          className="
            mr-2 h-4 w-4
            shrink-0
            text-[#7784A3]
          "
        />

        <div className="min-w-0">
          <p
            className="
              truncate
              text-[10px] font-semibold
              text-[#435176]
            "
          >
            {course.deadlineLabel}
          </p>

          <p
            className={`
              mt-0.5 truncate
              text-[9px] font-medium
              ${
                isOverdue
                  ? "text-[#F05263]"
                  : course.isRequired
                    ? "text-[#F05263]"
                    : "text-[#66728F]"
              }
            `}
          >
            {course.dueLabel}
          </p>
        </div>
      </div>

      <Link
        href={`/courses/${course.id}`}
        className="
          flex h-8
          min-w-[72px]
          shrink-0
          items-center justify-center
          rounded-lg
          bg-[#EEF2FF]
          px-2.5
          text-[10px] font-semibold
          text-[#315BFF]
          transition-colors
          hover:bg-[#E4EAFF]
        "
      >
        {hasStarted
          ? "Continuar"
          : "Comenzar"}
      </Link>
    </article>
  );
}

function AssignmentBadge({
  required,
}: {
  required: boolean;
}) {
  return (
    <span
      className={`
        inline-flex
        rounded-full
        px-2 py-0.5
        text-[9px] font-semibold
        leading-[13px]
        ${
          required
            ? "bg-[#FFE9ED] text-[#F05263]"
            : "bg-[#EAF0FF] text-[#4567F2]"
        }
      `}
    >
      {required
        ? "Obligatorio"
        : "Asignado"}
    </span>
  );
}