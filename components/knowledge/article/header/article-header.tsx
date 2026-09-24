
// components/knowledge/article/header/article-header.tsx

"use client";

import { FileText, UsersRound } from "lucide-react";

import { ArticleBreadcrumb } from "./article-breadcrumb";

type LibraryPathItem = {
  id: string;
  name: string;
};

type ArticleHeaderProps = {
  title: string;
  knowledgeType: string;
  visibility: string;
  libraryPath: LibraryPathItem[];
  updatedAt: Date | string;
  updatedBy: {
    name: string | null;
    email: string;
  } | null;
  sharedTeamCount: number;
  onShare?: () => void;
};

const KNOWLEDGE_TYPE_LABELS: Record<string, string> = {
  procedure: "Procedimiento",
  process: "Proceso",
  policy: "Política",
  manual: "Manual",
  guide: "Guía",
  faq: "FAQ",
  technical: "Técnico",
  functional: "Funcional",
  unknown: "Sin clasificar",
};

const VISIBILITY_LABELS: Record<string, string> = {
  private: "Privado",
  shared: "Compartido",
  public: "Público",
};

export function ArticleHeader({
  title,
  knowledgeType,
  visibility,
  libraryPath,
  updatedAt,
  updatedBy,
  sharedTeamCount,
  onShare,
}: ArticleHeaderProps) {
  const knowledgeTypeLabel =
    KNOWLEDGE_TYPE_LABELS[knowledgeType] ??
    "Sin clasificar";

  const visibilityLabel =
    VISIBILITY_LABELS[visibility] ?? "Privado";

  const updatedByLabel =
    updatedBy?.name ??
    updatedBy?.email ??
    "Usuario";

  const updatedDate = new Date(updatedAt);

  const updatedAtLabel = Number.isNaN(
    updatedDate.getTime(),
  )
    ? null
    : new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(updatedDate);

  return (
    <header className="space-y-5">
      <div className="flex min-w-0 items-center justify-between gap-6 border-b border-border pb-3">
        <ArticleBreadcrumb libraryPath={libraryPath} />

        {updatedAtLabel && (
          <p className="hidden shrink-0 text-xs text-muted-foreground lg:block">
            Modificado el {updatedAtLabel} por{" "}
            {updatedByLabel}
          </p>
        )}
      </div>

      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300">
              <FileText className="h-5 w-5" />
            </div>

            <h1 className="min-w-0 truncate text-3xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>

            {sharedTeamCount > 0 && onShare && (
              <button
                type="button"
                onClick={onShare}
                aria-label={`Compartido con ${sharedTeamCount} ${
                  sharedTeamCount === 1
                    ? "equipo"
                    : "equipos"
                }`}
                title={`Compartido con ${sharedTeamCount} ${
                  sharedTeamCount === 1
                    ? "equipo"
                    : "equipos"
                }`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-cyan-600 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-cyan-950/30"
              >
                <UsersRound className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">
            <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {knowledgeTypeLabel}
            </span>

            <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {visibilityLabel}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}