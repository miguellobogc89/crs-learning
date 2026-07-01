// components/course-editor/course-tree.tsx
"use client";

import {
  deleteLesson,
  deleteQuiz,
  deleteSection,
} from "@/app/actions/tree";
import {
  DeleteMenuItem,
  TreeItemMenu,
} from "@/components/course-editor/tree-item-menu";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AddContentMenu } from "./add-content-menu";
import { LessonEditor } from "./lesson-editor";
import { QuizEditor } from "./quiz-editor";
import type { Section, SectionItem, SelectedItem } from "./types";

type Props = {
  courseId: string;
  sections: Section[];
};

export function CourseTree({ courseId, sections }: Props) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [search, setSearch] = useState("");

  const selectedSection = sections.find(
    (section) => section.id === selectedSectionId
  );

  const filteredSections = useMemo(() => {
    if (!search.trim()) {
      return sections;
    }

    const normalizedSearch = search.toLowerCase();

    return sections
      .map((section) => {
        const sectionMatches = section.title
          .toLowerCase()
          .includes(normalizedSearch);

        const section_items = section.section_items.filter((item) => {
          if (item.item_type === "lesson" && item.lessons) {
            return item.lessons.title.toLowerCase().includes(normalizedSearch);
          }

          if (item.item_type === "quiz" && item.quizzes) {
            return item.quizzes.title.toLowerCase().includes(normalizedSearch);
          }

          return false;
        });

        if (sectionMatches || section_items.length > 0) {
          return {
            ...section,
            section_items,
          };
        }

        return null;
      })
      .filter(Boolean) as Section[];
  }, [sections, search]);

  function toggleSection(sectionId: string) {
    setSelectedSectionId(sectionId);

    if (expanded.includes(sectionId)) {
      setExpanded(expanded.filter((id) => id !== sectionId));
      return;
    }

    setExpanded([...expanded, sectionId]);
  }

  function selectSectionItem(sectionId: string, item: SectionItem) {
    setSelectedSectionId(sectionId);

    if (item.item_type === "lesson" && item.lessons) {
      setSelectedItem({
        type: "lesson",
        lesson: item.lessons,
      });
      return;
    }

    if (item.item_type === "quiz" && item.quizzes) {
      setSelectedItem({
        type: "quiz",
        quiz: item.quizzes,
      });
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-160px)] grid-cols-[360px_1fr] overflow-hidden rounded-2xl border border-slate-800 bg-[#0b0f14]">
      <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-[#070b10]">
        <div className="border-b border-slate-800 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Contenido
          </p>

          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />

            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar..."
              className="h-10 border-slate-800 bg-slate-950 pl-9 text-sm"
            />
          </div>
        </div>

        <AddContentMenu courseId={courseId} selectedSection={selectedSection} />

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {filteredSections.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center">
              <p className="text-sm text-slate-500">
                No hay contenido que mostrar.
              </p>
            </div>
          )}

          <div className="space-y-1">
            {filteredSections.map((section) => {
              const isOpen =
                expanded.includes(section.id) || search.trim().length > 0;

              const isSelected = selectedSectionId === section.id;

              return (
                <div key={section.id}>
                  <div
                    className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                      isSelected
                        ? "bg-slate-900 text-white"
                        : "text-slate-300 hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="text-slate-500">
                        {isOpen ? (
                          <ChevronDown size={15} />
                        ) : (
                          <ChevronRight size={15} />
                        )}
                      </span>

                      <Folder size={16} className="text-cyan-400" />

                      <span className="min-w-0 flex-1 truncate">
                        {section.title}
                      </span>
                    </button>

                    <TreeItemMenu>
                      <input type="hidden" name="courseId" value={courseId} />
                      <input type="hidden" name="sectionId" value={section.id} />

                      <DeleteMenuItem action={deleteSection}>
                        Eliminar sección
                      </DeleteMenuItem>
                    </TreeItemMenu>
                  </div>

                  {isOpen && (
                    <div className="ml-5 mt-1 space-y-1 border-l border-slate-800 pl-3">
                      {section.section_items.map((item) => {
                        const isLesson =
                          item.item_type === "lesson" && item.lessons;

                        const isQuiz = item.item_type === "quiz" && item.quizzes;

                        if (!isLesson && !isQuiz) {
                          return null;
                        }

                        const title = isLesson
                          ? item.lessons!.title
                          : item.quizzes!.title;

                        const active =
                          selectedItem?.type === "lesson" && isLesson
                            ? selectedItem.lesson.id === item.lessons!.id
                            : selectedItem?.type === "quiz" && isQuiz
                              ? selectedItem.quiz.id === item.quizzes!.id
                              : false;

                        return (
                          <div
                            key={item.id}
                            className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                              active
                                ? isLesson
                                  ? "bg-cyan-400 text-slate-950"
                                  : "bg-amber-400 text-slate-950"
                                : isLesson
                                  ? "text-slate-400 hover:bg-slate-900 hover:text-white"
                                  : "text-amber-300 hover:bg-slate-900 hover:text-amber-200"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => selectSectionItem(section.id, item)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              {isLesson ? (
                                <FileText size={15} />
                              ) : (
                                <span>📝</span>
                              )}

                              <span className="min-w-0 flex-1 truncate">
                                {title}
                              </span>
                            </button>

                            {isLesson && (
                              <TreeItemMenu>
                                <input
                                  type="hidden"
                                  name="courseId"
                                  value={courseId}
                                />
                                <input
                                  type="hidden"
                                  name="lessonId"
                                  value={item.lessons!.id}
                                />

                                <DeleteMenuItem action={deleteLesson}>
                                  Eliminar lección
                                </DeleteMenuItem>
                              </TreeItemMenu>
                            )}

                            {isQuiz && (
                              <TreeItemMenu>
                                <input
                                  type="hidden"
                                  name="courseId"
                                  value={courseId}
                                />
                                <input
                                  type="hidden"
                                  name="quizId"
                                  value={item.quizzes!.id}
                                />

                                <DeleteMenuItem action={deleteQuiz}>
                                  Eliminar test
                                </DeleteMenuItem>
                              </TreeItemMenu>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="min-w-0 bg-[#111827] p-8">
        {!selectedItem && (
          <div className="flex h-full min-h-[520px] items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-[#0b0f14] text-center">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Selecciona un elemento
              </h2>

              <p className="mt-3 text-slate-400">
                Elige una lección o un test del árbol para editarlo.
              </p>
            </div>
          </div>
        )}

        {selectedItem?.type === "lesson" && (
          <div className="rounded-2xl border border-slate-800 bg-[#0b0f14] p-8">
            <LessonEditor courseId={courseId} lesson={selectedItem.lesson} />
          </div>
        )}

        {selectedItem?.type === "quiz" && (
          <div className="rounded-2xl border border-slate-800 bg-[#0b0f14] p-8">
            <QuizEditor quiz={selectedItem.quiz} />
          </div>
        )}
      </section>
    </div>
  );
}