// components/academy/course-detail/academy-course-detail.tsx

"use client";

import type { ReactNode } from "react";
import {
  BarChart3, BookOpen, CalendarDays, CheckCircle2, Clock3, FileQuestion,
  Gauge, Info, Languages, Layers3, Medal, ShieldCheck, Sparkles,
} from "lucide-react";
import { AcademyCourseLearningSummary } from "@/components/academy/course-detail/academy-course-learning-summary";
import { AcademyCourseCurriculum } from "@/components/academy/course-detail/academy-course-curriculum";
import { Progress } from "@/components/ui/progress";
import type { AcademyCourseDetail } from "@/lib/services/academy.service";

function formatDate(
  value: Date | string | null | undefined,
) {
  if (!value) return null;

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

const MOCK_SKILLS = [
  "Power BI",
  "Visualización de datos",
  "Análisis de datos",
  "Storytelling con datos",
];

export function AcademyCourseDetailContent({ detail }: { detail: AcademyCourseDetail }) {
  return (
    <div className="@container/course-content min-w-0">
      <div className="grid min-w-0 grid-cols-1 gap-5 py-5 @min-[640px]/course-content:grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)] @min-[640px]/course-content:gap-6">
        <div className="min-w-0">
          <AcademyCourseLearningSummary />
        </div>
        <div className="min-w-0 border-t border-slate-200 pt-5 @min-[640px]/course-content:border-l @min-[640px]/course-content:border-t-0 @min-[640px]/course-content:pl-6 @min-[640px]/course-content:pt-0">
          <AcademyCourseCurriculum detail={detail} />
        </div>
      </div>
      <CourseSkillsFooter />
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 border-t border-slate-200 py-5 @min-[640px]/course-content:grid-cols-2 @min-[1100px]/course-page:hidden">
        <AcademyCourseDetailAside detail={detail} />
      </div>
    </div>
  );
}

function CourseSkillsFooter() {
  return (
    <footer
      className="
        relative
        z-30
        flex
        min-w-0
        shrink-0
        flex-wrap
        items-start
        gap-3

        border-t
        border-slate-200
        bg-white

        min-h-[50px]
        py-2.5

        @min-[640px]/course-content:min-h-[54px]
        @min-[640px]/course-content:gap-3.5

        @min-[800px]/course-content:min-h-[58px]
        @min-[800px]/course-content:gap-4
        @min-[800px]/course-content:py-3

        @min-[960px]/course-content:min-h-[64px]
        @min-[960px]/course-content:gap-5
        @min-[960px]/course-content:py-3.5

        @min-[1100px]/course-content:min-h-[72px]
        @min-[1100px]/course-content:py-4
      "
    >
      <span
        className="
          shrink-0
          text-[11px]
          font-bold
          text-[#07113D]

          @min-[640px]/course-content:text-[12px]
          @min-[800px]/course-content:text-[13px]
          @min-[960px]/course-content:text-[14px]
          @min-[1100px]/course-content:text-[15px]
        "
      >
        Habilidades
      </span>

      <div
        className="
          flex
          min-w-0
          flex-wrap
          items-center
          gap-1.5

          @min-[640px]/course-content:gap-2
          @min-[800px]/course-content:gap-2.5
          @min-[960px]/course-content:gap-3
        "
      >
        {MOCK_SKILLS.map((skill) => (
          <span
            key={skill}
            className="
              max-w-full break-words [overflow-wrap:anywhere]
              rounded-full
              bg-[#EDF3FF]
              px-2.5
              py-1
              text-[9px]
              font-semibold
              text-[#315BFF]

              @min-[640px]/course-content:px-3
              @min-[640px]/course-content:text-[10px]

              @min-[800px]/course-content:px-3.5
              @min-[800px]/course-content:py-1.5
              @min-[800px]/course-content:text-[11px]

              @min-[960px]/course-content:px-4
              @min-[960px]/course-content:text-[12px]

              @min-[1100px]/course-content:text-[13px]
            "
          >
            {skill}
          </span>
        ))}
      </div>
    </footer>
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
              h-2
              flex-1
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
          border
          border-[#E9E4FF]
          bg-gradient-to-br
          from-[#F7F4FF]
          to-[#F0F3FF]
          p-4
        "
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#7655E8]" />

          <h2 className="min-w-0 break-words text-[14px] font-bold text-[#07113D]">
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
        min-w-0
        shrink-0
        rounded-lg
        border
        border-slate-200
        bg-white
        p-4
        shadow-[0_2px_8px_rgba(15,23,42,0.025)]
      "
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div
          className="
            flex
            h-8 w-8
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

        <h2 className="min-w-0 break-words text-[14px] font-bold text-[#07113D]">
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
        flex
        gap-2.5
        border-b
        border-slate-100
        py-3
        first:pt-0
        last:border-0
        last:pb-0
      "
    >
      <div
        className="
          flex
          h-9 w-9
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
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold text-[#07113D]">
            {title}
          </p>

          {badge ? (
            <span
              className="
                shrink-0
                rounded-md
                bg-[#F1EEFF]
                px-2
                py-1
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

      <span className="min-w-0 max-w-[55%] break-words text-right font-medium text-[#53617F] [overflow-wrap:anywhere]">
        {value}
      </span>
    </div>
  );
}