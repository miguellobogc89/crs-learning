// app/(app)/knowledge/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Clock,
  FileText,
  Globe2,
  GraduationCap,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listVisibleKnowledgeSources } from "@/lib/services/knowledge.service";

type KnowledgeSource = Awaited<
  ReturnType<typeof listVisibleKnowledgeSources>
>[number];

function formatRelativeDate(date: Date | string | null) {
  if (!date) return "Sin actualizar";

  const value = new Date(date).getTime();
  const diffMinutes = Math.max(1, Math.floor((Date.now() - value) / 60000));

  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `Hace ${diffDays} días`;

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getStatusLabel(status: string | null) {
  if (status === "processed") return "IA procesada";
  if (status === "processing") return "Procesando";
  if (status === "error") return "Error";

  return "Borrador";
}

function getStatusClassName(status: string | null) {
  if (status === "processed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "processing") {
    return "border-cyan-200 bg-cyan-50 text-cyan-700";
  }

  if (status === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-border bg-surface text-muted-foreground";
}

function getContentSummary(knowledge: KnowledgeSource) {
  const description = knowledge.description?.trim();

  if (description) return description;

  const content = knowledge.content?.trim();

  if (content) return content;

  return "Fuente de conocimiento pendiente de completar.";
}

export default async function KnowledgePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const knowledgeSources = await listVisibleKnowledgeSources(session.user.id);

  const totalPublic = knowledgeSources.filter(
    (knowledge) => knowledge.visibility === "public",
  ).length;

  const totalPrivate = knowledgeSources.length - totalPublic;

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lesson-soft text-lesson">
                <BookOpen className="h-5 w-5" />
              </span>

              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {knowledgeSources.length}
                </p>
                <p className="text-sm text-muted-foreground">
                  Knowledge items
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-muted-foreground">
                <ShieldCheck className="h-5 w-5" />
              </span>

              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {totalPrivate}
                </p>
                <p className="text-sm text-muted-foreground">
                  Privados de empresa
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-muted-foreground">
                <Globe2 className="h-5 w-5" />
              </span>

              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {totalPublic}
                </p>
                <p className="text-sm text-muted-foreground">
                  Conocimiento público
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <input
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              placeholder="Buscar por título, proceso, herramienta o descripción..."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-surface"
              type="button"
            >
              Todos
            </button>

            <button
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
              type="button"
            >
              Recientes
            </button>

            <button
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
              type="button"
            >
              Estado
            </button>
          </div>
        </div>

        {knowledgeSources.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-muted-foreground">
              <BookOpen className="h-5 w-5" />
            </div>

            <h2 className="mt-4 text-sm font-medium text-foreground">
              Todavía no hay knowledge
            </h2>

            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Crea una biblioteca para empezar a cargar documentos y preparar la
              generación de cursos.
            </p>

            <Button asChild className="mt-5">
              <Link href="/knowledge/new">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo knowledge
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {knowledgeSources.map((knowledge) => (
              <Card
                key={knowledge.id}
                className="group border-border bg-card transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-sm"
              >
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lesson-soft text-lesson">
                      <FileText className="h-5 w-5" />
                    </span>

                    <button
                      className="rounded-lg p-1 text-muted-foreground opacity-70 transition hover:bg-surface hover:text-foreground group-hover:opacity-100"
                      type="button"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="min-h-[124px] flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusClassName(
                          knowledge.status,
                        )}`}
                      >
                        {getStatusLabel(knowledge.status)}
                      </span>

                      {knowledge.visibility === "private" ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>

                    <Link href={`/knowledge/${knowledge.id}`}>
                      <h2 className="line-clamp-2 text-base font-semibold leading-6 text-foreground hover:text-lesson">
                        {knowledge.title}
                      </h2>
                    </Link>

                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {getContentSummary(knowledge)}
                    </p>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatRelativeDate(knowledge.updated_at)}
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5" />0 cursos
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button asChild className="h-9 flex-1 px-3 text-xs">
                      <Link href={`/knowledge/${knowledge.id}`}>Abrir</Link>
                    </Button>

                    <Button
                      className="h-9 flex-1 px-3 text-xs"
                      disabled
                      variant="secondary"
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      IA
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}