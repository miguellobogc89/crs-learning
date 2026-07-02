// components/course-editor/quiz-editor.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import type { Quiz } from "./types";

type Props = {
  quiz: Quiz;
};

export function QuizEditor({ quiz }: Props) {
  const [page, setPage] = useState(0);

  const pages = [
    "Resumen",
    "1",
    "2",
    "3",
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">

      <div>

        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Test
        </p>

        <h1 className="mt-2 text-4xl font-bold">
          {quiz.title}
        </h1>

      </div>

      {page === 0 && (

        <div className="grid gap-4 md:grid-cols-4">

          <Card title="Preguntas">
            12
          </Card>

          <Card title="Tipo test">
            8
          </Card>

          <Card title="Desarrollo">
            3
          </Card>

          <Card title="Orales">
            1
          </Card>

        </div>

      )}

      {page > 0 && (

        <div className="rounded-xl border border-border bg-card p-8">

          <p className="text-sm text-muted-foreground">
            Pregunta {page}
          </p>

          <h2 className="mt-4 text-2xl font-bold">
            ¿Cuál es la diferencia entre Merge y Append?
          </h2>

          <div className="mt-8 space-y-3">

            {[
              "Merge une tablas.",
              "Append concatena registros.",
              "Merge crea relaciones.",
              "Append elimina duplicados.",
            ].map((option) => (

              <div
                key={option}
                className="rounded-lg border border-border bg-surface p-4"
              >
                {option}
              </div>

            ))}

          </div>

        </div>

      )}

      <div className="flex items-center justify-between">

        <Button
          variant="secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Anterior
        </Button>

        <div className="flex gap-2">

          {pages.map((label, index) => (

            <button
              key={label}
              onClick={() => setPage(index)}
              className={
                page === index
                  ? "rounded-full bg-brand px-4 py-2 text-sm text-white"
                  : "rounded-full bg-surface px-4 py-2 text-sm"
              }
            >
              {label}
            </button>

          ))}

        </div>

        <Button
          variant="secondary"
          disabled={page === pages.length - 1}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>

      </div>

    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        {title}
      </p>

      <p className="mt-3 text-4xl font-bold">
        {children}
      </p>
    </div>
  );
}