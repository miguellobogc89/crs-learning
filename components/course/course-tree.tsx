// components/course/course-tree.tsx
"use client";

import { createLesson, updateLesson } from "@/app/actions/lesson";
import { createSection } from "@/app/actions/section";
import { createSectionQuiz } from "@/app/actions/quiz";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  ListPlus,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Lesson = {
  id: string;
  title: string;
  content: string;
};

type Quiz = {
  id: string;
  title: string;
};

type Section = {
  id: string;
  title: string;
  lessons: Lesson[];
  quizzes: Quiz[];
};

type Props = {
  courseId: string;
  sections: Section[];
};

type AddMode = "section" | "lesson" | "test";
type SelectedItem =
  | { type: "lesson"; lesson: Lesson }
  | { type: "quiz"; quiz: Quiz };

export function CourseTree({ courseId, sections }: Props) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [addMode, setAddMode] = useState<AddMode>("section");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [quizPage, setQuizPage] = useState(0);

  function toggle(sectionId: string) {
    setSelectedSectionId(sectionId);

    if (expanded.includes(sectionId)) {
      setExpanded(expanded.filter((id) => id !== sectionId));
      return;
    }

    setExpanded([...expanded, sectionId]);
  }

  function selectLesson(lesson: Lesson, sectionId: string) {
    setSelectedSectionId(sectionId);
    setSelectedItem({ type: "lesson", lesson });
    setDraftTitle(lesson.title);
    setDraftContent(lesson.content ?? "");
  }

  function selectQuiz(quiz: Quiz, sectionId: string) {
    setSelectedSectionId(sectionId);
    setSelectedItem({ type: "quiz", quiz });
    setQuizPage(0);
  }

  function discardChanges() {
    if (!selectedItem || selectedItem.type !== "lesson") {
      return;
    }

    setDraftTitle(selectedItem.lesson.title);
    setDraftContent(selectedItem.lesson.content ?? "");
  }

  const selectedSection = sections.find(
    (section) => section.id === selectedSectionId
  );

  const quizPages = [
    "Resumen",
    "Pregunta 1",
    "Pregunta 2",
    "Pregunta 3",
  ];

  return (
    <div className="grid grid-cols-[320px_1fr] gap-8">
      <aside className="rounded-xl border border-slate-800 bg-slate-950">
        <div className="border-b border-slate-800 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <ListPlus size={16} />
            Añadir contenido
          </div>

          <select
            value={addMode}
            onChange={(event) => setAddMode(event.target.value as AddMode)}
            className="mb-3 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none"
          >
            <option value="section">Sección</option>
            <option value="lesson">Lección</option>
            <option value="test">Test</option>
          </select>

          {addMode === "section" && (
            <form action={createSection} className="flex gap-2">
              <input type="hidden" name="courseId" value={courseId} />

              <Input
                name="title"
                placeholder="Nueva sección"
                className="h-10 text-sm"
              />

              <Button size="sm">Crear</Button>
            </form>
          )}

          {addMode === "lesson" && (
            <form action={createLesson} className="space-y-2">
              <input type="hidden" name="courseId" value={courseId} />
              <input
                type="hidden"
                name="sectionId"
                value={selectedSectionId ?? ""}
              />

              <Input
                name="title"
                placeholder={
                  selectedSection
                    ? `Lección en ${selectedSection.title}`
                    : "Selecciona una sección"
                }
                disabled={!selectedSectionId}
                className="h-10 text-sm"
              />

              <Button size="sm" disabled={!selectedSectionId}>
                Crear lección
              </Button>
            </form>
          )}

          {addMode === "test" && (
            <form action={createSectionQuiz} className="space-y-2">
              <input type="hidden" name="courseId" value={courseId} />
              <input
                type="hidden"
                name="sectionId"
                value={selectedSectionId ?? ""}
              />

              <p className="text-xs text-slate-500">
                {selectedSection
                  ? `Se creará un test en ${selectedSection.title}`
                  : "Selecciona una sección"}
              </p>

              <Button size="sm" disabled={!selectedSectionId}>
                Crear test
              </Button>
            </form>
          )}
        </div>

        <div className="p-3">
          {sections.length === 0 && (
            <p className="text-sm text-slate-500">No hay secciones.</p>
          )}

          {sections.map((section) => {
            const isOpen = expanded.includes(section.id);
            const isSelected = selectedSectionId === section.id;

            return (
              <div key={section.id}>
                <button
                  onClick={() => toggle(section.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    isSelected
                      ? "bg-slate-900 text-white"
                      : "text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  {isOpen ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}

                  <Folder size={18} className="text-yellow-400" />

                  {section.title}
                </button>

                {isOpen && (
                  <div className="ml-8 mt-1 border-l border-slate-800 pl-4">
                    <div className="space-y-1 py-2">
                      {section.lessons.map((lesson) => (
                        <button
                          key={lesson.id}
                          onClick={() => selectLesson(lesson, section.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                            selectedItem?.type === "lesson" &&
                            selectedItem.lesson.id === lesson.id
                              ? "bg-cyan-500 text-slate-950"
                              : "text-slate-300 hover:bg-slate-900"
                          }`}
                        >
                          <FileText size={15} />
                          {lesson.title}
                        </button>
                      ))}

                      {section.quizzes.map((quiz) => (
                        <button
                          key={quiz.id}
                          onClick={() => selectQuiz(quiz, section.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                            selectedItem?.type === "quiz" &&
                            selectedItem.quiz.id === quiz.id
                              ? "bg-amber-400 text-slate-950"
                              : "text-amber-300 hover:bg-slate-900"
                          }`}
                        >
                          📝 {quiz.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="min-h-[520px] rounded-xl border border-slate-800 bg-slate-950 p-8">
        {!selectedItem && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <h2 className="text-2xl font-semibold text-white">Editor</h2>
              <p className="mt-3 text-slate-400">
                Selecciona una lección o un test para comenzar.
              </p>
            </div>
          </div>
        )}

        {selectedItem?.type === "lesson" && (
          <form action={updateLesson} className="space-y-6">
            <input type="hidden" name="lessonId" value={selectedItem.lesson.id} />
            <input type="hidden" name="courseId" value={courseId} />

            <div>
              <label className="mb-2 block text-sm text-slate-400">
                Título de la lección
              </label>

              <Input
                name="title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-400">
                Contenido
              </label>

              <Textarea
                name="content"
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                className="min-h-[280px]"
                placeholder="Escribe aquí el contenido de la lección..."
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit">Guardar</Button>

              <Button
                type="button"
                variant="secondary"
                onClick={discardChanges}
              >
                Descartar
              </Button>
            </div>
          </form>
        )}

        {selectedItem?.type === "quiz" && (
          <div className="flex min-h-[460px] flex-col">
            <div className="mb-8 flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-medium text-amber-300">
                  Test de sección
                </p>

                <h2 className="mt-2 text-3xl font-bold text-white">
                  {selectedItem.quiz.title}
                </h2>

                <p className="mt-2 text-slate-400">
                  Configura la evaluación y navega por sus preguntas.
                </p>
              </div>

              <Button variant="secondary">
                Añadir pregunta
              </Button>
            </div>

            {quizPage === 0 && (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">Preguntas totales</p>
                  <p className="mt-3 text-4xl font-bold text-white">12</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">Tipo test</p>
                  <p className="mt-3 text-4xl font-bold text-cyan-400">8</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">Desarrollo escrito</p>
                  <p className="mt-3 text-4xl font-bold text-purple-400">3</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">Orales</p>
                  <p className="mt-3 text-4xl font-bold text-amber-400">1</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 md:col-span-2">
                  <p className="text-sm text-slate-400">
                    Configuración de preguntas tipo test
                  </p>

                  <div className="mt-4 space-y-2 text-sm text-slate-300">
                    <p>• 4 opciones por pregunta</p>
                    <p>• 1 respuesta correcta</p>
                    <p>• Las respuestas incorrectas no restan</p>
                    <p>• Nota mínima para aprobar: 70%</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 md:col-span-2">
                  <p className="text-sm text-slate-400">
                    Objetivo de la evaluación
                  </p>

                  <p className="mt-4 text-sm leading-6 text-slate-300">
                    Validar que el alumno comprende los conceptos explicados en
                    la sección antes de avanzar al siguiente bloque del curso.
                  </p>
                </div>
              </div>
            )}

            {quizPage > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-8">
                <p className="text-sm text-slate-400">
                  Pregunta {quizPage} de 3
                </p>

                <h3 className="mt-4 text-2xl font-bold text-white">
                  ¿Cuál es la diferencia entre Merge y Append?
                </h3>

                <div className="mt-8 space-y-3">
                  {[
                    "Merge une columnas a partir de una clave común.",
                    "Append elimina duplicados automáticamente.",
                    "Merge solo sirve para CSV.",
                    "Append crea relaciones entre tablas.",
                  ].map((option) => (
                    <div
                      key={option}
                      className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-slate-300"
                    >
                      {option}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-auto flex items-center justify-between border-t border-slate-800 pt-6">
              <Button
                type="button"
                variant="secondary"
                disabled={quizPage === 0}
                onClick={() => setQuizPage(quizPage - 1)}
              >
                <ChevronLeft size={16} />
                Anterior
              </Button>

              <div className="flex gap-2">
                {quizPages.map((page, index) => (
                  <button
                    key={page}
                    onClick={() => setQuizPage(index)}
                    className={`h-9 rounded-full px-4 text-sm ${
                      quizPage === index
                        ? "bg-amber-400 text-slate-950"
                        : "bg-slate-900 text-slate-400 hover:text-white"
                    }`}
                  >
                    {index === 0 ? "Resumen" : index}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant="secondary"
                disabled={quizPage === quizPages.length - 1}
                onClick={() => setQuizPage(quizPage + 1)}
              >
                Siguiente
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}