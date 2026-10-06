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
  const visibleCourses = courses.slice(0, 2);

  return (
    <section
      className="
        flex h-full min-h-0 min-w-0 flex-col
        overflow-hidden
        rounded-lg
        border border-slate-200/80
        bg-white
        px-4 pb-3 pt-3
      "
    >
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-950">
          Formación pendiente
        </h2>

        <Link
          href={academyHref("learning")}
          className="
            flex items-center gap-2
            text-[12px] font-semibold
            text-[#315BFF]
            transition-opacity
            hover:opacity-75
          "
        >
          Ver todas

          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4"
          />
        </Link>
      </div>

      {visibleCourses.length > 0 ? (
        <div className="mt-3 grid min-h-0 flex-1 grid-rows-2 gap-2">
          {visibleCourses.map((course) => (
            <PendingCourseRow
              key={course.id}
              course={course}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-xs font-medium text-slate-500">
            No tienes formación pendiente.
          </p>
        </div>
      )}
    </section>
  );
}

function PendingCourseRow({
  course,
}: {
  course: AcademyHomeAssignment;
}) {
  const hasStarted = course.progress > 0;

  const isOverdue =
    course.dueAt !== null &&
    new Date(course.dueAt).getTime() <
      new Date().setHours(0, 0, 0, 0);

  return (
    <article
      className="
        grid min-h-0 min-w-0
        grid-cols-[minmax(0,1fr)_190px_112px]
        items-center
        rounded-lg
        border border-slate-200
        bg-white
        px-2 py-1.5
      "
    >
      <div className="flex min-w-0 items-center gap-3">
        <AcademyThumbnail
          variant={course.thumbnail}
          url={course.thumbnailUrl}
          className="
            h-[54px] w-[86px]
            shrink-0
            rounded-md
          "
        />

        <div className="min-w-0">
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
              required={course.isRequired}
            />
          </div>
        </div>
      </div>

      <div
        className="
          flex h-[42px] min-w-0
          items-center
          border-l border-slate-200
          pl-4
        "
      >
        <CalendarDays
          aria-hidden="true"
          strokeWidth={1.8}
          className="
            mr-3 h-[17px] w-[17px]
            shrink-0
            text-[#7784A3]
          "
        />

        <div className="min-w-0">
          <p
            className="
              truncate
              text-[11px] font-semibold
              text-[#435176]
            "
          >
            {course.deadlineLabel}
          </p>

          <p
            className={`
              mt-0.5 truncate
              text-[10px] font-medium
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

      <div className="flex justify-end">
        <Link
          href={`/courses/${course.id}`}
          className="
            flex h-9 w-[104px]
            items-center justify-center
            rounded-lg
            bg-[#EEF2FF]
            text-[11px] font-semibold
            text-[#315BFF]
            transition-colors
            hover:bg-[#E4EAFF]
          "
        >
          {hasStarted
            ? "Continuar"
            : "Comenzar"}
        </Link>
      </div>
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
        leading-[14px]
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