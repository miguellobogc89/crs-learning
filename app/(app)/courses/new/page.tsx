// app/(app)/courses/new/page.tsx
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  GraduationCap,
  Layers,
  Plus,
  Sparkles,
} from "lucide-react";

import { createCourseAction } from "@/app/actions/course";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function NewCoursePage() {
  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="mb-8">
          <Link
            href="/courses"
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a cursos
          </Link>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Crear curso
          </p>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Nuevo curso
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Define la información base. Después podrás construir secciones,
            lecciones y tests desde el editor.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <form
            action={createCourseAction}
            className="rounded-lg border border-border bg-panel p-6"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-lesson-soft text-lesson">
                <BookOpen className="h-4 w-4" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Información del curso
                </h2>

                <p className="text-xs text-muted-foreground">
                  Estos datos aparecerán en el catálogo.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <Field
                icon={FileText}
                label="Nombre"
                description="Usa un título claro y reconocible."
              >
                <Input
                  name="title"
                  placeholder="Ej. Power Query para analistas"
                  required
                  className="h-9 bg-background"
                />
              </Field>

              <Field
                icon={Layers}
                label="Descripción"
                description="Resume qué aprenderá el usuario."
              >
                <Textarea
                  name="description"
                  placeholder="Describe el objetivo del curso..."
                  className="min-h-32 resize-none bg-background"
                />
              </Field>

              <Field
                icon={GraduationCap}
                label="Nivel"
                description="Ayuda a clasificar el curso en el catálogo."
              >
                <select
                  name="level"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
                  defaultValue="beginner"
                >
                  <option value="beginner">Principiante</option>
                  <option value="intermediate">Intermedio</option>
                  <option value="advanced">Avanzado</option>
                </select>
              </Field>
            </div>

            <div className="mt-8 flex items-center justify-end gap-2 border-t border-border pt-5">
              <Button asChild variant="secondary">
                <Link href="/courses">Cancelar</Link>
              </Button>

              <Button
                type="submit"
                className="gap-1.5 bg-brand text-primary-foreground hover:bg-brand-hover"
              >
                <Plus className="h-4 w-4" />
                Crear curso
              </Button>
            </div>
          </form>

          <aside className="space-y-3">
            <div className="rounded-lg border border-border bg-panel p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-test-soft text-test">
                <Sparkles className="h-4 w-4" />
              </div>

              <h3 className="mt-4 text-sm font-semibold text-foreground">
                Próximo paso
              </h3>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Al crear el curso entrarás al editor visual para añadir
                secciones, lecciones y tests.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-panel p-5">
              <h3 className="text-sm font-semibold text-foreground">
                Estructura recomendada
              </h3>

              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li>1. Introducción</li>
                <li>2. Conceptos base</li>
                <li>3. Casos prácticos</li>
                <li>4. Test final</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Field({
  icon: Icon,
  label,
  description,
  children,
}: {
  icon: typeof FileText;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[220px_1fr]">
      <div className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>

        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      {children}
    </div>
  );
}