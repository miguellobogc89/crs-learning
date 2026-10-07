// components/knowledge/article/header/article-header.tsx

"use client";

import {
  FileText,
  UsersRound,
} from "lucide-react";

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
  onVisibilityChange: (
    visibility: string,
  ) => void;
  onEditContent: () => void;
  onShare: () => void;
};

const KNOWLEDGE_TYPE_LABELS: Record<
  string,
  string
> = {
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
    KNOWLEDGE_TYPE_LABELS[
      knowledgeType
    ] ?? "Sin clasificar";

  const updatedByLabel =
    updatedBy?.name ??
    updatedBy?.email ??
    "Usuario";

  const updatedDate =
    new Date(updatedAt);

  const updatedAtLabel =
    Number.isNaN(
      updatedDate.getTime(),
    )
      ? null
      : new Intl.DateTimeFormat(
          "es-ES",
          {
            day: "2-digit",
            month: "short",
            year: "numeric",
          },
        ).format(updatedDate);

  const isPublic =
    visibility === "public";

  function handleVisibilityToggle() {
    if (isUpdating) {
      return;
    }

    const nextVisibility =
      isPublic
        ? "private"
        : "public";

    const confirmed =
      window.confirm(
        isPublic
          ? "¿Quieres hacer privado este artículo? Dejará de estar disponible públicamente."
          : "¿Quieres hacer público este artículo? Cualquier usuario con acceso al espacio podrá verlo.",
      );

    if (!confirmed) {
      return;
    }

    onVisibilityChange(
      nextVisibility,
    );
  }

  return (
    <header className="space-y-2.5">
      {/* Breadcrumb y última modificación */}
      <div className="flex min-w-0 items-center justify-between gap-6 border-b border-border pb-2.5">
        <ArticleBreadcrumb
          libraryPath={libraryPath}
        />

        {updatedAtLabel && (
          <p className="hidden shrink-0 text-[11px] text-muted-foreground lg:block">
            Modificado el{" "}
            {updatedAtLabel} por{" "}
            {updatedByLabel}
          </p>
        )}
      </div>

      {/* Título */}
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400">
              <FileText className="h-4 w-4" />
            </div>

            <ArticleTitle
              title={title}
              isEditing={
                isEditingTitle
              }
              isUpdating={isUpdating}
              onTitleChange={
                onTitleChange
              }
              onEdit={onEditTitle}
              onSave={onSaveTitle}
              onCancel={
                onCancelTitle
              }
            />

            {sharedTeamCount > 0 ? (
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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40"
              >
                <UsersRound className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <ArticleActions
          knowledgeType={
            knowledgeType
          }
          visibility={
            visibility
          }
          isEditingContent={
            isEditingContent
          }
          isUpdating={isUpdating}
          onEditContent={
            onEditContent
          }
          onShare={onShare}
        />
      </div>

      {/* Tipo + métricas + visibilidad */}
      <div className="flex min-w-0 items-center justify-between gap-4 pl-[44px]">
        <ArticleInsights
          metrics={metrics}
          knowledgeTypeLabel={
            knowledgeTypeLabel
          }
        />

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] font-medium text-slate-500">
            {isPublic
              ? "Público"
              : "Privado"}
          </span>

          <button
            type="button"
            role="switch"
            aria-checked={isPublic}
            aria-label={
              isPublic
                ? "Cambiar artículo a privado"
                : "Cambiar artículo a público"
            }
            disabled={isUpdating}
            onClick={
              handleVisibilityToggle
            }
            className={[
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5",
              "border-0 transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20",
              "disabled:cursor-wait disabled:opacity-50",
              isPublic
                ? "bg-slate-950"
                : "bg-slate-300",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "block h-4 w-4 rounded-full bg-white shadow-sm",
                "transition-transform duration-200",
                isPublic
                  ? "translate-x-4"
                  : "translate-x-0",
              ].join(" ")}
            />
          </button>
        </div>
      </div>
    </header>
  );
}