// components/knowledge/detail/header/knowledge-detail-header.tsx

"use client";

import Link from "next/link";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Settings,
  Share2,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import type {
  KnowledgeUpdatedByUser,
  LibraryPathItem,
} from "../knowledge-detail.types";
import {
  KnowledgeHeaderInsights,
  type KnowledgeInsightMetrics,
} from "./knowledge-header-insights";

type Props = {
  title: string;
  knowledgeType: string;
  visibility: string;
  libraryPath: LibraryPathItem[];
  updatedAt: Date | string;
  updatedBy: KnowledgeUpdatedByUser | null;
  sharedTeamCount: number;
  isEditingTitle: boolean;
  isUpdating: boolean;
  metrics: KnowledgeInsightMetrics;
  onTitleChange: (value: string) => void;
  onEditTitle: () => void;
  onSaveTitle: () => void;
  onCancelTitle: () => void;
  onVisibilityChange: (
    visibility: string,
  ) => void;
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

const VISIBILITY_LABELS: Record<
  string,
  string
> = {
  private: "Privado",
  shared: "Compartido",
  public: "Público",
};

export function KnowledgeDetailHeader({
  title,
  knowledgeType,
  visibility,
  libraryPath,
  updatedAt,
  updatedBy,
  sharedTeamCount,
  isEditingTitle,
  isUpdating,
  metrics,
  onTitleChange,
  onEditTitle,
  onSaveTitle,
  onCancelTitle,
  onVisibilityChange,
  onShare,
}: Props) {
  const knowledgeTypeLabel =
    KNOWLEDGE_TYPE_LABELS[knowledgeType] ??
    "Sin clasificar";

  const visibilityLabel =
    VISIBILITY_LABELS[visibility] ??
    "Privado";

  const updatedByLabel =
    updatedBy?.name ??
    updatedBy?.email ??
    "Usuario";

  const updatedAtLabel = new Intl.DateTimeFormat(
    "es-ES",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(new Date(updatedAt));

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 items-center justify-between gap-6 border-b border-border pb-3">

<nav className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
  <Link
    href="/knowledge"
    className="shrink-0 hover:text-foreground"
  >
    Mi biblioteca
  </Link>

  {libraryPath
    .filter(
      (item, index) =>
        !(
          index === 0 &&
          item.name.trim().toLowerCase() ===
            "mi biblioteca"
        ),
    )
    .map((item) => (
      <div
        key={item.id}
        className="flex min-w-0 items-center gap-2"
      >
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />


<Link
  href={`/knowledge?library=${item.id}`}
  className="truncate hover:text-foreground"
>
  {item.name}
</Link>
      </div>
    ))}
</nav>

        <p className="hidden shrink-0 text-xs text-muted-foreground lg:block">
          Modificado el {updatedAtLabel} por{" "}
          {updatedByLabel}
        </p>
      </div>

      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300">
              <FileText className="h-5 w-5" />
            </div>

            {isEditingTitle ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  value={title}
                  disabled={isUpdating}
                  onChange={(event) =>
                    onTitleChange(
                      event.target.value,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onSaveTitle();
                    }

                    if (event.key === "Escape") {
                      onCancelTitle();
                    }
                  }}
                  autoFocus
                  className="h-11 max-w-2xl text-2xl font-semibold"
                />

                <Button
                  type="button"
                  size="icon"
                  disabled={isUpdating}
                  onClick={onSaveTitle}
                >
                  <Check className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={isUpdating}
                  onClick={onCancelTitle}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onEditTitle}
                  className="min-w-0 truncate text-left text-3xl font-semibold tracking-tight text-foreground hover:text-foreground/75"
                >
                  {title}
                </button>

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
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-cyan-600 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-cyan-950/30"
                  >
                    <UsersRound className="h-5 w-5" />
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>

        <DropdownMenu>
<DropdownMenuTrigger asChild>
  <button
    type="button"
    aria-label="Abrir ajustes del artículo"
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none data-[state=open]:bg-muted data-[state=open]:text-foreground"
  >
    <Settings className="h-5 w-5" />
  </button>
</DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-56"
          >
            <DropdownMenuLabel className="space-y-1 font-normal">
              <p className="text-xs text-muted-foreground">
                Tipo
              </p>

              <p className="text-sm font-medium text-foreground">
                {knowledgeTypeLabel}
              </p>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="space-y-1 font-normal">
              <p className="text-xs text-muted-foreground">
                Visibilidad
              </p>

              <p className="text-sm font-medium text-foreground">
                {visibilityLabel}
              </p>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={onShare}>
              <Share2 className="mr-2 h-4 w-4" />
              Compartir
            </DropdownMenuItem>

            <DropdownMenuItem disabled>
              <Download className="mr-2 h-4 w-4" />
              Descargar
            </DropdownMenuItem>

            <DropdownMenuItem disabled>
              <Copy className="mr-2 h-4 w-4" />
              Copiar enlace
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              disabled
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <KnowledgeHeaderInsights metrics={metrics} />
    </div>
  );
}