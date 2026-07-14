// components/knowledge/content/knowledge-folder-card.tsx
"use client";

import Image from "next/image";
import {
  useState,
  useTransition,
  type DragEventHandler,
} from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Clock,
  Copy,
  Download,
  Edit3,
  FolderInput,
  Link2,
  Loader2,
  MoreHorizontal,
  Share2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { renameKnowledgeLibrary } from "@/lib/actions/knowledge-library.actions";

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
  draggable?: boolean;
  isDropTarget?: boolean;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  onDragEnd?: DragEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
};

function formatRelativeDate(
  date: Date | string | null | undefined,
) {
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

export function KnowledgeFolderCard({
  folder,
  draggable = false,
  isDropTarget = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] =
    useTransition();

  const articleCount = folder.article_count ?? 0;
  const folderCount = folder.folder_count ?? 0;
  const fileCount = folder.file_count ?? 0;

  const [isRenaming, setIsRenaming] = useState(false);
const [renameValue, setRenameValue] = useState(folder.name);
const [isRenamingPending, startRenameTransition] =
  useTransition();

  function openRename() {
  setRenameValue(folder.name);
  setIsRenaming(true);
}

function cancelRename() {
  setRenameValue(folder.name);
  setIsRenaming(false);
}

function saveRename() {
  const normalizedName = renameValue.trim();

  if (
    !normalizedName ||
    normalizedName === folder.name ||
    isRenamingPending
  ) {
    return;
  }

  startRenameTransition(async () => {
    try {
      await renameKnowledgeLibrary(
        folder.id,
        normalizedName,
      );

      setIsRenaming(false);
      router.refresh();
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setError(caughtError.message);
        return;
      }

      setError("No se ha podido renombrar la carpeta");
    }
  });
}

  function handleOpenFolder() {
    if (isDeleting) {
      return;
    }

    const params = new URLSearchParams(
      searchParams.toString(),
    );

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

const cardClassName = [
  "group relative h-[300px] self-start cursor-pointer overflow-hidden border-border bg-card transition",
  "hover:border-cyan-200 hover:shadow-md",
  isDropTarget
    ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
    : "",
]
  .filter(Boolean)
  .join(" ");

  return (
    <Card
      draggable={draggable}
      className={cardClassName}
      onClick={handleOpenFolder}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <CardContent className="flex h-full flex-col p-0">
        <div className="relative flex h-[190px] shrink-0 items-center justify-center bg-card px-6">


          <div
            className="absolute right-4 top-4 z-10 opacity-0 transition group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button
      type="button"
      disabled={isDeleting}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={`Opciones de ${folder.name}`}
    >
      {isDeleting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MoreHorizontal className="h-5 w-5" />
      )}
    </button>
  </DropdownMenuTrigger>

  <DropdownMenuContent
  align="start"
  side="bottom"
  sideOffset={6}
  className="w-64"
>
<DropdownMenuLabel className="px-3 py-2.5">
  <p className="truncate text-sm font-semibold text-foreground">
    {folder.name}
  </p>
</DropdownMenuLabel>

<DropdownMenuSeparator />

<DropdownMenuItem onClick={handleOpenFolder}>
  <FolderInput className="mr-2 h-4 w-4" />
  Abrir
</DropdownMenuItem>

<DropdownMenuSeparator />

<DropdownMenuItem onClick={openRename}>
  <Edit3 className="mr-2 h-4 w-4" />
  Renombrar
</DropdownMenuItem>

<DropdownMenuItem disabled>
  <FolderInput className="mr-2 h-4 w-4" />
  Mover
</DropdownMenuItem>

<DropdownMenuItem disabled>
  <Copy className="mr-2 h-4 w-4" />
  Copiar
</DropdownMenuItem>

<DropdownMenuSeparator />

<DropdownMenuItem disabled>
  <Link2 className="mr-2 h-4 w-4" />
  Copiar enlace
</DropdownMenuItem>

<DropdownMenuItem disabled>
  <Share2 className="mr-2 h-4 w-4" />
  Compartir
</DropdownMenuItem>

<DropdownMenuItem disabled>
  <ShieldCheck className="mr-2 h-4 w-4" />
  Administrar permisos
</DropdownMenuItem>

<DropdownMenuSeparator />

<DropdownMenuItem disabled>
  <Download className="mr-2 h-4 w-4" />
  Descargar
</DropdownMenuItem>

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

<Image
  src="/icons/files/folder.png"
  alt=""
  width={120}
  height={120}
  className="h-[120px] w-[120px] object-contain transition-transform duration-200 group-hover:scale-[1.03]"
/>
        </div>

<div className="shrink-0 border-t border-border bg-card px-4 py-3.5">
{isRenaming ? (
  <div
    onClick={(event) => event.stopPropagation()}
    className="flex items-center gap-2"
  >
    <input
      autoFocus
      value={renameValue}
      onChange={(event) =>
        setRenameValue(event.target.value)
      }
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          saveRename();
        }

        if (event.key === "Escape") {
          cancelRename();
        }
      }}
      disabled={isRenamingPending}
      className="h-9 min-w-0 flex-1 rounded-md border border-primary bg-background px-3 text-sm font-semibold text-foreground outline-none ring-2 ring-primary/20"
    />

    <button
      type="button"
      onClick={saveRename}
      disabled={isRenamingPending}
      className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
    >
      {isRenamingPending ? "Guardando..." : "Guardar"}
    </button>
  </div>
) : (
  <h2 className="truncate text-sm font-semibold text-foreground">
    {folder.name}
  </h2>
)}

  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
    <span>
      {getCountLabel(articleCount, "artículo", "artículos")}
      {folderCount > 0
        ? ` · ${getCountLabel(
            folderCount,
            "subcarpeta",
            "subcarpetas",
          )}`
        : ""}
    </span>

    <span className="flex shrink-0 items-center gap-1">
      <Clock className="h-3.5 w-3.5" />
      {formatRelativeDate(folder.updated_at)}
    </span>
  </div>

  {error ? (
    <p className="mt-2 text-xs text-red-600">
      {error}
    </p>
  ) : null}
</div>
      </CardContent>
    </Card>
  );
}