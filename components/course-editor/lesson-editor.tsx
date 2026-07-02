// components/course-editor/lesson-editor.tsx
"use client";

import { useState } from "react";

import { updateLesson } from "@/app/actions/lesson";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { Lesson } from "./types";

type Props = {
  courseId: string;
  lesson: Lesson;
};

export function LessonEditor({ courseId, lesson }: Props) {
  const [title, setTitle] = useState(lesson.title);
  const [content, setContent] = useState(lesson.content ?? "");

  return (
    <form action={updateLesson} className="mx-auto max-w-5xl space-y-8">

      <input type="hidden" name="lessonId" value={lesson.id} />
      <input type="hidden" name="courseId" value={courseId} />

      <div className="space-y-2">

        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Lección
        </p>

        <Input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-12 border-0 bg-transparent px-0 text-4xl font-bold shadow-none focus-visible:ring-0"
        />

      </div>

      <div className="rounded-xl border border-border bg-card p-6">

        <p className="mb-4 text-sm font-medium text-muted-foreground">
          Contenido
        </p>

        <Textarea
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Empieza a escribir..."
          className="
            min-h-[500px]
            resize-none
            border-0
            bg-transparent
            text-base
            leading-7
            shadow-none
            focus-visible:ring-0
          "
        />

      </div>

      <div className="flex justify-end gap-3">

        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setTitle(lesson.title);
            setContent(lesson.content ?? "");
          }}
        >
          Descartar
        </Button>

        <Button>
          Guardar cambios
        </Button>

      </div>

    </form>
  );
}