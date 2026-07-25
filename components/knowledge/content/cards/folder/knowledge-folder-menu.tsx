// components/knowledge/content/cards/folder/knowledge-folder-menu.tsx
"use client";

import {
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

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { KnowledgeLibrary } from "./types";

type Props = {
  folder: KnowledgeLibrary;
  isDeleting: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export function KnowledgeFolderMenu({
  folder,
  isDeleting,
  onOpen,
  onRename,
  onDelete,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isDeleting}
          aria-label={`Opciones de ${folder.name}`}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-background/95 text-muted-foreground shadow-sm transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4.5 w-4.5" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
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

        <DropdownMenuItem onClick={onOpen}>
          <FolderInput className="mr-2 h-4 w-4" />
          Abrir
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onRename}>
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
          onClick={onDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}