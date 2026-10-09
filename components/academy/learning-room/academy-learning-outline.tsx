// components/academy/learning-room/academy-learning-outline.tsx


"use client";

import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  GraduationCap,
  Layers3,
} from "lucide-react";
import { useState } from "react";

import type { DidacticPackage } from "@/lib/academy/didactic-package";

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
  courseTitle: string;
  modules: Module[];
  lessonId: string;
  screens: DidacticPackage["screens"];
  screenIndex: number;
  reviewed: Record<string, boolean>;
  preview: boolean;
  onSelectLesson: (id: string) => void;
  onSelectScreen: (index: number) => void;
};

export function AcademyLearningOutline({
  courseTitle,
  modules,
  lessonId,
  screens,
  screenIndex,
  reviewed,
  preview,
  onSelectLesson,
  onSelectScreen,
}: Props) {
  const activeModule = modules.find((module) =>
    module.lessons.some((lesson) => lesson.id === lessonId)
  );

  const [expandedModules, setExpandedModules] = useState<
    Record<string, boolean>
  >({});

  function isExpanded(id: string) {
    return expandedModules[id] ?? id === activeModule?.id;
  }

  function toggleModule(id: string) {
    setExpandedModules((previous) => ({
      ...previous,
      [id]: !isExpanded(id),
    }));
  }

  const totalLessons = modules.reduce(
    (total, module) => total + module.lessons.length,
    0
  );

  const completedLessons = modules.reduce(
    (total, module) =>
      total +
      module.lessons.filter((lesson) => lesson.completed).length,
    0
  );

  return (
    <aside className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="shrink-0 border-b border-slate-200/60 px-4 py-5">
        <div className="flex items-center gap-2 text-[#7566B8]">
          <GraduationCap className="h-4 w-4" />
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Tu formación
          </span>
        </div>

        <h2 className="mt-3 line-clamp-3 text-sm font-bold leading-5 text-[#17203C]">
          {courseTitle}
        </h2>

        {preview && (
          <span className="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
            Vista previa
          </span>
        )}

        <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
          <span>Progreso del curso</span>
          <span>
            {completedLessons}/{totalLessons} lecciones
          </span>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EAE7F3]">
          <div
            className="h-full rounded-full bg-[#8172BC] transition-all"
            style={{
              width: `${
                totalLessons
                  ? (completedLessons / totalLessons) * 100
                  : 0
              }%`,
            }}
          />
        </div>
      </div>

      <nav
        aria-label="Temario del curso"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-4"
      >
        <div className="mb-3 flex items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#918BA7]">
          <Layers3 className="h-3.5 w-3.5" />
          Programa
        </div>

        <div className="space-y-3">
          {modules.map((module, moduleIndex) => {
            const expanded = isExpanded(module.id);

            return (
              <section key={module.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggleModule(module.id)}
                  className="flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-[#F3F0FA]"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#EDE9F8] text-[11px] font-bold text-[#7566B8]">
                    {moduleIndex + 1}
                  </span>

                  <span className="min-w-0 flex-1 text-xs font-semibold leading-5 text-[#34405B]">
                    {module.title}
                  </span>

                  {expanded ? (
                    <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  )}
                </button>

                {expanded && (
                  <div className="ml-5 border-l border-[#E5E1F0] pl-2">
                    {module.lessons.map((lesson) => {
                      const active = lesson.id === lessonId;

                      return (
                        <div key={lesson.id}>
                          <button
                            type="button"
                            onClick={() => onSelectLesson(lesson.id)}
                            aria-current={active ? "step" : undefined}
                            className={[
                              "flex w-full items-start gap-2 rounded-lg px-2 py-2.5 text-left transition-colors",
                              active
                                ? "bg-[#F0ECFA] text-[#6655A8]"
                                : "text-[#58637B] hover:bg-[#F7F5FB]",
                            ].join(" ")}
                          >
                            {lesson.completed ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            ) : (
                              <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
                            )}

                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold leading-5">
                                {lesson.title}
                              </span>
                              <span className="mt-0.5 block text-[10px] opacity-65">
                                {lesson.estimatedMinutes} min
                              </span>
                            </span>
                          </button>

                          {active && screens.length > 0 && (
                            <div className="ml-3 mt-1 mb-2 space-y-0.5 border-l border-[#DDD6F0] pl-2">
                              {screens.map((screen, index) => {
                                const selected = index === screenIndex;
                                const done = Boolean(reviewed[screen.id]);

                                return (
                                  <button
                                    key={screen.id}
                                    type="button"
                                    onClick={() => onSelectScreen(index)}
                                    aria-current={selected ? "step" : undefined}
                                    className={[
                                      "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                                      selected
                                        ? "bg-[#EAE5F8] text-[#6252A5]"
                                        : "text-slate-500 hover:bg-[#F5F2FB]",
                                    ].join(" ")}
                                  >
                                    {done ? (
                                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                    ) : selected ? (
                                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#8172BC]" />
                                    ) : (
                                      <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C8C3D5]" />
                                    )}

                                    <span className="min-w-0 flex-1 text-[11px] leading-[18px]">
                                      <span className="mr-1 opacity-60">
                                        {index + 1}.
                                      </span>
                                      {screen.title}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
