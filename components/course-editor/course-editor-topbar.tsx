// components/course-editor/course-editor-topbar.tsx
"use client";

import Link from "next/link";
import {
  ChevronLeft,
  Eye,
  Save,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  courseTitle: string;
};

export function CourseEditorTopbar({ courseTitle }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-white px-4">
      <Link
        href="/courses"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Cursos
      </Link>

      <span className="text-muted-foreground/50">/</span>

      <span className="truncate text-sm font-medium text-foreground">
        {courseTitle}
      </span>

      <span className="ml-2 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Borrador
      </span>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" />
          Previsualizar
        </Button>

        <Button
          size="sm"
          className="h-8 gap-1.5 bg-brand text-primary-foreground hover:bg-brand-hover"
        >
          <Save className="h-3.5 w-3.5" />
          Guardar
        </Button>
      </div>
    </header>
  );
}