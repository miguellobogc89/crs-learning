// components/academy/course-detail/academy-course-detail.tsx

import type { ReactNode } from "react";

import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  Clock3,
  FileQuestion,
  Gauge,
  Info,
  Languages,
  Layers3,
  Medal,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AcademyCourseLearningSummary } from "@/components/academy/course-detail/academy-course-learning-summary";
import { Progress } from "@/components/ui/progress";

import type { AcademyCourseDetail } from "@/lib/services/academy.service";

function formatDate(
  value: Date | string | null | undefined,
) {
  if (!value) return null;

  return new Intl.DateTimeFormat(
    "es-ES",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  ).format(new Date(value));
}

function formatDuration(
  minutes: number,
) {
  if (!minutes) {
    return "Sin estimación";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(
    minutes / 60,
  );
  const rest = minutes % 60;

  return rest
    ? `${hours} h ${rest} min`
    : `${hours} h`;
}

export function AcademyCourseDetailContent({
  detail,
}: {
  detail: AcademyCourseDetail;
}) {
  return (
    <div className="min-w-0 pb-5">
      <div
        className="
          mt-4 grid min-w-0 items-start
          grid-cols-[minmax(210px,0.72fr)_minmax(0,1.48fr)]
          gap-3

          lg:grid-cols-[minmax(225px,0.72fr)_minmax(0,1.48fr)]
          lg:gap-3.5

          xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.48fr)]
          xl:gap-4

          2xl:grid-cols-[minmax(310px,0.72fr)_minmax(0,1.48fr)]
          2xl:gap-5

          3xl:grid-cols-[minmax(350px,0.72fr)_minmax(0,1.48fr)]
          3xl:gap-6
        "
      >
        <AcademyCourseLearningSummary />

        <CourseCurriculum
          detail={detail}
        />
      </div>
    </div>
  );
}

function CourseCurriculum({
  detail,
}: {
  detail: AcademyCourseDetail;
}) {
  const { sections } =
    detail.course;

  const totalLessons =
    sections.reduce(
      (total, section) =>
        total +
        section.lessons.length,
      0,
    );

  return (
    <CoursePanel
      icon={<BookOpen />}
      title="Temario del curso"
      action={
        <span className="whitespace-nowrap text-[9px] font-medium text-[#53617F] 2xl:text-[10px]">
          {sections.length} temas ·{" "}
          {totalLessons} lecciones ·{" "}
          {formatDuration(
            detail.estimatedMinutes,
          )}
        </span>
      }
      className="h-fit"
    >
      {sections.length > 0 ? (
        <div className="space-y-2">
          {sections.map(
            (section, index) => {
              const minutes =
                section.lessons.reduce(
                  (
                    total,
                    lesson,
                  ) =>
                    total +
                    lesson.estimated_minutes,
                  0,
                );

              return (
                <details
                  key={section.id}
                  open={index === 0}
                  className="
                    group overflow-hidden
                    rounded-lg
                    border border-slate-200
                    bg-white
                  "
                >
                  <summary
                    className="
                      flex min-h-[42px]
                      cursor-pointer
                      list-none
                      items-center
                      gap-2.5
                      px-3
                      2xl:min-h-[46px]
                    "
                  >
                    <ChevronDown
                      className="
                        h-3.5 w-3.5
                        shrink-0
                        -rotate-90
                        text-[#53617F]
                        transition-transform
                        group-open:rotate-0
                      "
                    />

                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-[#07113D] 2xl:text-[12px]">
                      {index + 1}.{" "}
                      {section.title}
                    </span>

                    <span className="shrink-0 text-[9px] text-[#53617F] 2xl:text-[10px]">
                      {
                        section.lessons
                          .length
                      }{" "}
                      lecciones
                      {minutes > 0
                        ? ` · ${formatDuration(minutes)}`
                        : ""}
                    </span>

                    <ChevronDown
                      className="
                        h-3.5 w-3.5
                        shrink-0
                        text-[#315BFF]
                        transition-transform
                        group-open:rotate-180
                      "
                    />
                  </summary>

                  <div className="border-t border-slate-100 px-2 pb-2 pt-1">
                    {section.lessons.map(
                      (
                        lesson,
                        lessonIndex,
                      ) => {
                        const completed =
                          Boolean(
                            lesson
                              .user_lesson_progress?.[0]
                              ?.completed_at,
                          );

                        return (
                          <div
                            key={
                              lesson.id
                            }
                            className={`
                              flex min-h-[36px]
                              min-w-0
                              items-center
                              gap-3
                              rounded-md
                              px-2.5
                              2xl:min-h-[40px]

                              ${
                                lessonIndex ===
                                0
                                  ? "bg-[#EDF3FF]"
                                  : ""
                              }
                            `}
                          >
                            <div
                              className={`
                                flex h-6 w-6
                                shrink-0
                                items-center
                                justify-center
                                rounded-full

                                ${
                                  lessonIndex ===
                                  0
                                    ? "bg-[#6D8EFF] text-white"
                                    : completed
                                      ? "bg-[#E8FAF2] text-[#16A777]"
                                      : "border border-slate-200 bg-white text-[#66728F]"
                                }
                              `}
                            >
                              {completed ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <CirclePlay className="h-3.5 w-3.5" />
                              )}
                            </div>

                            <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[#243150] 2xl:text-[11px]">
                              {
                                lesson.title
                              }
                            </span>

                            <span className="shrink-0 text-[9px] text-[#53617F] 2xl:text-[10px]">
                              {
                                lesson.estimated_minutes
                              }{" "}
                              min
                            </span>
                          </div>
                        );
                      },
                    )}

                    {section.quizzes.map(
                      (quiz) => (
                        <div
                          key={quiz.id}
                          className="
                            flex min-h-[36px]
                            items-center
                            gap-3
                            rounded-md
                            px-2.5
                            2xl:min-h-[40px]
                          "
                        >
                          <div
                            className="
                              flex h-6 w-6
                              shrink-0
                              items-center
                              justify-center
                              rounded-md
                              bg-[#F1EEFF]
                              text-[#7655E8]
                            "
                          >
                            <FileQuestion className="h-3.5 w-3.5" />
                          </div>

                          <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[#243150] 2xl:text-[11px]">
                            {quiz.title}
                          </span>

                          <span
                            className="
                              min-w-[58px]
                              rounded-md
                              bg-[#EDF3FF]
                              px-2 py-1
                              text-center
                              text-[9px]
                              font-semibold
                              text-[#315BFF]
                            "
                          >
                            Test
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </details>
              );
            },
          )}
        </div>
      ) : (
        <MockCurriculum />
      )}
    </CoursePanel>
  );
}

function MockCurriculum() {
  const sections = [
    {
      title:
        "Introducción al curso",
      lessons: [
        "¿Qué aprenderás y para qué sirve?",
        "Conceptos fundamentales",
        "Herramientas y primeros pasos",
      ],
    },
    {
      title:
        "Conceptos y metodología",
    },
    {
      title:
        "Aplicación práctica",
    },
    {
      title:
        "Buenas prácticas",
    },
    {
      title:
        "Trabajo colaborativo",
    },
    {
      title:
        "Proyecto final",
    },
  ];

  return (
    <div className="space-y-2">
      {sections.map(
        (section, index) => (
          <div
            key={section.title}
            className="
              overflow-hidden
              rounded-lg
              border border-slate-200
            "
          >
            <div className="flex min-h-[42px] items-center gap-2.5 px-3 2xl:min-h-[46px]">
              <ChevronDown
                className={`
                  h-3.5 w-3.5
                  text-[#53617F]
                  ${
                    index === 0
                      ? ""
                      : "-rotate-90"
                  }
                `}
              />

              <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-[#07113D] 2xl:text-[12px]">
                {index + 1}.{" "}
                {section.title}
              </span>

              <span className="text-[9px] text-[#53617F] 2xl:text-[10px]">
                {index === 0
                  ? "4 lecciones · 35 min"
                  : "4 lecciones · 45 min"}
              </span>
            </div>

            {index === 0 ? (
              <div className="border-t border-slate-100 px-2 py-1">
                {section.lessons?.map(
                  (
                    lesson,
                    lessonIndex,
                  ) => (
                    <div
                      key={lesson}
                      className={`
                        flex min-h-[36px]
                        items-center
                        gap-3
                        rounded-md
                        px-2.5
                        2xl:min-h-[40px]

                        ${
                          lessonIndex ===
                          0
                            ? "bg-[#EDF3FF]"
                            : ""
                        }
                      `}
                    >
                      <CirclePlay
                        className={`
                          h-5 w-5
                          ${
                            lessonIndex ===
                            0
                              ? "text-[#315BFF]"
                              : "text-[#7784A3]"
                          }
                        `}
                      />

                      <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[#243150] 2xl:text-[11px]">
                        {lesson}
                      </span>

                      <span className="text-[9px] text-[#53617F] 2xl:text-[10px]">
                        {10 +
                          lessonIndex *
                            2}{" "}
                        min
                      </span>
                    </div>
                  ),
                )}

                <div className="flex min-h-[36px] items-center gap-3 rounded-md px-2.5 2xl:min-h-[40px]">
                  <FileQuestion className="h-5 w-5 text-[#7655E8]" />

                  <span className="min-w-0 flex-1 text-[10px] font-medium text-[#243150] 2xl:text-[11px]">
                    Test del tema 1
                  </span>

                  <span className="rounded-md bg-[#EDF3FF] px-4 py-1 text-[9px] font-semibold text-[#315BFF]">
                    Test
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ),
      )}
    </div>
  );
}

function CoursePanel({
  icon,
  title,
  action,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`
        min-w-0
        rounded-lg
        border border-slate-200
        bg-white
        p-3
        shadow-[0_2px_8px_rgba(15,23,42,0.025)]
        ${className}
      `}
    >
      <div className="mb-3 flex min-w-0 items-center gap-2.5">
        <div
          className="
            flex h-8 w-8
            shrink-0
            items-center
            justify-center
            rounded-lg
            bg-[#EDF3FF]
            text-[#315BFF]
            [&>svg]:h-4
            [&>svg]:w-4
          "
        >
          {icon}
        </div>

        <h2 className="min-w-0 flex-1 text-[14px] font-bold tracking-[-0.015em] text-[#07113D] 2xl:text-[15px]">
          {title}
        </h2>

        {action}
      </div>

      {children}
    </section>
  );
}

export function AcademyCourseDetailAside({
  detail,
}: {
  detail: AcademyCourseDetail;
}) {
  const { course } = detail;

  const progress =
    course.user_course_progress?.[0]
      ?.progress_percent ?? 72;

  const assignment =
    course.course_assignments?.[0];

  return (
    <>
      <AsidePanel
        icon={<CheckCircle2 />}
        title="Tu progreso"
      >
        <div className="flex items-center gap-3">
          <Progress
            value={progress}
            className="
              h-2 flex-1
              bg-[#E4E8F1]
              [&_[data-slot=progress-indicator]]:bg-[#315BFF]
            "
          />

          <span className="text-[12px] font-bold text-[#07113D]">
            {progress} %
          </span>
        </div>

        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2 text-[10px] text-[#53617F]">
            <CheckCircle2 className="h-4 w-4 text-[#15A879]" />

            {assignment?.is_required
              ? "Formación obligatoria"
              : "Asignado por tu empresa"}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-[#53617F]">
            <CalendarDays className="h-4 w-4 text-[#F05263]" />

            Fecha límite:{" "}
            {formatDate(
              assignment?.due_at,
            ) || "30 abr 2024"}
          </div>
        </div>
      </AsidePanel>

      <AsidePanel
        icon={<FileQuestion />}
        title="Evaluación del curso"
      >
        <EvaluationRow
          icon={<FileQuestion />}
          title="Tests por tema"
          description="Un test al finalizar cada tema para reforzar lo aprendido."
          badge="Generados con IA"
        />

        <EvaluationRow
          icon={<BarChart3 />}
          title="Evaluación final"
          description="Examen final de nivel medio con preguntas personalizadas."
          badge="Sin límite de tiempo"
        />

        <EvaluationRow
          icon={<Layers3 />}
          title="Tipo de evaluación"
          description="Tipo test (opción múltiple)"
        />
      </AsidePanel>

      <section
        className="
          rounded-lg
          border border-[#E9E4FF]
          bg-gradient-to-br
          from-[#F7F4FF]
          to-[#F0F3FF]
          p-4
        "
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#7655E8]" />

          <h2 className="text-[14px] font-bold text-[#07113D]">
            Relacionado con tu trabajo
          </h2>
        </div>

        <p className="mt-2 text-[10px] leading-[16px] text-[#53617F]">
          Este curso está recomendado para tu puesto y se relaciona con contenidos que consultas habitualmente en Knowledge.
        </p>
      </section>

      <AsidePanel
        icon={<Info />}
        title="Información adicional"
      >
        <div className="space-y-2">
          <InformationRow
            icon={<Gauge />}
            label="Nivel"
            value={
              course.level ||
              "Básico"
            }
          />

          <InformationRow
            icon={<Clock3 />}
            label="Duración estimada"
            value={formatDuration(
              detail.estimatedMinutes,
            )}
          />

          <InformationRow
            icon={<Languages />}
            label="Idioma"
            value="Español"
          />

          <InformationRow
            icon={<BookOpen />}
            label="Subtítulos"
            value="No disponibles"
          />

          <InformationRow
            icon={<Medal />}
            label="Certificación"
            value="Sí, al completar"
          />

          <InformationRow
            icon={<ShieldCheck />}
            label="Acceso"
            value={
              assignment
                ? "Asignado por tu empresa"
                : "Disponible"
            }
          />
        </div>
      </AsidePanel>
    </>
  );
}

function AsidePanel({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="
        rounded-lg
        border border-slate-200
        bg-white
        p-4
        shadow-[0_2px_8px_rgba(15,23,42,0.025)]
      "
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div
          className="
            flex h-8 w-8
            items-center
            justify-center
            rounded-lg
            bg-[#EDF3FF]
            text-[#315BFF]
            [&>svg]:h-4
            [&>svg]:w-4
          "
        >
          {icon}
        </div>

        <h2 className="text-[14px] font-bold text-[#07113D]">
          {title}
        </h2>
      </div>

      {children}
    </section>
  );
}

function EvaluationRow({
  icon,
  title,
  description,
  badge,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div
      className="
        flex gap-2.5
        border-b border-slate-100
        py-3
        first:pt-0
        last:border-0
        last:pb-0
      "
    >
      <div
        className="
          flex h-9 w-9
          shrink-0
          items-center
          justify-center
          rounded-lg
          bg-[#EDF3FF]
          text-[#315BFF]
          [&>svg]:h-4
          [&>svg]:w-4
        "
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold text-[#07113D]">
            {title}
          </p>

          {badge ? (
            <span
              className="
                shrink-0
                rounded-md
                bg-[#F1EEFF]
                px-2 py-1
                text-[8px]
                font-medium
                text-[#7655E8]
              "
            >
              {badge}
            </span>
          ) : null}
        </div>

        <p className="mt-0.5 text-[9px] leading-[13px] text-[#66728F]">
          {description}
        </p>
      </div>
    </div>
  );
}

function InformationRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span
        className="
          shrink-0
          text-[#53617F]
          [&>svg]:h-3.5
          [&>svg]:w-3.5
        "
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1 text-[#66728F]">
        {label}
      </span>

      <span className="max-w-[55%] text-right font-medium text-[#53617F]">
        {value}
      </span>
    </div>
  );
}