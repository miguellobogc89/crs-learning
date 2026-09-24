
// components/knowledge/article/header/article-header.tsx

"use client";

import { FileText, UsersRound } from "lucide-react";

import { ArticleActions } from "./article-actions";
import {
  ArticleInsights,
  type ArticleInsightMetrics,
} from "./article-insights";
import { ArticleBreadcrumb } from "./article-breadcrumb";
import { ArticleTitle } from "./article-title";

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
  metrics: ArticleInsightMetrics;
  isEditingTitle: boolean;
  isUpdating: boolean;
  isEditingContent: boolean;
  onTitleChange: (title: string) => void;
  onEditTitle: () => void;
  onSaveTitle: () => void;
  onCancelTitle: () => void;
  onVisibilityChange: (visibility: string) => void;
  onEditContent: () => void;
  onShare: () => void;
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

export function ArticleHeader({
  title,
  knowledgeType,
  visibility,
  libraryPath,
  updatedAt,
  updatedBy,
  sharedTeamCount,
  metrics,
  isEditingTitle,
  isUpdating,
  isEditingContent,
  onTitleChange,
  onEditTitle,
  onSaveTitle,
  onCancelTitle,
  onVisibilityChange,
  onEditContent,
  onShare,
}: ArticleHeaderProps) {
  const knowledgeTypeLabel =
    KNOWLEDGE_TYPE_LABELS[knowledgeType] ??
    "Sin clasificar";

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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400">
              <FileText className="h-5 w-5" />
            </div>

            <ArticleTitle
              title={title}
              isEditing={isEditingTitle}
              isUpdating={isUpdating}
              onTitleChange={onTitleChange}
              onEdit={onEditTitle}
              onSave={onSaveTitle}
              onCancel={onCancelTitle}
            />

            {sharedTeamCount > 0 && (
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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40"
              >
                <UsersRound className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 pl-[52px]">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300">
              {knowledgeTypeLabel}
            </span>

            <select
              aria-label="Visibilidad del artículo"
              value={visibility}
              disabled={isUpdating}
              onChange={(event) =>
                onVisibilityChange(event.target.value)
              }
              className="cursor-pointer rounded-full border border-blue-200/70 bg-blue-50/60 px-2.5 py-1 text-xs font-medium text-blue-600 outline-none transition-colors hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-50 dark:border-blue-800/40 dark:bg-blue-950/25 dark:text-blue-400 dark:hover:bg-blue-950/50"
            >
              <option value="private">Privado</option>
              <option value="shared">Compartido</option>
              <option value="public">Público</option>
            </select>
          </div>
        </div>

        <ArticleActions
          knowledgeType={knowledgeType}
          visibility={visibility}
          isEditingContent={isEditingContent}
          isUpdating={isUpdating}
          onEditContent={onEditContent}
          onShare={onShare}
        />
      </div>

      <ArticleInsights metrics={metrics} />
    </header>
  );
}