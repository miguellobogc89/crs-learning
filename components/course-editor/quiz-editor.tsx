// components/course-editor/quiz-editor.tsx
"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Quiz } from "./types";

type Props = {
  quiz: Quiz;
};

export function QuizEditor({ quiz }: Props) {
  const [quizPage, setQuizPage] = useState(0);

  const quizPages = ["Resumen", "Pregunta 1", "Pregunta 2", "Pregunta 3"];

  return (
    <div className="flex min-h-[460px] flex-col">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-amber-300">Test de sección</p>

          <h2 className="mt-2 text-3xl font-bold text-white">{quiz.title}</h2>

          <p className="mt-2 text-slate-400">
            Configura la evaluación y navega por sus preguntas.
          </p>
        </div>

        <Button variant="secondary">Añadir pregunta</Button>
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
        </div>
      )}

      {quizPage > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8">
          <p className="text-sm text-slate-400">Pregunta {quizPage} de 3</p>

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
  );
}