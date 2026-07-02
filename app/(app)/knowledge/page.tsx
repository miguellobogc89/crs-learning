// app/(app)/knowledge/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, FileText, Lock, Plus, Sparkles } from "lucide-react";

import { auth } from "@/auth";
import { PageTitle } from "@/components/app/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listVisibleKnowledgeSources } from "@/lib/services/knowledge.service";

export default async function KnowledgePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const knowledgeSources = await listVisibleKnowledgeSources(session.user.id);
  const selectedKnowledge = knowledgeSources[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <PageTitle
            title="Biblioteca"
            subtitle="Gestiona el conocimiento base desde el que se generarán cursos."
          />

          <Button asChild>
            <Link href="/knowledge/new">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo knowledge
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] bg-background">
        <aside className="min-h-0 border-r border-border bg-panel">
          <div className="border-b border-border p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fuentes
            </p>
          </div>

          <div className="min-h-0 space-y-1 overflow-y-auto p-2">
            {knowledgeSources.length === 0 ? (
              <div className="mx-2 mt-8 rounded-lg border border-dashed border-border bg-surface/40 p-5 text-center">
                <BookOpen className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />

                <p className="text-sm font-medium text-foreground">
                  Biblioteca vacía
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Crea tu primera fuente de conocimiento.
                </p>
              </div>
            ) : (
              knowledgeSources.map((knowledge) => {
                const active = selectedKnowledge?.id === knowledge.id;

                return (
                  <Link
                    key={knowledge.id}
                    href={`/knowledge/${knowledge.id}`}
                    className={[
                      "block rounded-md px-3 py-2 transition-colors",
                      active
                        ? "bg-surface text-foreground"
                        : "text-panel-foreground/80 hover:bg-surface-hover hover:text-foreground",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-lesson" />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {knowledge.title}
                        </p>

                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {knowledge.description || "Sin descripción."}
                        </p>

                        <div className="mt-2 flex items-center gap-2">
                          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                            {knowledge.status}
                          </span>

                          {knowledge.visibility === "private" && (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto bg-background">
          {selectedKnowledge ? (
            <div className="mx-auto max-w-4xl px-8 py-8">
              <div className="mb-6 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lesson-soft text-lesson">
                  <FileText className="h-5 w-5" />
                </span>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fuente seleccionada
                  </p>

                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    {selectedKnowledge.title}
                  </h1>
                </div>
              </div>

              <Card className="border-border bg-card">
                <CardContent className="space-y-6 p-6">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Descripción
                    </p>

                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {selectedKnowledge.description || "Sin descripción."}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-surface/40 p-4">
                    <p className="text-sm font-medium text-foreground">
                      Contenido base
                    </p>

                    <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {selectedKnowledge.content || "Todavía no hay contenido."}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link href={`/knowledge/${selectedKnowledge.id}`}>
                        Editar knowledge
                      </Link>
                    </Button>

                    <Button variant="secondary" disabled>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generar curso
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground">
                <BookOpen className="h-5 w-5" />
              </div>

              <h2 className="mt-4 text-sm font-medium text-foreground">
                Ninguna fuente seleccionada
              </h2>

              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Crea una fuente de conocimiento para empezar a alimentar la
                generación de cursos.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}