// components/knowledge/content/knowledge-folder-card.tsx
"use client";

import { useState, useTransition } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  Clock,
  FileStack,
  FileText,
  Folder,
  FolderTree,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteKnowledgeLibrary } from "@/lib/actions/knowledge-library.actions";

type KnowledgeLibrary = {
  id: string;
  parent_id: string | null;
  name: string;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  article_count?: number;
  folder_count?: number;
  file_count?: number;
};

type Props = {
  folder: KnowledgeLibrary;
};

function formatRelativeDate(date: Date | string | null | undefined) {
  if (!date) {
    return "Sin fecha";
  }

  const timestamp = new Date(date).getTime();
  const diffMilliseconds = Date.now() - timestamp;
  const diffMinutes = Math.max(
    1,
    Math.floor(diffMilliseconds / 60000),
  );

  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 30) {
    return `Hace ${diffDays} días`;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getCountLabel(
  count: number,
  singular: string,
  plural: string,
) {
  if (count === 1) {
    return `1 ${singular}`;
  }

  return `${count} ${plural}`;
}

export function KnowledgeFolderCard({ folder }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const articleCount = folder.article_count ?? 0;
  const folderCount = folder.folder_count ?? 0;
  const fileCount = folder.file_count ?? 0;

  function handleOpenFolder() {
    if (isDeleting) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("library", folder.id);
    params.delete("view");

    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleDelete() {
    const confirmed = window.confirm(
      `¿Quieres eliminar la carpeta "${folder.name}"?\n\nSe eliminarán también sus subcarpetas, artículos y archivos asociados. Esta acción no se puede deshacer.`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);

    startDeleteTransition(async () => {
      try {
        await deleteKnowledgeLibrary(folder.id);
        router.refresh();
      } catch (caughtError) {
        if (caughtError instanceof Error) {
          setError(caughtError.message);
          return;
        }

        setError("No se ha podido eliminar la carpeta");
      }
    });
  }

  return (
    <Card
      className="group cursor-pointer border-border bg-card transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-sm"
      onClick={handleOpenFolder}
    >
      <CardContent className="flex h-full min-h-[250px] flex-col p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-muted-foreground">
            <Folder className="h-5 w-5" strokeWidth={2.25} />
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={isDeleting}
                className="rounded-lg p-1 text-muted-foreground opacity-70 transition hover:bg-surface hover:text-foreground group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(event) => event.stopPropagation()}
                aria-label={`Opciones de ${folder.name}`}
              >
                {isDeleting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <MoreHorizontal
                    className="h-5 w-5"
                    strokeWidth={2.25}
                  />
                )}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-48"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                disabled={isDeleting}
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Carpeta
          </p>

          <h2 className="line-clamp-2 text-base font-semibold leading-6 text-foreground">
            {folder.name}
          </h2>

          <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
            Contenedor de artículos y documentación relacionada.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              {getCountLabel(
                articleCount,
                "artículo",
                "artículos",
              )}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              <FileStack className="h-3.5 w-3.5" />
              {getCountLabel(fileCount, "archivo", "archivos")}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              <FolderTree className="h-3.5 w-3.5" />
              {getCountLabel(
                folderCount,
                "subcarpeta",
                "subcarpetas",
              )}
            </span>
          </div>

          {error ? (
            <p className="mt-3 text-xs text-red-600">{error}</p>
          ) : null}
        </div>

        <div className="mt-5 flex items-center gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Actualizada {formatRelativeDate(folder.updated_at)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}