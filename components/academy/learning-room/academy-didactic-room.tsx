
"use client";

// components/academy/learning-room/academy-didactic-room.tsx

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";

import {
  generateLessonDidacticAction,
  getLessonDidacticAction,
} from "@/app/actions/academy-didactic";

import type {
  DidacticPackage,
} from "@/lib/academy/didactic-package";

import { DidacticVisual } from "./didactic-visual";
import { DidacticActivity } from "./didactic-activity";

type Lesson = {
  id: string;
  title: string;
  estimatedMinutes: number;
  completed: boolean;
};

type Module = {
  id: string;
  title: string;
  lessons: Lesson[];
};

type Props = {
  courseId: string;
  courseTitle: string;
  modules: Module[];
  preview: boolean;
  canManage: boolean;
};

const PHASE_LABELS = {
  introduction: "Introducción",
  development: "Desarrollo",
  assessment: "Evaluación",
  reflection: "Reflexión",
} as const;

const TYPE_LABELS = {
  concept: "Concepto",
  comparison: "Comparativa",
  case: "Caso práctico",
  process: "Proceso",
  exercise: "Actividad",
  summary: "Resumen",
  decision: "Toma de decisiones",
  simulation: "Simulación",
  analysis: "Análisis",
  demonstration: "Demostración",
} as const;

export function AcademyDidacticRoom({
  courseId,
  courseTitle,
  modules,
  preview,
  canManage,
}: Props) {
  const lessons = modules.flatMap((module) =>
    module.lessons.map((lesson) => ({
      ...lesson,
      moduleTitle: module.title,
    })),
  );

  const initialLesson =
    lessons.find((lesson) => !lesson.completed) ??
    lessons[0];

  const [lessonId, setLessonId] = useState(
    initialLesson?.id ?? "",
  );
  const [didactic, setDidactic] =
    useState<DidacticPackage | null>(null);
  const [screenIndex, setScreenIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTeacher, setShowTeacher] = useState(true);
  const [showOutline, setShowOutline] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});

  const currentLesson = lessons.find(
    (lesson) => lesson.id === lessonId,
  );

  const loadLesson = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      setDidactic(null);
      setScreenIndex(0);
      setAnswers({});
      setReviewed({});

      try {
        const result = await getLessonDidacticAction({
          courseId,
          lessonId: id,
        });

        if (!result.ok) {
          throw new Error(result.error);
        }

        setDidactic(result.package);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se ha podido cargar la lección.",
        );
      } finally {
        setLoading(false);
      }
    },
    [courseId],
  );

  useEffect(() => {
    if (lessonId) {
      void loadLesson(lessonId);
    } else {
      setLoading(false);
    }
  }, [lessonId, loadLesson]);

  async function generateLesson() {
    if (!lessonId || generating || !canManage) return;

    setGenerating(true);
    setError(null);

    try {
      const result = await generateLessonDidacticAction({
        courseId,
        lessonId,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      setDidactic(result.package);
      setScreenIndex(0);
      setAnswers({});
      setReviewed({});
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se ha podido generar la clase.",
      );
    } finally {
      setGenerating(false);
    }
  }

  const screens = didactic?.screens ?? [];
  const screen = screens[screenIndex];
  const isLast = screenIndex === screens.length - 1;

  const activityReady = screen?.activity
    ? Boolean(reviewed[screen.id])
    : true;

  const progress = screens.length
    ? Math.round(((screenIndex + 1) / screens.length) * 100)
    : 0;

  function nextScreen() {
    if (!screen || !activityReady || isLast) return;
    setScreenIndex((value) => value + 1);
  }

  function selectLesson(id: string) {
    if (id !== lessonId) {
      setLessonId(id);
    }
  }

  function changeAnswer(screenId: string, value: string) {
    setAnswers((previous) => ({
      ...previous,
      [screenId]: value,
    }));

    setReviewed((previous) => ({
      ...previous,
      [screenId]: false,
    }));
  }

  function reviewAnswer(screenId: string) {
    setReviewed((previous) => ({
      ...previous,
      [screenId]: true,
    }));
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#F5F7FC] text-[#101B3D]">
      {showOutline && (
        <aside className="flex h-full w-[260px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white xl:w-[290px]">
          <div className="shrink-0 border-b border-slate-100 p-5">
            <div className="flex items-center gap-2 text-[#315BFF]">
              <GraduationCap className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Academy
              </span>
            </div>

            <h2 className="mt-4 text-sm font-bold leading-relaxed">
              {courseTitle}
            </h2>

            {preview && (
              <p className="mt-2 text-xs text-amber-600">
                Vista previa del curso
              </p>
            )}
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Programa
            </p>

            {modules.map((module, moduleIndex) => (
              <div key={module.id} className="mb-4">
                <p className="px-3 py-2 text-xs font-bold text-slate-500">
                  {moduleIndex + 1}. {module.title}
                </p>

                {module.lessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => selectLesson(lesson.id)}
                    className={`flex w-full items-start gap-2 rounded-xl px-3 py-3 text-left text-xs leading-relaxed transition-colors ${
                      lesson.id === lessonId
                        ? "bg-[#EAF0FF] font-semibold text-[#315BFF]"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {lesson.completed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>{lesson.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="shrink-0 border-t border-slate-100 p-4">
            <Link
              href={`/courses/${courseId}`}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs font-semibold hover:bg-slate-200"
            >
              <X className="h-4 w-4" />
              Salir del aula
            </Link>
          </div>
        </aside>
      )}

      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <button
            type="button"
            onClick={() => setShowOutline((value) => !value)}
            className="rounded-lg p-2 hover:bg-slate-100"
            aria-label="Mostrar u ocultar temario"
          >
            <BookOpen className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-400">
              {currentLesson?.moduleTitle}
            </p>
            <h1 className="truncate text-sm font-bold">
              {currentLesson?.title}
            </h1>
          </div>

          {didactic && screens.length > 0 && (
            <div className="hidden items-center gap-3 sm:flex">
              <span className="text-xs font-medium text-slate-500">
                {screenIndex + 1} / {screens.length}
              </span>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#315BFF] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <Link
            href={`/courses/${courseId}`}
            aria-label="Cerrar"
            className="rounded-lg p-2 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </Link>
        </header>

        {loading ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
            <LoaderCircle className="h-8 w-8 animate-spin text-[#315BFF]" />
            <p className="text-sm text-slate-500">
              Preparando el aula...
            </p>
          </div>
        ) : !didactic || !screen ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
            <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EDF2FF]">
                <Sparkles className="h-8 w-8 text-[#315BFF]" />
              </div>

              <h2 className="mt-5 text-xl font-bold">
                Esta clase aún no está preparada
              </h2>

              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                La lección existe, pero todavía no se ha
                transformado en una clase didáctica.
              </p>

              {error && (
                <p className="mt-4 text-sm text-red-600">
                  {error}
                </p>
              )}

              {canManage ? (
                <button
                  type="button"
                  onClick={() => void generateLesson()}
                  disabled={generating}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#315BFF] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {generating ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generating
                    ? "Produciendo clase..."
                    : "Generar clase con IA"}
                </button>
              ) : (
                <p className="mt-5 text-sm text-slate-500">
                  El responsable del curso debe preparar
                  esta lección.
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6">
              <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-[#EAF0FF] px-3 py-1.5 text-[11px] font-bold text-[#315BFF]">
                      {PHASE_LABELS[screen.phase]}
                    </span>
                    <span className="text-xs text-slate-400">
                      {TYPE_LABELS[screen.type]}
                    </span>
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      disabled={generating}
                      onClick={() => void generateLesson()}
                      className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-[#315BFF] disabled:opacity-50"
                    >
                      {generating ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Regenerar clase
                    </button>
                  )}
                </div>

                {error && (
                  <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <div className="rounded-3xl border border-[#E3E9F5] bg-white p-6 shadow-sm lg:p-8">
                  <div className="mb-7 max-w-3xl">
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[#315BFF]">
                      Pantalla {screenIndex + 1}
                    </p>

                    <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">
                      {screen.title}
                    </h2>

                    {screen.subtitle && (
                      <p className="mt-3 text-sm leading-relaxed text-slate-500">
                        {screen.subtitle}
                      </p>
                    )}
                  </div>

                  <DidacticVisual screen={screen} />
                </div>

                <section className="rounded-2xl border border-[#DEE7FF] bg-[#F0F4FF]">
                  <button
                    type="button"
                    onClick={() => setShowTeacher((value) => !value)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#315BFF] text-white">
                      <GraduationCap className="h-5 w-5" />
                    </div>

                    <div className="flex-1">
                      <p className="text-sm font-bold">
                        Profesor Academy
                      </p>
                      <p className="text-xs text-slate-500">
                        Explicación de esta pantalla
                      </p>
                    </div>

                    {showTeacher ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  {showTeacher && (
                    <div className="px-5 pb-5 pl-[68px]">
                      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {screen.teacher.explanation}
                      </p>

                      {screen.teacher.transition && (
                        <p className="mt-4 border-t border-[#D9E3FF] pt-4 text-sm italic leading-relaxed text-slate-500">
                          {screen.teacher.transition}
                        </p>
                      )}
                    </div>
                  )}
                </section>

                {screen.activity && (
                  <DidacticActivity
                    key={`${lessonId}:${screen.id}`}
                    activity={screen.activity}
                    value={answers[screen.id] ?? ""}
                    onChange={(value) =>
                      changeAnswer(screen.id, value)
                    }
                    reviewed={Boolean(reviewed[screen.id])}
                    onReview={() => reviewAnswer(screen.id)}
                  />
                )}

                {isLast && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                    <p className="text-sm font-bold text-amber-900">
                      Fin de la clase
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-amber-800">
                      Has recorrido las pantallas. La lección
                      todavía no se marca como completada:
                      faltan la evaluación y el progreso persistente.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <footer className="z-30 w-full shrink-0 border-t border-slate-200 bg-white px-5 py-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
              <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4">
                <button
                  type="button"
                  disabled={screenIndex === 0}
                  onClick={() =>
                    setScreenIndex((value) =>
                      Math.max(0, value - 1),
                    )
                  }
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Anterior
                </button>

                <span className="hidden text-xs text-slate-500 sm:block">
                  Pantalla {screenIndex + 1} de {screens.length}
                </span>

                <button
                  type="button"
                  disabled={isLast || !activityReady}
                  onClick={nextScreen}
                  className="flex items-center gap-2 rounded-xl bg-[#315BFF] px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {isLast ? "Fin" : "Continuar"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
