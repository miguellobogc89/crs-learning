// components/academy/course-detail/academy-course-curriculum.tsx

"use client";

import { useState } from "react";

import {
  BookOpen,
  Check,
  ChevronDown,
  CirclePlay,
  FileQuestion,
} from "lucide-react";

import type { AcademyCourseDetail } from "@/lib/services/academy.service";

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

export function AcademyCourseCurriculum({
  detail,
}: {
  detail: AcademyCourseDetail;
}) {
  const { sections } = detail.course;

  const totalLessons = sections.reduce(
    (total, section) =>
      total + section.lessons.length,
    0,
  );

  return (
    <section
      className="
        flex min-h-0 min-w-0 flex-col
      "
    >
      <div
        className="
          flex min-w-0 shrink-0 flex-wrap
          items-center
          gap-2.5

          @min-[640px]/course-content:gap-3
          @min-[800px]/course-content:gap-3.5
          @min-[960px]/course-content:gap-4
          @min-[1100px]/course-content:gap-4.5
        "
      >
        <div
          className="
            flex h-8 w-8 shrink-0
            items-center justify-center
            rounded-lg
            bg-[#EDF3FF]
            text-[#315BFF]

            @min-[640px]/course-content:h-9 @min-[640px]/course-content:w-9
            @min-[800px]/course-content:h-10 @min-[800px]/course-content:w-10
            @min-[960px]/course-content:h-11 @min-[960px]/course-content:w-11
            @min-[1100px]/course-content:h-12 @min-[1100px]/course-content:w-12
          "
        >
          <BookOpen
            className="
              h-4 w-4

              @min-[640px]/course-content:h-[17px] @min-[640px]/course-content:w-[17px]
              @min-[800px]/course-content:h-[18px] @min-[800px]/course-content:w-[18px]
              @min-[960px]/course-content:h-5 @min-[960px]/course-content:w-5
              @min-[1100px]/course-content:h-[22px] @min-[1100px]/course-content:w-[22px]
            "
          />
        </div>

        <h2
          className="
            min-w-0 flex-1
            text-[14px]
            font-bold
            tracking-[-0.015em]
            text-[#07113D]

            @min-[640px]/course-content:text-[15px]
            @min-[800px]/course-content:text-[17px]
            @min-[960px]/course-content:text-[19px]
            @min-[1100px]/course-content:text-[21px]
          "
        >
          Temario del curso
        </h2>

        <span
          className="
            shrink-0 whitespace-nowrap
            text-[9px]
            font-medium
            text-[#53617F]

            @min-[640px]/course-content:text-[10px]
            @min-[800px]/course-content:text-[11px]
            @min-[960px]/course-content:text-[12px]
            @min-[1100px]/course-content:text-[13px]
          "
        >
          {sections.length} temas ·{" "}
          {totalLessons} lecciones ·{" "}
          {formatDuration(
            detail.estimatedMinutes,
          )}
        </span>
      </div>

      <div
        className="
          mt-3 min-h-0 flex-1
          min-w-0

          @min-[640px]/course-content:mt-3.5
          @min-[800px]/course-content:mt-4
          @min-[960px]/course-content:mt-5
          @min-[1100px]/course-content:mt-6
        "
      >
        {sections.length > 0 ? (
          <RealCurriculum
            detail={detail}
          />
        ) : (
          <MockCurriculum />
        )}
      </div>
    </section>
  );
}

function RealCurriculum({
  detail,
}: {
  detail: AcademyCourseDetail;
}) {
  return (
    <div className="relative min-w-0">
      <div className="absolute bottom-0 left-[11px] top-0 w-px bg-slate-200 @min-[640px]/course-content:left-[12px] @min-[800px]/course-content:left-[13px] @min-[960px]/course-content:left-[15px] @min-[1100px]/course-content:left-[17px]" />

      <div
        className="
          space-y-3
          @min-[640px]/course-content:space-y-3.5
          @min-[800px]/course-content:space-y-4
          @min-[960px]/course-content:space-y-5
          @min-[1100px]/course-content:space-y-6
        "
      >
        {detail.course.sections.map(
          (section, index) => (
            <CurriculumSection
              key={section.id}
              index={index}
              title={section.title}
              lessons={section.lessons}
              quizzes={section.quizzes}
              defaultOpen={index === 0}
            />
          ),
        )}
      </div>
    </div>
  );
}

type CourseSection =
  AcademyCourseDetail["course"]["sections"][number];

function CurriculumSection({
  index,
  title,
  lessons,
  quizzes,
  defaultOpen,
}: {
  index: number;
  title: string;
  lessons: CourseSection["lessons"];
  quizzes: CourseSection["quizzes"];
  defaultOpen: boolean;
}) {
  const [open, setOpen] =
    useState(defaultOpen);

  const minutes = lessons.reduce(
    (total, lesson) =>
      total + lesson.estimated_minutes,
    0,
  );

  return (
    <div className="relative min-w-0">
      <div
        className="
          absolute left-[6px] top-[11px]
          z-10
          h-[11px] w-[11px]
          rounded-full
          border-2 border-white
          bg-slate-300

          @min-[640px]/course-content:left-[7px]
          @min-[640px]/course-content:top-[12px]

          @min-[800px]/course-content:left-[8px]
          @min-[800px]/course-content:top-[13px]

          @min-[960px]/course-content:left-[9px]
          @min-[960px]/course-content:top-[15px]
          @min-[960px]/course-content:h-[13px]
          @min-[960px]/course-content:w-[13px]

          @min-[1100px]/course-content:left-[11px]
          @min-[1100px]/course-content:top-[17px]
        "
      />

      <button
        type="button"
        onClick={() =>
          setOpen((current) => !current)
        }
        className="
          flex w-full min-w-0
          items-center
          gap-2.5
          pl-7
          text-left

          @min-[640px]/course-content:gap-3
          @min-[640px]/course-content:pl-8

          @min-[800px]/course-content:gap-3.5
          @min-[800px]/course-content:pl-9

          @min-[960px]/course-content:gap-4
          @min-[960px]/course-content:pl-10

          @min-[1100px]/course-content:gap-4.5
          @min-[1100px]/course-content:pl-12
        "
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p
            className="
              break-words [overflow-wrap:anywhere]
              text-[11px]
              font-semibold
              leading-[17px]
              text-[#07113D]

              @min-[640px]/course-content:text-[12px]
              @min-[640px]/course-content:leading-[18px]

              @min-[800px]/course-content:text-[13px]
              @min-[800px]/course-content:leading-[20px]

              @min-[960px]/course-content:text-[14px]
              @min-[960px]/course-content:leading-[21px]

              @min-[1100px]/course-content:text-[15px]
              @min-[1100px]/course-content:leading-[23px]
            "
          >
            {index + 1}. {title}
          </p>
        </div>

        <span
          className="
            shrink-0 whitespace-nowrap
            text-[9px]
            text-[#53617F]

            @min-[640px]/course-content:text-[10px]
            @min-[800px]/course-content:text-[11px]
            @min-[960px]/course-content:text-[12px]
            @min-[1100px]/course-content:text-[13px]
          "
        >
          {lessons.length} lecciones
          {minutes > 0
            ? ` · ${formatDuration(minutes)}`
            : ""}
        </span>

        <ChevronDown
          className={`
            h-3.5 w-3.5
            shrink-0
            text-[#53617F]
            transition-transform
            duration-300
            ease-out

            @min-[640px]/course-content:h-4 @min-[640px]/course-content:w-4
            @min-[960px]/course-content:h-[18px] @min-[960px]/course-content:w-[18px]

            ${
              open
                ? "rotate-180"
                : "rotate-0"
            }
          `}
        />
      </button>

      <div
        className={`
          grid
          transition-[grid-template-rows,opacity]
          duration-300
          ease-out

          ${
            open
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          }
        `}
      >
        <div className="overflow-hidden">
          <div
            className="
              space-y-1
              pb-1
              pl-7
              pt-2

              @min-[640px]/course-content:pl-8
              @min-[640px]/course-content:pt-2.5

              @min-[800px]/course-content:pl-9
              @min-[800px]/course-content:pt-3

              @min-[960px]/course-content:pl-10
              @min-[960px]/course-content:pt-3.5

              @min-[1100px]/course-content:pl-12
              @min-[1100px]/course-content:pt-4
            "
          >
            {lessons.map(
              (lesson, lessonIndex) => {
                const completed =
                  Boolean(
                    lesson
                      .user_lesson_progress?.[0]
                      ?.completed_at,
                  );

                return (
                  <div
                    key={lesson.id}
                    className="
                      flex min-w-0
                      items-center
                      gap-2.5
                      rounded-md
                      px-2
                      py-1.5

                      hover:bg-[#F6F8FC]

                      @min-[640px]/course-content:gap-3
                      @min-[800px]/course-content:px-2.5
                      @min-[800px]/course-content:py-2
                      @min-[960px]/course-content:px-3
                      @min-[1100px]/course-content:py-2.5
                    "
                  >
                    <div
                      className={`
                        flex h-5 w-5
                        shrink-0
                        items-center
                        justify-center
                        rounded-full

                        @min-[640px]/course-content:h-[22px] @min-[640px]/course-content:w-[22px]
                        @min-[800px]/course-content:h-6 @min-[800px]/course-content:w-6
                        @min-[960px]/course-content:h-7 @min-[960px]/course-content:w-7
                        @min-[1100px]/course-content:h-8 @min-[1100px]/course-content:w-8

                        ${
                          completed
                            ? "bg-[#E8FAF2] text-[#16A777]"
                            : lessonIndex ===
                                0
                              ? "bg-[#EDF3FF] text-[#315BFF]"
                              : "bg-slate-100 text-[#66728F]"
                        }
                      `}
                    >
                      {completed ? (
                        <Check
                          className="
                            h-3 w-3
                            @min-[640px]/course-content:h-3.5 @min-[640px]/course-content:w-3.5
                            @min-[960px]/course-content:h-4 @min-[960px]/course-content:w-4
                          "
                        />
                      ) : (
                        <CirclePlay
                          className="
                            h-3 w-3
                            @min-[640px]/course-content:h-3.5 @min-[640px]/course-content:w-3.5
                            @min-[960px]/course-content:h-4 @min-[960px]/course-content:w-4
                          "
                        />
                      )}
                    </div>

                    <span
                      className="
                        min-w-0 flex-1
                        break-words [overflow-wrap:anywhere]
                        text-[11px]
                        leading-[17px]
                        text-[#53617F]

                        @min-[640px]/course-content:text-[12px]
                        @min-[640px]/course-content:leading-[18px]

                        @min-[800px]/course-content:text-[13px]
                        @min-[800px]/course-content:leading-[20px]

                        @min-[960px]/course-content:text-[14px]
                        @min-[960px]/course-content:leading-[21px]

                        @min-[1100px]/course-content:text-[15px]
                        @min-[1100px]/course-content:leading-[23px]
                      "
                    >
                      {lesson.title}
                    </span>

                    <span
                      className="
                        shrink-0
                        text-[9px]
                        text-[#7A849C]

                        @min-[640px]/course-content:text-[10px]
                        @min-[800px]/course-content:text-[11px]
                        @min-[960px]/course-content:text-[12px]
                        @min-[1100px]/course-content:text-[13px]
                      "
                    >
                      {
                        lesson.estimated_minutes
                      }{" "}
                      min
                    </span>
                  </div>
                );
              },
            )}

            {quizzes.map((quiz) => (
              <div
                key={quiz.id}
                className="
                  flex min-w-0
                  items-center
                  gap-2.5
                  rounded-md
                  px-2
                  py-1.5

                  hover:bg-[#F6F8FC]

                  @min-[640px]/course-content:gap-3
                  @min-[800px]/course-content:px-2.5
                  @min-[800px]/course-content:py-2
                  @min-[960px]/course-content:px-3
                  @min-[1100px]/course-content:py-2.5
                "
              >
                <div
                  className="
                    flex h-5 w-5
                    shrink-0
                    items-center
                    justify-center
                    rounded-md
                    bg-[#F1EEFF]
                    text-[#7655E8]

                    @min-[640px]/course-content:h-[22px] @min-[640px]/course-content:w-[22px]
                    @min-[800px]/course-content:h-6 @min-[800px]/course-content:w-6
                    @min-[960px]/course-content:h-7 @min-[960px]/course-content:w-7
                    @min-[1100px]/course-content:h-8 @min-[1100px]/course-content:w-8
                  "
                >
                  <FileQuestion
                    className="
                      h-3 w-3
                      @min-[640px]/course-content:h-3.5 @min-[640px]/course-content:w-3.5
                      @min-[960px]/course-content:h-4 @min-[960px]/course-content:w-4
                    "
                  />
                </div>

                <span
                  className="
                    min-w-0 flex-1
                    break-words [overflow-wrap:anywhere]
                    text-[11px]
                    leading-[17px]
                    text-[#53617F]

                    @min-[640px]/course-content:text-[12px]
                    @min-[640px]/course-content:leading-[18px]

                    @min-[800px]/course-content:text-[13px]
                    @min-[800px]/course-content:leading-[20px]

                    @min-[960px]/course-content:text-[14px]
                    @min-[960px]/course-content:leading-[21px]

                    @min-[1100px]/course-content:text-[15px]
                    @min-[1100px]/course-content:leading-[23px]
                  "
                >
                  {quiz.title}
                </span>

                <span
                  className="
                    shrink-0
                    rounded-md
                    bg-[#F1EEFF]
                    px-2 py-0.5
                    text-[9px]
                    font-semibold
                    text-[#7655E8]

                    @min-[640px]/course-content:text-[10px]
                    @min-[800px]/course-content:text-[11px]
                    @min-[960px]/course-content:text-[12px]
                  "
                >
                  Test
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MockCurriculum() {
  const sections = [
    {
      title:
        "Introducción al curso",
      duration: "35 min",
      lessons: [
        {
          title:
            "¿Qué aprenderás y para qué sirve?",
          duration: "10 min",
        },
        {
          title:
            "Conceptos fundamentales",
          duration: "12 min",
        },
        {
          title:
            "Herramientas y primeros pasos",
          duration: "13 min",
        },
      ],
    },
    {
      title:
        "Conceptos y metodología",
      duration: "45 min",
      lessons: [
        {
          title:
            "Principios de trabajo",
          duration: "15 min",
        },
        {
          title:
            "Metodología aplicada",
          duration: "15 min",
        },
        {
          title:
            "Caso práctico",
          duration: "15 min",
        },
      ],
    },
    {
      title:
        "Aplicación práctica",
      duration: "45 min",
      lessons: [
        {
          title:
            "Preparación del ejercicio",
          duration: "15 min",
        },
        {
          title:
            "Desarrollo práctico",
          duration: "15 min",
        },
        {
          title:
            "Revisión de resultados",
          duration: "15 min",
        },
      ],
    },
    {
      title:
        "Buenas prácticas",
      duration: "40 min",
      lessons: [
        {
          title:
            "Buenas prácticas principales",
          duration: "15 min",
        },
        {
          title:
            "Errores habituales",
          duration: "10 min",
        },
        {
          title:
            "Recomendaciones",
          duration: "15 min",
        },
      ],
    },
    {
      title:
        "Trabajo colaborativo",
      duration: "40 min",
      lessons: [
        {
          title:
            "Trabajo en equipo",
          duration: "15 min",
        },
        {
          title:
            "Comunicación efectiva",
          duration: "10 min",
        },
        {
          title:
            "Caso colaborativo",
          duration: "15 min",
        },
      ],
    },
    {
      title:
        "Proyecto final",
      duration: "50 min",
      lessons: [
        {
          title:
            "Planteamiento del proyecto",
          duration: "15 min",
        },
        {
          title:
            "Desarrollo",
          duration: "20 min",
        },
        {
          title:
            "Entrega y conclusiones",
          duration: "15 min",
        },
      ],
    },
  ];

  return (
    <div className="relative min-w-0">
      <div className="absolute bottom-0 left-[11px] top-0 w-px bg-slate-200 @min-[640px]/course-content:left-[12px] @min-[800px]/course-content:left-[13px] @min-[960px]/course-content:left-[15px] @min-[1100px]/course-content:left-[17px]" />

      <div
        className="
          space-y-3
          @min-[640px]/course-content:space-y-3.5
          @min-[800px]/course-content:space-y-4
          @min-[960px]/course-content:space-y-5
          @min-[1100px]/course-content:space-y-6
        "
      >
        {sections.map(
          (section, index) => (
            <MockCurriculumSection
              key={section.title}
              index={index}
              title={section.title}
              duration={section.duration}
              lessons={section.lessons}
              defaultOpen={index === 0}
            />
          ),
        )}
      </div>
    </div>
  );
}

function MockCurriculumSection({
  index,
  title,
  duration,
  lessons,
  defaultOpen,
}: {
  index: number;
  title: string;
  duration: string;
  lessons: Array<{
    title: string;
    duration: string;
  }>;
  defaultOpen: boolean;
}) {
  const [open, setOpen] =
    useState(defaultOpen);

  return (
    <div className="relative min-w-0">
      <div
        className="
          absolute left-[6px] top-[11px]
          z-10
          h-[11px] w-[11px]
          rounded-full
          border-2 border-white
          bg-slate-300

          @min-[640px]/course-content:left-[7px]
          @min-[640px]/course-content:top-[12px]

          @min-[800px]/course-content:left-[8px]
          @min-[800px]/course-content:top-[13px]

          @min-[960px]/course-content:left-[9px]
          @min-[960px]/course-content:top-[15px]
          @min-[960px]/course-content:h-[13px]
          @min-[960px]/course-content:w-[13px]

          @min-[1100px]/course-content:left-[11px]
          @min-[1100px]/course-content:top-[17px]
        "
      />

      <button
        type="button"
        onClick={() =>
          setOpen((current) => !current)
        }
        className="
          flex w-full min-w-0
          items-center
          gap-2.5
          pl-7
          text-left

          @min-[640px]/course-content:gap-3
          @min-[640px]/course-content:pl-8

          @min-[800px]/course-content:gap-3.5
          @min-[800px]/course-content:pl-9

          @min-[960px]/course-content:gap-4
          @min-[960px]/course-content:pl-10

          @min-[1100px]/course-content:gap-4.5
          @min-[1100px]/course-content:pl-12
        "
        aria-expanded={open}
      >
        <span
          className="
            min-w-0 flex-1
            break-words [overflow-wrap:anywhere]
            text-[11px]
            font-semibold
            leading-[17px]
            text-[#07113D]

            @min-[640px]/course-content:text-[12px]
            @min-[640px]/course-content:leading-[18px]

            @min-[800px]/course-content:text-[13px]
            @min-[800px]/course-content:leading-[20px]

            @min-[960px]/course-content:text-[14px]
            @min-[960px]/course-content:leading-[21px]

            @min-[1100px]/course-content:text-[15px]
            @min-[1100px]/course-content:leading-[23px]
          "
        >
          {index + 1}. {title}
        </span>

        <span
          className="
            shrink-0 whitespace-nowrap
            text-[9px]
            text-[#53617F]

            @min-[640px]/course-content:text-[10px]
            @min-[800px]/course-content:text-[11px]
            @min-[960px]/course-content:text-[12px]
            @min-[1100px]/course-content:text-[13px]
          "
        >
          {lessons.length} lecciones ·{" "}
          {duration}
        </span>

        <ChevronDown
          className={`
            h-3.5 w-3.5
            shrink-0
            text-[#53617F]
            transition-transform
            duration-300
            ease-out

            @min-[640px]/course-content:h-4 @min-[640px]/course-content:w-4
            @min-[960px]/course-content:h-[18px] @min-[960px]/course-content:w-[18px]

            ${
              open
                ? "rotate-180"
                : "rotate-0"
            }
          `}
        />
      </button>

      <div
        className={`
          grid
          transition-[grid-template-rows,opacity]
          duration-300
          ease-out

          ${
            open
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          }
        `}
      >
        <div className="overflow-hidden">
          <div
            className="
              space-y-1
              pb-1
              pl-7
              pt-2

              @min-[640px]/course-content:pl-8
              @min-[640px]/course-content:pt-2.5

              @min-[800px]/course-content:pl-9
              @min-[800px]/course-content:pt-3

              @min-[960px]/course-content:pl-10
              @min-[960px]/course-content:pt-3.5

              @min-[1100px]/course-content:pl-12
              @min-[1100px]/course-content:pt-4
            "
          >
            {lessons.map(
              (lesson, lessonIndex) => (
                <div
                  key={lesson.title}
                  className="
                    flex min-w-0
                    items-center
                    gap-2.5
                    rounded-md
                    px-2
                    py-1.5

                    hover:bg-[#F6F8FC]

                    @min-[640px]/course-content:gap-3
                    @min-[800px]/course-content:px-2.5
                    @min-[800px]/course-content:py-2
                    @min-[960px]/course-content:px-3
                    @min-[1100px]/course-content:py-2.5
                  "
                >
                  <div
                    className={`
                      flex h-5 w-5
                      shrink-0
                      items-center
                      justify-center
                      rounded-full

                      @min-[640px]/course-content:h-[22px] @min-[640px]/course-content:w-[22px]
                      @min-[800px]/course-content:h-6 @min-[800px]/course-content:w-6
                      @min-[960px]/course-content:h-7 @min-[960px]/course-content:w-7
                      @min-[1100px]/course-content:h-8 @min-[1100px]/course-content:w-8

                      ${
                        index === 0 &&
                        lessonIndex === 0
                          ? "bg-[#EDF3FF] text-[#315BFF]"
                          : "bg-slate-100 text-[#66728F]"
                      }
                    `}
                  >
                    <CirclePlay
                      className="
                        h-3 w-3
                        @min-[640px]/course-content:h-3.5 @min-[640px]/course-content:w-3.5
                        @min-[960px]/course-content:h-4 @min-[960px]/course-content:w-4
                      "
                    />
                  </div>

                  <span
                    className="
                      min-w-0 flex-1
                      break-words [overflow-wrap:anywhere]
                      text-[11px]
                      leading-[17px]
                      text-[#53617F]

                      @min-[640px]/course-content:text-[12px]
                      @min-[640px]/course-content:leading-[18px]

                      @min-[800px]/course-content:text-[13px]
                      @min-[800px]/course-content:leading-[20px]

                      @min-[960px]/course-content:text-[14px]
                      @min-[960px]/course-content:leading-[21px]

                      @min-[1100px]/course-content:text-[15px]
                      @min-[1100px]/course-content:leading-[23px]
                    "
                  >
                    {lesson.title}
                  </span>

                  <span
                    className="
                      shrink-0
                      text-[9px]
                      text-[#7A849C]

                      @min-[640px]/course-content:text-[10px]
                      @min-[800px]/course-content:text-[11px]
                      @min-[960px]/course-content:text-[12px]
                      @min-[1100px]/course-content:text-[13px]
                    "
                  >
                    {lesson.duration}
                  </span>
                </div>
              ),
            )}

            <div
              className="
                flex min-w-0
                items-center
                gap-2.5
                rounded-md
                px-2
                py-1.5

                hover:bg-[#F6F8FC]

                @min-[640px]/course-content:gap-3
                @min-[800px]/course-content:px-2.5
                @min-[800px]/course-content:py-2
                @min-[960px]/course-content:px-3
                @min-[1100px]/course-content:py-2.5
              "
            >
              <div
                className="
                  flex h-5 w-5
                  shrink-0
                  items-center
                  justify-center
                  rounded-md
                  bg-[#F1EEFF]
                  text-[#7655E8]

                  @min-[640px]/course-content:h-[22px] @min-[640px]/course-content:w-[22px]
                  @min-[800px]/course-content:h-6 @min-[800px]/course-content:w-6
                  @min-[960px]/course-content:h-7 @min-[960px]/course-content:w-7
                  @min-[1100px]/course-content:h-8 @min-[1100px]/course-content:w-8
                "
              >
                <FileQuestion
                  className="
                    h-3 w-3
                    @min-[640px]/course-content:h-3.5 @min-[640px]/course-content:w-3.5
                    @min-[960px]/course-content:h-4 @min-[960px]/course-content:w-4
                  "
                />
              </div>

              <span
                className="
                  min-w-0 flex-1
                  break-words [overflow-wrap:anywhere]
                  text-[11px]
                  leading-[17px]
                  text-[#53617F]

                  @min-[640px]/course-content:text-[12px]
                  @min-[640px]/course-content:leading-[18px]

                  @min-[800px]/course-content:text-[13px]
                  @min-[800px]/course-content:leading-[20px]

                  @min-[960px]/course-content:text-[14px]
                  @min-[960px]/course-content:leading-[21px]

                  @min-[1100px]/course-content:text-[15px]
                  @min-[1100px]/course-content:leading-[23px]
                "
              >
                Test del tema {index + 1}
              </span>

              <span
                className="
                  shrink-0
                  rounded-md
                  bg-[#F1EEFF]
                  px-2 py-0.5
                  text-[9px]
                  font-semibold
                  text-[#7655E8]

                  @min-[640px]/course-content:text-[10px]
                  @min-[800px]/course-content:text-[11px]
                  @min-[960px]/course-content:text-[12px]
                "
              >
                Test
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}