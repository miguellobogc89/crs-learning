// components/course-editor/course-tree.tsx
"use client";

import { useMemo, useState } from "react";

import {
  BookOpen,
  ChevronRight,
  FileText,
  FlaskConical,
  Folder,
  FolderOpen,
  GripVertical,
  Search,
} from "lucide-react";

import {
  deleteLesson,
  deleteQuiz,
  deleteSection,
} from "@/app/actions/tree";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { AddContentMenu } from "./add-content-menu";
import { LessonEditor } from "./lesson-editor";
import { QuizEditor } from "./quiz-editor";
import {
  DeleteMenuItem,
  TreeItemMenu,
} from "./tree-item-menu";
import type {
  Section,
  SectionItem,
  SelectedItem,
} from "./types";

type Props = {
  courseId: string;
  sections: Section[];
};

export function CourseTree({
  courseId,
  sections,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    sections[0]?.id ?? null
  );
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [search, setSearch] = useState("");

  const selectedSection = sections.find(
    (section) => section.id === selectedSectionId
  );

  const filteredSections = useMemo(() => {
    if (!search.trim()) {
      return sections;
    }

    const text = search.toLowerCase();

    return sections
      .map((section) => {
        const sectionMatches = section.title
          .toLowerCase()
          .includes(text);

        const section_items = section.section_items.filter((item) => {
          if (item.item_type === "lesson" && item.lessons) {
            return item.lessons.title
              .toLowerCase()
              .includes(text);
          }

          if (item.item_type === "quiz" && item.quizzes) {
            return item.quizzes.title
              .toLowerCase()
              .includes(text);
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
    setCollapsed((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  function selectSection(sectionId: string) {
    setSelectedSectionId(sectionId);
    setSelectedItem(null);
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
    <div className="flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-border bg-panel">
        <div className="border-b border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contenido
              </span>

              <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {sections.length}
              </span>
            </div>

            <AddContentMenu
              courseId={courseId}
              selectedSection={selectedSection}
            />
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />

            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar…"
              className="h-7 border-border bg-surface pl-7 text-xs placeholder:text-muted-foreground/70 focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {filteredSections.length === 0 ? (
            <EmptyTree />
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filteredSections.map((section) => {
                const isCollapsed = collapsed[section.id] ?? false;
                const isOpen = !isCollapsed || search.trim().length > 0;
                const isSelected =
                  selectedSectionId === section.id && selectedItem === null;

                return (
                  <li key={section.id}>
                    <SectionRow
                      courseId={courseId}
                      section={section}
                      isOpen={isOpen}
                      isSelected={isSelected}
                      onSelect={() => selectSection(section.id)}
                      onToggle={() => toggleSection(section.id)}
                    />

                    {isOpen && section.section_items.length > 0 && (
                      <ul className="relative ml-[15px] mt-0.5 flex flex-col gap-0.5 border-l border-border/70 pl-2">
                        {section.section_items.map((item) => (
                          <ItemRow
                            key={item.id}
                            courseId={courseId}
                            item={item}
                            selectedItem={selectedItem}
                            onSelect={() =>
                              selectSectionItem(section.id, item)
                            }
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        <EditorPanel
          courseId={courseId}
          selectedSection={selectedSection}
          selectedItem={selectedItem}
        />
      </section>
    </div>
  );
}

function SectionRow({
  courseId,
  section,
  isOpen,
  isSelected,
  onSelect,
  onToggle,
}: {
  courseId: string;
  section: Section;
  isOpen: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      onDoubleClick={onToggle}
      className={cn(
        "group/row relative flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[13px] leading-none transition-colors",
        "text-panel-foreground/85 hover:bg-surface-hover",
        isSelected && "bg-surface text-foreground"
      )}
    >
      <span className="pointer-events-none flex h-4 w-3 items-center justify-center text-muted-foreground/0 group-hover/row:text-muted-foreground/50">
        <GripVertical className="h-3 w-3" />
      </span>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className="flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            isOpen && "rotate-90"
          )}
        />
      </button>

      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 text-section" />
        ) : (
          <Folder className="h-3.5 w-3.5 text-section" />
        )}
      </span>

      <span className="min-w-0 flex-1 truncate font-medium">
        {section.title}
      </span>

      <div
        onClick={(event) => event.stopPropagation()}
        className="opacity-0 transition-opacity group-hover/row:opacity-100 data-[open=true]:opacity-100"
      >
        <TreeItemMenu>
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="sectionId" value={section.id} />

          <DeleteMenuItem action={deleteSection}>
            Eliminar sección
          </DeleteMenuItem>
        </TreeItemMenu>
      </div>
    </div>
  );
}

function ItemRow({
  courseId,
  item,
  selectedItem,
  onSelect,
}: {
  courseId: string;
  item: SectionItem;
  selectedItem: SelectedItem | null;
  onSelect: () => void;
}) {
  const isLesson = item.item_type === "lesson" && item.lessons;
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
    <li>
      <div
        onClick={onSelect}
        className={cn(
          "group/row relative flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[13px] leading-none transition-colors",
          "text-panel-foreground/85 hover:bg-surface-hover",
          active &&
            isLesson &&
            "bg-lesson-soft text-foreground ring-1 ring-lesson/40",
          active &&
            isQuiz &&
            "bg-test-soft text-foreground ring-1 ring-test/40"
        )}
      >
        <span className="pointer-events-none flex h-4 w-3 items-center justify-center text-muted-foreground/0 group-hover/row:text-muted-foreground/50">
          <GripVertical className="h-3 w-3" />
        </span>

        <span className="w-4" />

        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {isLesson ? (
            <FileText className="h-3.5 w-3.5 text-lesson" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5 text-test" />
          )}
        </span>

        <span className="min-w-0 flex-1 truncate">
          {title}
        </span>

        <div
          onClick={(event) => event.stopPropagation()}
          className="opacity-0 transition-opacity group-hover/row:opacity-100 data-[open=true]:opacity-100"
        >
          {isLesson && (
            <TreeItemMenu>
              <input type="hidden" name="courseId" value={courseId} />
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
              <input type="hidden" name="courseId" value={courseId} />
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
      </div>
    </li>
  );
}

function EditorPanel({
  courseId,
  selectedSection,
  selectedItem,
}: {
  courseId: string;
  selectedSection: Section | undefined;
  selectedItem: SelectedItem | null;
}) {
  if (selectedItem?.type === "lesson") {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <LessonEditor
            courseId={courseId}
            lesson={selectedItem.lesson}
          />
        </div>
      </div>
    );
  }

  if (selectedItem?.type === "quiz") {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <QuizEditor quiz={selectedItem.quiz} />
        </div>
      </div>
    );
  }

  if (selectedSection) {
    return (
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <span className="h-1.5 w-1.5 rounded-full bg-section" />

          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sección
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {selectedSection.title}
            </h1>

            <p className="mt-6 text-sm text-muted-foreground">
              Esta sección contiene {selectedSection.section_items.length} elementos.
              Selecciona una lección o un test en el árbol de la izquierda para editarlo.
            </p>

            <div className="mt-6 rounded-md border border-border bg-surface/40 p-4 text-sm text-muted-foreground">
              La edición avanzada de secciones se añadirá después. Ahora estamos
              priorizando que el árbol y el editor tengan la misma interfaz que el mock.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <EditorEmpty />;
}

function EditorEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground">
        <BookOpen className="h-5 w-5" />
      </div>

      <div className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">
          Ningún elemento seleccionado
        </h2>

        <p className="max-w-xs text-xs text-muted-foreground">
          Selecciona una lección, un test o una sección en el árbol de la izquierda
          para empezar a editar.
        </p>
      </div>
    </div>
  );
}

function EmptyTree() {
  return (
    <div className="mx-2 mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface/40 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-lesson-soft text-lesson">
        <Folder className="h-5 w-5" />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">
          Curso vacío
        </p>

        <p className="text-xs text-muted-foreground">
          Empieza creando la primera sección de tu curso.
        </p>
      </div>
    </div>
  );
}
