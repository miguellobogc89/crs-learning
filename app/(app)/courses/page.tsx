// app/(app)/courses/page.tsx
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  FileText,
  FlaskConical,
  GraduationCap,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { listCourses } from "@/lib/services/course.service";
import { cn } from "@/lib/utils";

export default async function CoursesPage() {
  const courses = await listCourses();

  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <Header />

        <Featured />

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Mis cursos
              </h2>
              <p className="text-xs text-muted-foreground">
                Cursos privados disponibles en tu workspace.
              </p>
            </div>

            <Button
              asChild
              size="sm"
              className="h-8 gap-1.5 bg-brand text-primary-foreground hover:bg-brand-hover"
            >
              <Link href="/courses/new">
                <Plus className="h-3.5 w-3.5" />
                Nuevo curso
              </Link>
            </Button>
          </div>

          {courses.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="group rounded-lg border border-border bg-panel p-4 transition-all hover:border-lesson/40 hover:bg-surface/40"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-lesson-soft text-lesson">
                      <BookOpen className="h-4 w-4" />
                    </span>

                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>

                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {course.level}
                  </p>

                  <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">
                    {course.title}
                  </h3>

                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {course.description}
                  </p>

                  <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Privado</span>
                    <span>Borrador</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Header() {
  return (
    <div className="mb-8">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Catálogo
      </p>

      <div className="mt-1 flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Cursos
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Explora conocimiento público y formaciones privadas de tu empresa.
          </p>
        </div>

        <div className="hidden w-72 items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-muted-foreground md:flex">
          <Search className="h-4 w-4" />
          <span className="text-sm">Buscar cursos...</span>
        </div>
      </div>
    </div>
  );
}

function Featured() {
  const items = [
    {
      title: "Power Query para analistas",
      desc: "Transforma, limpia y automatiza datos con enfoque práctico.",
      icon: FileText,
      tone: "lesson" as const,
      scope: "Privado",
    },
    {
      title: "Fundamentos de IA generativa",
      desc: "Comprende modelos, prompts y casos de uso reales.",
      icon: Sparkles,
      tone: "test" as const,
      scope: "Público",
    },
    {
      title: "Onboarding interno",
      desc: "Procesos, cultura y conocimiento clave de la organización.",
      icon: Building2,
      tone: "section" as const,
      scope: "Privado",
    },
  ];

  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Destacados
          </h2>
          <p className="text-xs text-muted-foreground">
            Recomendaciones para empezar rápido.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.title}
            className="group cursor-pointer rounded-lg border border-border bg-panel p-4 transition-all hover:border-lesson/40 hover:bg-surface/40"
          >
            <div className="mb-3 flex items-center justify-between">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md",
                  item.tone === "lesson" && "bg-lesson-soft text-lesson",
                  item.tone === "test" && "bg-test-soft text-test",
                  item.tone === "section" && "bg-surface text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
              </span>

              <ScopeChip label={item.scope} />
            </div>

            <h3 className="text-sm font-semibold text-foreground">
              {item.title}
            </h3>

            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-panel p-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-lesson-soft text-lesson">
        <GraduationCap className="h-5 w-5" />
      </div>

      <h3 className="mt-4 text-sm font-semibold text-foreground">
        Todavía no hay cursos
      </h3>

      <p className="mt-1 text-xs text-muted-foreground">
        Crea el primer curso del workspace.
      </p>

      <Button
        asChild
        size="sm"
        className="mt-4 h-8 gap-1.5 bg-brand text-primary-foreground hover:bg-brand-hover"
      >
        <Link href="/courses/new">
          <Plus className="h-3.5 w-3.5" />
          Nuevo curso
        </Link>
      </Button>
    </div>
  );
}

function ScopeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-5 items-center rounded-sm bg-surface px-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
  );
}