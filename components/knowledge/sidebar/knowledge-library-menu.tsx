// components/knowledge/sidebar/knowledge-library-menu.tsx
import Link from "next/link";
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";

type Props = {
  libraryId: string;
  isOpen: boolean;
  onToggle: () => void;
  onCreateChild: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export function KnowledgeLibraryMenu({
  libraryId,
  isOpen,
  onToggle,
  onCreateChild,
  onRename,
  onDelete,
}: Props) {
  return (
    <>
      <button
        data-knowledge-library-menu
        className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover/library:opacity-100"
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-label="Opciones de biblioteca"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen ? (
        <div
          data-knowledge-library-menu
          className="absolute right-2 top-9 z-20 w-44 rounded-lg border border-border bg-background p-1 shadow-sm"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-surface"
            type="button"
            onClick={onCreateChild}
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir carpeta
          </button>

          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-surface"
            type="button"
            onClick={onRename}
          >
            <Pencil className="h-3.5 w-3.5" />
            Renombrar
          </button>

          <Link
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-surface"
            href={`/knowledge/library/${libraryId}`}
          >
            <Settings className="h-3.5 w-3.5" />
            Administrar
          </Link>

          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            type="button"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </button>
        </div>
      ) : null}
    </>
  );
}