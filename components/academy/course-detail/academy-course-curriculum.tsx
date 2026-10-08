
// components/academy/course-detail/academy-course-curriculum.tsx
"use client";

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  Clock3,
  FileQuestion,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import type { AcademyCourseDetail } from "@/lib/services/academy.service";

type Section = AcademyCourseDetail["course"]["sections"][number];
type Lesson = Section["lessons"][number];

function formatDuration(minutes: number) {
  if (!minutes) return "Sin estimación";

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function AcademyCourseCurriculum({
  detail,
}: {
  detail: AcademyCourseDetail;
}) {
  const { sections } = detail.course;

  const [expanded, setExpanded] = useState<string | null>(
    sections[0]?.id ?? null,
  );

  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

  const totalLessons = sections.reduce(
    (total, section) => total + section.lessons.length,
    0,
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDF3FF] text-[#315BFF]">
          <BookOpen className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-[#07113D]">
            Temario del curso
          </h2>
          <p className="mt-1 text-xs text-[#66728F]">
            {sections.length} módulos · {totalLessons} lecciones ·{" "}
            {formatDuration(detail.estimatedMinutes)}
          </p>
        </div>
      </div>

      {selectedLesson ? (
        <div className="mt-5 min-w-0 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-[#315BFF]">
                Vista previa de lección
              </p>
              <h3 className="text-base font-semibold text-[#07113D]">
                {selectedLesson.title}
              </h3>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                {selectedLesson.estimated_minutes} minutos
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedLesson(null)}
              aria-label="Volver al temario"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="prose prose-sm max-w-none break-words p-5 text-slate-700 prose-headings:text-[#07113D] prose-a:text-[#315BFF]">
            <ReactMarkdown>{selectedLesson.content}</ReactMarkdown>
          </div>

          <div className="border-t border-slate-100 p-3">
            <button
              type="button"
              onClick={() => setSelectedLesson(null)}
              className="text-xs font-semibold text-[#315BFF] hover:underline"
            >
              ← Volver al temario
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {sections.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Este curso todavía no tiene módulos.
            </div>
          )}

          {sections.map((section, index) => {
            const isOpen = expanded === section.id;

            const minutes = section.lessons.reduce(
              (total, lesson) => total + lesson.estimated_minutes,
              0,
            );

            return (
              <div
                key={section.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setExpanded(current =>
                      current === section.id ? null : section.id,
                    )
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EDF3FF] text-xs font-semibold text-[#315BFF]">
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#07113D]">
                      {section.title}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {section.lessons.length} lecciones
                      {minutes > 0 && ` · ${formatDuration(minutes)}`}
                    </span>
                  </span>

                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    {section.description && (
                      <p className="mb-3 text-xs leading-relaxed text-slate-500">
                        {section.description}
                      </p>
                    )}

                    {section.lessons.length === 0 &&
                      section.quizzes.length === 0 && (
                        <p className="py-2 text-xs text-slate-400">
                          Contenido pendiente de generación.
                        </p>
                      )}

                    <div className="space-y-1">
                      {section.lessons.map(lesson => {
                        const completed = Boolean(
                          lesson.user_lesson_progress[0]?.completed_at,
                        );

                        return (
                          <button
                            key={lesson.id}
                            type="button"
                            onClick={() => setSelectedLesson(lesson)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#F6F8FC]"
                          >
                            {completed ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            ) : (
                              <CirclePlay className="h-4 w-4 shrink-0 text-[#315BFF]" />
                            )}

                            <span className="min-w-0 flex-1 text-xs font-medium text-[#53617F]">
                              {lesson.title}
                            </span>

                            <span className="shrink-0 text-xs text-slate-400">
                              {lesson.estimated_minutes} min
                            </span>
                          </button>
                        );
                      })}

                      {section.quizzes.map(quiz => (
                        <div
                          key={quiz.id}
                          className="flex items-center gap-3 px-3 py-2.5"
                        >
                          <FileQuestion className="h-4 w-4 shrink-0 text-violet-500" />
                          <span className="flex-1 text-xs text-[#53617F]">
                            {quiz.title}
                          </span>
                          <span className="text-xs text-violet-600">Test</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
