// components/course-editor/add-content-menu.tsx
"use client";

import { createLesson } from "@/app/actions/lesson";
import { createSection } from "@/app/actions/section";
import { createSectionQuiz } from "@/app/actions/quiz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, FolderPlus, ListPlus, ClipboardCheck } from "lucide-react";
import { useState } from "react";
import type { Section } from "./types";

type AddMode = "section" | "lesson" | "test" | null;

type Props = {
  courseId: string;
  selectedSection: Section | undefined;
};

export function AddContentMenu({ courseId, selectedSection }: Props) {
  const [addMode, setAddMode] = useState<AddMode>(null);

  return (
    <div className="border-b border-slate-800 p-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="w-full justify-start gap-2 bg-cyan-400 text-slate-950 hover:bg-cyan-300">
            <ListPlus size={16} />
            Añadir
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onClick={() => setAddMode("section")}>
            <FolderPlus size={15} />
            Nueva sección
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!selectedSection}
            onClick={() => setAddMode("lesson")}
          >
            <FileText size={15} />
            Nueva lección
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!selectedSection}
            onClick={() => setAddMode("test")}
          >
            <ClipboardCheck size={15} />
            Nuevo test
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {addMode && (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3">
          {addMode === "section" && (
            <form action={createSection} className="space-y-3">
              <input type="hidden" name="courseId" value={courseId} />

              <Input
                name="title"
                placeholder="Nombre de la sección"
                className="h-10 text-sm"
                autoFocus
              />

              <div className="flex gap-2">
                <Button size="sm">Crear</Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setAddMode(null)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}

          {addMode === "lesson" && (
            <form action={createLesson} className="space-y-3">
              <input type="hidden" name="courseId" value={courseId} />
              <input
                type="hidden"
                name="sectionId"
                value={selectedSection?.id ?? ""}
              />

              <Input
                name="title"
                placeholder={`Lección en ${selectedSection?.title ?? ""}`}
                className="h-10 text-sm"
                autoFocus
              />

              <div className="flex gap-2">
                <Button size="sm">Crear</Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setAddMode(null)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}

          {addMode === "test" && (
            <form action={createSectionQuiz} className="space-y-3">
              <input type="hidden" name="courseId" value={courseId} />
              <input
                type="hidden"
                name="sectionId"
                value={selectedSection?.id ?? ""}
              />

              <p className="text-xs text-slate-500">
                Se creará un test en{" "}
                <span className="text-slate-300">{selectedSection?.title}</span>
              </p>

              <div className="flex gap-2">
                <Button size="sm">Crear test</Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setAddMode(null)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}