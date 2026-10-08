
 // components/academy/course-detail/academy-course-detail.tsx
"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileQuestion,
  GraduationCap,
  Info,
  Layers3,
  ShieldCheck,
  Target,
} from "lucide-react";

import { AcademyCourseCurriculum } from "@/components/academy/course-detail/academy-course-curriculum";
import type { AcademyCourseDetail } from "@/lib/services/academy.service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOutline(detail: AcademyCourseDetail) {
  const config = detail.course.evaluation_config;

  if (!isRecord(config) || !isRecord(config.outline)) {
    return null;
  }

  return config.outline;
}

function getLearningObjectives(detail: AcademyCourseDetail): string[] {
  const objectives: string[] = [];

  for (const section of detail.course.sections) {
    const values = section.learning_objectives;

    if (!Array.isArray(values)) continue;

    for (const value of values) {
      if (typeof value !== "string" || !value.trim()) continue;

      const normalized = value.trim();

      if (!objectives.includes(normalized)) {
        objectives.push(normalized);
      }
    }
  }

  return objectives;
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return "Sin estimación";

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function InfoPanel({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[#315BFF]">{icon}</span>
        <h2 className="text-sm font-semibold text-[#07113D]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function AcademyCourseDetailContent({
  detail,
}: {
  detail: AcademyCourseDetail;
}) {
  const objectives = getLearningObjectives(detail);
  const outline = getOutline(detail);

  const description =
    typeof outline?.objective === "string"
      ? outline.objective
      : detail.course.description;

  return (
    <div className="@container/course-content h-full min-h-0 overflow-y-auto">
      <div className="grid min-w-0 grid-cols-1 gap-6 py-5 @min-[640px]/course-content:grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)]">
        <div className="min-w-0 space-y-5">
          <section>
            <div className="mb-4 flex items-center gap-2 text-[#07113D]">
              <Target className="h-5 w-5 text-[#315BFF]" />
              <h2 className="text-base font-semibold">Qué aprenderás</h2>
            </div>

            {description && (
              <p className="mb-4 text-sm leading-relaxed text-[#53617F]">
                {description}
              </p>
            )}

            {objectives.length > 0 ? (
              <div className="space-y-3">
                {objectives.map((objective, index) => (
                  <div key={`${index}-${objective}`} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#315BFF]" />
                    <p className="text-sm leading-relaxed text-[#53617F]">
                      {objective}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Este curso todavía no tiene objetivos de aprendizaje definidos.
              </p>
            )}
          </section>
        </div>

        <div className="min-w-0 border-t border-slate-200 pt-5 @min-[640px]/course-content:border-l @min-[640px]/course-content:border-t-0 @min-[640px]/course-content:pl-6 @min-[640px]/course-content:pt-0">
          <AcademyCourseCurriculum detail={detail} />
        </div>
      </div>
    </div>
  );
}

export function AcademyCourseDetailAside({
  detail,
}: {
  detail: AcademyCourseDetail;
}) {
  const { course, canManage } = detail;

  const progress = Math.max(
    0,
    Math.min(100, course.user_course_progress[0]?.progress_percent ?? 0),
  );

  const assignment = course.course_assignments[0];

  const quizCount = course.sections.reduce(
    (total, section) =>
      total +
      section.quizzes.length +
      section.lessons.reduce(
        (lessonTotal, lesson) => lessonTotal + lesson.quizzes.length,
        0,
      ),
    0,
  );

  const config = isRecord(course.evaluation_config)
    ? course.evaluation_config
    : null;

  const generation =
    config && isRecord(config.contentGeneration)
      ? config.contentGeneration
      : null;

  const reviewRequired = generation?.reviewRequired === true;

  return (
    <div className="space-y-4">
      {!course.is_published && (
        <InfoPanel icon={<Info className="h-4 w-4" />} title="Curso en borrador">
          <p className="text-xs leading-relaxed text-slate-600">
            El contenido todavía no está publicado.
            {canManage
              ? " Puedes consultarlo como responsable antes de su publicación."
              : ""}
          </p>
        </InfoPanel>
      )}

      {reviewRequired && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-sm font-semibold">Revisión recomendada</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-amber-800">
            El contenido puede abordar actividades de riesgo.
            Debe revisarlo personal competente antes de publicarlo.
          </p>
        </section>
      )}

      {course.is_published && (
        <InfoPanel
          icon={<CheckCircle2 className="h-4 w-4" />}
          title="Tu progreso"
        >
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#315BFF]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-semibold">{progress}%</span>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {assignment
              ? assignment.is_required
                ? "Formación obligatoria asignada"
                : "Curso asignado"
              : "Curso disponible"}
          </p>
        </InfoPanel>
      )}

      <InfoPanel icon={<Layers3 className="h-4 w-4" />} title="Contenido">
        <div className="space-y-3 text-xs text-[#53617F]">
          <InfoRow
            icon={<BookOpen className="h-4 w-4" />}
            label="Módulos"
            value={String(course.sections.length)}
          />
          <InfoRow
            icon={<GraduationCap className="h-4 w-4" />}
            label="Lecciones"
            value={String(
              course.sections.reduce(
                (total, section) => total + section.lessons.length,
                0,
              ),
            )}
          />
          <InfoRow
            icon={<Clock3 className="h-4 w-4" />}
            label="Duración"
            value={formatDuration(detail.estimatedMinutes)}
          />
          <InfoRow
            icon={<FileQuestion className="h-4 w-4" />}
            label="Cuestionarios"
            value={String(quizCount)}
          />
        </div>
      </InfoPanel>

      <InfoPanel icon={<ShieldCheck className="h-4 w-4" />} title="Información">
        <div className="space-y-3">
          <InfoRow
            icon={<GraduationCap className="h-4 w-4" />}
            label="Nivel"
            value={
              course.level === "advanced"
                ? "Avanzado"
                : course.level === "intermediate"
                  ? "Intermedio"
                  : "Básico"
            }
          />
          <InfoRow
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Estado"
            value={course.is_published ? "Publicado" : "Borrador"}
          />
          {course.users?.name && (
            <InfoRow
              icon={<Info className="h-4 w-4" />}
              label="Creado por"
              value={course.users.name}
            />
          )}
        </div>
      </InfoPanel>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="flex-1 text-slate-500">{label}</span>
      <span className="text-right font-medium text-[#07113D]">{value}</span>
    </div>
  );
}
