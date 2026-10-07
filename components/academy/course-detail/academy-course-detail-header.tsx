// components/academy/course-detail/academy-course-detail-header.tsx

import Link from "next/link";
import type { ReactNode } from "react";

import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  GraduationCap,
  Star,
  UserRound,
} from "lucide-react";

import { AcademyThumbnail } from "@/components/academy/academy-learning-sections";

import type { AcademyCourseDetail } from "@/lib/services/academy.service";

type AcademyCourseDetailHeaderProps = {
  detail: AcademyCourseDetail;
};

function formatDate(
  value: Date | string | null | undefined,
) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  if (!minutes) {
    return "Sin estimación";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest
    ? `${hours} h ${rest} min`
    : `${hours} h`;
}

function HeaderChip({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="
        flex h-7 items-center gap-1.5
        rounded-lg border border-slate-200 bg-white
        px-2.5
        text-[9px] font-medium text-[#53617F]
        shadow-[0_1px_2px_rgba(15,23,42,0.02)]

        lg:h-8 lg:gap-2 lg:px-3 lg:text-[10px]

        xl:h-9 xl:px-3.5 xl:text-[12px]

        2xl:h-10 2xl:px-4 2xl:text-[13px]

        3xl:h-11 3xl:px-5 3xl:text-[14px]
      "
    >
      <span
        className="
          shrink-0
          [&>svg]:h-3.5 [&>svg]:w-3.5
          [&>svg]:text-[#315BFF]

          lg:[&>svg]:h-4 lg:[&>svg]:w-4

          xl:[&>svg]:h-[17px] xl:[&>svg]:w-[17px]

          2xl:[&>svg]:h-[18px] 2xl:[&>svg]:w-[18px]

          3xl:[&>svg]:h-5 3xl:[&>svg]:w-5
        "
      >
        {icon}
      </span>

      {children}
    </div>
  );
}

export function AcademyCourseDetailHeader({
  detail,
}: AcademyCourseDetailHeaderProps) {
  const { course } = detail;

  const lessonCount =
    course.sections.reduce(
      (total, section) =>
        total + section.lessons.length,
      0,
    );

  const progress =
    course.user_course_progress?.[0]
      ?.progress_percent ?? 0;

  const creator =
    course.users?.name ??
    "Carlos Méndez";

  return (
    <header
      className="
        min-w-0
        border-b border-slate-200
        py-3

        lg:py-3.5

        xl:py-5

        2xl:py-6

        3xl:py-7
      "
    >
      <div
        className="
          grid min-w-0
          grid-cols-[190px_minmax(0,1fr)]
          items-stretch
          gap-4

          lg:grid-cols-[205px_minmax(0,1fr)]
          lg:gap-5

          xl:grid-cols-[270px_minmax(0,1fr)]
          xl:gap-6

          2xl:grid-cols-[310px_minmax(0,1fr)]
          2xl:gap-7

          3xl:grid-cols-[350px_minmax(0,1fr)]
          3xl:gap-8
        "
      >
        <AcademyThumbnail
          variant="knowledge"
          url={
            course.thumbnail_url
              ? `/api/academy/course-cover/${course.id}`
              : null
          }
          className="
            h-[158px] w-full rounded-lg

            lg:h-[170px]

            xl:h-[210px] xl:rounded-xl

            2xl:h-[235px]

            3xl:h-[260px]
          "
        />

        <div className="flex min-w-0 flex-col">
          <div
            className="
              flex min-w-0 items-start
              gap-3

              lg:gap-4

              xl:gap-5

              2xl:gap-6

              3xl:gap-7
            "
          >
            <div className="min-w-0 flex-1">
              <span
                className="
                  inline-flex
                  rounded-md
                  bg-[#EDF3FF]
                  px-2 py-1
                  text-[9px] font-semibold
                  text-[#315BFF]

                  lg:px-2.5 lg:text-[10px]

                  xl:px-3 xl:py-1.5 xl:text-[11px]

                  2xl:text-[12px]

                  3xl:px-3.5 3xl:text-[13px]
                "
              >
                {course.category ||
                  "Academy"}
              </span>

              <h1
                className="
                  mt-2
                  line-clamp-2
                  text-[22px]
                  font-bold
                  leading-[1.08]
                  tracking-[-0.03em]
                  text-[#07113D]

                  lg:text-[24px]

                  xl:mt-2.5
                  xl:text-[30px]

                  2xl:mt-3
                  2xl:text-[34px]

                  3xl:text-[38px]
                "
              >
                {course.title}
              </h1>
            </div>

            <Link
              href={`/courses/${course.id}`}
              className="
                flex h-9
                shrink-0
                items-center
                justify-center
                gap-2
                rounded-lg
                bg-gradient-to-r
                from-[#315BFF]
                to-[#5865F2]
                px-4
                text-[11px]
                font-semibold
                text-white
                shadow-[0_3px_8px_rgba(49,91,255,0.16)]
                transition
                hover:brightness-105

                lg:h-10
                lg:px-5
                lg:text-[12px]

                xl:h-11
                xl:px-6
                xl:text-[13px]

                2xl:h-12
                2xl:px-7
                2xl:text-[14px]

                3xl:h-[52px]
                3xl:px-8
                3xl:text-[15px]
              "
            >
              {progress > 0
                ? "Continuar curso"
                : "Iniciar curso"}

              <ArrowRight
                className="
                  h-4 w-4

                  xl:h-[18px] xl:w-[18px]

                  3xl:h-5 3xl:w-5
                "
              />
            </Link>
          </div>

          <p
            className="
              mt-2
              line-clamp-2
              max-w-[760px]
              text-[12px]
              leading-[17px]
              text-[#66728F]

              lg:text-[13px]
              lg:leading-[18px]

              xl:mt-3
              xl:max-w-[900px]
              xl:text-[14px]
              xl:leading-[20px]

              2xl:max-w-[1000px]
              2xl:text-[15px]
              2xl:leading-[22px]

              3xl:max-w-[1100px]
              3xl:text-[16px]
              3xl:leading-[24px]
            "
          >
            {course.description ||
              "Aprende los fundamentos, herramientas y buenas prácticas necesarias para aplicar estos conocimientos en tu trabajo."}
          </p>

          <div
            className="
              mt-2.5
              flex min-w-0
              flex-wrap
              gap-1.5

              lg:mt-3
              lg:gap-2

              xl:mt-4
              xl:gap-2.5

              2xl:mt-5
              2xl:gap-3

              3xl:mt-6
              3xl:gap-3.5
            "
          >
            <HeaderChip
              icon={
                <Star className="fill-[#FFB020] text-[#FFB020]" />
              }
            >
              <strong className="text-[#07113D]">
                4,7
              </strong>

              <span>
                (238 valoraciones)
              </span>
            </HeaderChip>

            <HeaderChip
              icon={<GraduationCap />}
            >
              {course.level ||
                "Básico"}
            </HeaderChip>

            <HeaderChip
              icon={<Clock3 />}
            >
              {formatDuration(
                detail.estimatedMinutes,
              )}
            </HeaderChip>

            <HeaderChip
              icon={<BookOpen />}
            >
              {lessonCount} lecciones
            </HeaderChip>
          </div>

          <div
            className="
              mt-auto
              flex min-w-0
              flex-wrap
              items-center
              gap-x-5 gap-y-2
              pt-2.5

              lg:gap-x-6
              lg:pt-3

              xl:gap-x-7
              xl:pt-4

              2xl:gap-x-8
              2xl:pt-5

              3xl:gap-x-10
              3xl:pt-6
            "
          >
            <div
              className="
                flex min-w-0
                items-center
                gap-2.5

                xl:gap-3

                3xl:gap-3.5
              "
            >
              <div
                className="
                  flex h-8 w-8
                  shrink-0
                  items-center
                  justify-center
                  overflow-hidden
                  rounded-full
                  bg-[#EAF0FF]
                  ring-1 ring-slate-200

                  lg:h-9 lg:w-9

                  xl:h-10 xl:w-10

                  2xl:h-11 2xl:w-11

                  3xl:h-12 3xl:w-12
                "
              >
                <UserRound
                  className="
                    h-4 w-4
                    text-[#315BFF]

                    xl:h-5 xl:w-5

                    3xl:h-6 3xl:w-6
                  "
                />
              </div>

              <div className="min-w-0">
                <p
                  className="
                    text-[9px]
                    leading-3
                    text-[#7784A3]

                    lg:text-[10px]

                    xl:text-[11px]
                    xl:leading-4

                    2xl:text-[12px]

                    3xl:text-[13px]
                  "
                >
                  Creado por
                </p>

                <div
                  className="
                    flex min-w-0
                    items-center
                    gap-1.5

                    xl:gap-2
                  "
                >
                  <span
                    className="
                      truncate
                      text-[10px]
                      font-semibold
                      text-[#07113D]

                      lg:text-[11px]

                      xl:text-[13px]

                      2xl:text-[14px]

                      3xl:text-[15px]
                    "
                  >
                    {creator}
                  </span>

                  <span
                    className="
                      hidden
                      text-[#66728F]

                      xl:inline
                      xl:text-[11px]

                      2xl:text-[12px]

                      3xl:text-[13px]
                    "
                  >
                    · Mentor del curso
                  </span>
                </div>
              </div>
            </div>

            <div
              className="
                h-7 w-px
                bg-slate-200

                lg:h-8

                xl:h-9

                2xl:h-10

                3xl:h-11
              "
            />

            <div
              className="
                flex items-center
                gap-2

                xl:gap-3
              "
            >
              <CalendarDays
                className="
                  h-3.5 w-3.5
                  text-[#53617F]

                  lg:h-4 lg:w-4

                  xl:h-[18px] xl:w-[18px]

                  3xl:h-5 3xl:w-5
                "
              />

              <div>
                <p
                  className="
                    text-[9px]
                    leading-3
                    text-[#7784A3]

                    lg:text-[10px]

                    xl:text-[11px]
                    xl:leading-4

                    2xl:text-[12px]

                    3xl:text-[13px]
                  "
                >
                  Última actualización
                </p>

                <p
                  className="
                    mt-0.5
                    text-[10px]
                    font-medium
                    text-[#435176]

                    lg:text-[11px]

                    xl:text-[13px]

                    2xl:text-[14px]

                    3xl:text-[15px]
                  "
                >
                  {formatDate(
                    course.updated_at,
                  ) || "Sin fecha"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}