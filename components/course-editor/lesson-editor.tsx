// components/course-editor/lesson-editor.tsx
"use client";

import { updateLesson } from "@/app/actions/lesson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import type { Lesson } from "./types";

type Props = {
  courseId: string;
  lesson: Lesson;
};

export function LessonEditor({ courseId, lesson }: Props) {
  const [draftTitle, setDraftTitle] = useState(lesson.title);
  const [draftContent, setDraftContent] = useState(lesson.content ?? "");

  function discardChanges() {
    setDraftTitle(lesson.title);
    setDraftContent(lesson.content ?? "");
  }

  return (
    <form action={updateLesson} className="space-y-6">
      <input type="hidden" name="lessonId" value={lesson.id} />
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
          className="min-h-[320px]"
          placeholder="Escribe aquí el contenido de la lección..."
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit">Guardar</Button>

        <Button type="button" variant="secondary" onClick={discardChanges}>
          Descartar
        </Button>
      </div>
    </form>
  );
}