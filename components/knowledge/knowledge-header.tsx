// components/knowledge/knowledge-header.tsx
import Link from "next/link";
import {
  Building2,
  Check,
  ChevronRight,
  Globe2,
  Lock,
  Pencil,
  UsersRound,
  X,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KNOWLEDGE_TYPE_LABELS } from "@/lib/knowledge/knowledge-types";

type LibraryPathItem = {
  id: string;
  name: string;
};

type UpdatedByUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

type Props = {
  title: string;
  knowledgeType: string;
  visibility: string;
  libraryPath: LibraryPathItem[];
  updatedAt: Date | string;
  updatedBy: UpdatedByUser | null;
  sharedTeamCount: number;
  isEditingTitle: boolean;
  isUpdating: boolean;
  onTitleChange: (value: string) => void;
  onEditTitle: () => void;
  onSaveTitle: () => void;
  onCancelTitle: () => void;
  onVisibilityChange: (visibility: string) => void;
  onShare: () => void;
};

function formatUpdatedAt(value: Date | string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getVisibilityIcon(visibility: string) {
  if (visibility === "public") {
    return Globe2;
  }

  return Lock;
}

function getVisibilityLabel(visibility: string) {
  if (visibility === "public") {
    return "Público en la empresa";
  }

  return "Privado";
}

export function KnowledgeHeader({
  title,
  knowledgeType,
  visibility,
  libraryPath,
  updatedAt,
  updatedBy,
  sharedTeamCount,
  isEditingTitle,
  isUpdating,
  onTitleChange,
  onEditTitle,
  onSaveTitle,
  onCancelTitle,
  onVisibilityChange,
  onShare,
}: Props) {
  const VisibilityIcon = getVisibilityIcon(visibility);

  const updatedByLabel =
    updatedBy?.name?.trim() ||
    updatedBy?.email ||
    "Usuario desconocido";

  const knowledgeTypeLabel =
    KNOWLEDGE_TYPE_LABELS[
      knowledgeType as keyof typeof KNOWLEDGE_TYPE_LABELS
    ] ?? "Desconocido";

  return (
    <header className="mb-2">
      {libraryPath.length > 0 ? (
        <nav
          aria-label="Ruta del artículo"
          className="mb-3 flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          {libraryPath.map((library, index) => {
            const isLast =
              index === libraryPath.length - 1;

            return (
              <div
                key={library.id}
                className="flex min-w-0 items-center gap-1"
              >
                {index > 0 ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                ) : null}

                <Link
                  href={`/knowledge?library=${library.id}`}
                  className={
                    isLast
                      ? "max-w-52 truncate font-medium text-foreground transition hover:text-cyan-700 hover:underline"
                      : "max-w-52 truncate transition hover:text-foreground hover:underline"
                  }
                >
                  {library.name}
                </Link>
              </div>
            );
          })}
        </nav>
      ) : null}

      <div className="flex items-start gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-cyan-600 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-cyan-950/30"
              aria-label="Cambiar visibilidad"
              title={getVisibilityLabel(visibility)}
            >
              <VisibilityIcon className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            className="w-64"
          >
            <DropdownMenuLabel>
              Visibilidad del artículo
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() =>
                onVisibilityChange("private")
              }
              className="gap-3 px-2 py-2.5"
            >
              <Lock className="h-4 w-4" />

              <div>
                <p className="font-medium">
                  Privado
                </p>

                <p className="text-xs text-muted-foreground">
                  Solo usuarios autorizados
                </p>
              </div>
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={() =>
                onVisibilityChange("public")
              }
              className="gap-3 px-2 py-2.5"
            >
              <Building2 className="h-4 w-4" />

              <div>
                <p className="font-medium">
                  Público en la empresa
                </p>

                <p className="text-xs text-muted-foreground">
                  Visible para todos los empleados
                </p>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              {isEditingTitle ? (
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="text"
                    value={title}
                    autoFocus
                    disabled={isUpdating}
                    onChange={(event) =>
                      onTitleChange(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onSaveTitle();
                      }

                      if (event.key === "Escape") {
                        event.preventDefault();
                        onCancelTitle();
                      }
                    }}
                    className="min-w-0 flex-1 border-0 border-b border-cyan-500 bg-transparent px-0 py-0.5 text-[2rem] font-bold leading-none tracking-tight outline-none"
                  />

                  <button
                    type="button"
                    onClick={onSaveTitle}
                    disabled={
                      isUpdating || !title.trim()
                    }
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-40"
                    aria-label="Guardar título"
                  >
                    <Check className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={onCancelTitle}
                    disabled={isUpdating}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface disabled:opacity-40"
                    aria-label="Cancelar edición"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onEditTitle}
                  className="group/title flex min-w-0 items-center gap-2 text-left"
                >
                  <h1 className="truncate text-[2rem] font-bold leading-none tracking-tight">
                    {title}
                  </h1>

                  <Pencil className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100" />
                </button>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex h-7 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
                  {knowledgeTypeLabel}
                </span>

                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
                  <VisibilityIcon className="h-3.5 w-3.5" />

                  {getVisibilityLabel(visibility)}
                </span>

                <button
                  type="button"
                  onClick={onShare}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 text-xs font-medium text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300"
                >
                  <UsersRound className="h-3.5 w-3.5" />

                  {sharedTeamCount === 0
                    ? "Compartir carpeta"
                    : sharedTeamCount === 1
                      ? "Compartido con 1 equipo"
                      : `Compartido con ${sharedTeamCount} equipos`}
                </button>
              </div>
            </div>

            <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
              <p>
                Modificado el{" "}
                {formatUpdatedAt(updatedAt)}
              </p>

              <p className="mt-0.5">
                por {updatedByLabel}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}