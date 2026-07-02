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
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  FlaskConical,
  Folder,
  Plus,
} from "lucide-react";
import { useState } from "react";

import type { Section } from "./types";

type AddMode = "section" | "lesson" | "test" | null;

type Props = {
  courseId: string;
  selectedSection: Section | undefined;
};

export function AddContentMenu({ courseId, selectedSection }: Props) {
  const [addMode, setAddMode] = useState<AddMode>(null);

  const canAddChild = Boolean(selectedSection);

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="h-7 gap-1 rounded-md bg-lesson px-2 text-xs font-medium text-primary-foreground hover:bg-lesson/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Crear nuevo
          </DropdownMenuLabel>

          <DropdownMenuItem
            onSelect={() => setAddMode("section")}
            className="gap-2"
          >
            <Folder className="h-4 w-4 text-section" />
            <span>Nueva sección</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!canAddChild}
            onSelect={() => setAddMode("lesson")}
            className="gap-2"
          >
            <FileText className="h-4 w-4 text-lesson" />

            <div className="flex flex-1 flex-col">
              <span>Nueva lección</span>

              {!canAddChild && (
                <span className="text-[10px] text-muted-foreground">
                  Selecciona una sección
                </span>
              )}
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!canAddChild}
            onSelect={() => setAddMode("test")}
            className="gap-2"
          >
            <FlaskConical className="h-4 w-4 text-test" />

            <div className="flex flex-1 flex-col">
              <span>Nuevo test</span>

              {!canAddChild && (
                <span className="text-[10px] text-muted-foreground">
                  Selecciona una sección
                </span>
              )}
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {addMode && (
        <div className="absolute right-0 top-9 z-40 w-72 rounded-lg border border-border bg-popover p-3 shadow-lg">
          {addMode === "section" && (
            <form action={createSection} className="space-y-3">
              <input type="hidden" name="courseId" value={courseId} />

              <Input
                name="title"
                placeholder="Nombre de la sección"
                className="h-8 text-xs"
                autoFocus
              />

              <FormActions onCancel={() => setAddMode(null)} />
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
                className="h-8 text-xs"
                autoFocus
              />

              <FormActions onCancel={() => setAddMode(null)} />
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

              <p className="text-xs text-muted-foreground">
                Se creará un test en{" "}
                <span className="text-foreground">{selectedSection?.title}</span>
              </p>

              <FormActions
                submitLabel="Crear test"
                onCancel={() => setAddMode(null)}
              />
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function FormActions({
  submitLabel = "Crear",
  onCancel,
}: {
  submitLabel?: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button size="sm" className="h-7 bg-lesson text-xs text-primary-foreground hover:bg-lesson/90">
        {submitLabel}
      </Button>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 text-xs"
        onClick={onCancel}
      >
        Cancelar
      </Button>
    </div>
  );
}