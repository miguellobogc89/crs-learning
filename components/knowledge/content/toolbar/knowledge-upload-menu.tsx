// components/knowledge/content/toolbar/knowledge-upload-menu.tsx
"use client";

import {
  Archive,
  ChevronDown,
  FileUp,
  FolderUp,
  Upload,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { UploadType } from "./types";

type Props = {
  onUpload: (type: UploadType) => void;
};

export function KnowledgeUploadMenu({
  onUpload,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-muted px-3.5 text-sm font-medium text-foreground transition hover:bg-muted/80"
        >
          <Upload className="h-4 w-4" />
          Subir

          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-64"
      >
        <DropdownMenuLabel>
          Añadir documentación
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="gap-3 py-2.5"
          onSelect={() => onUpload("files")}
        >
          <FileUp className="h-4 w-4 shrink-0" />

          <div>
            <p className="font-medium">
              Subir archivos
            </p>

            <p className="text-xs text-muted-foreground">
              Selecciona uno o varios documentos
            </p>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="gap-3 py-2.5"
          onSelect={() => onUpload("folder")}
        >
          <FolderUp className="h-4 w-4 shrink-0" />

          <div>
            <p className="font-medium">
              Subir carpeta
            </p>

            <p className="text-xs text-muted-foreground">
              Conserva su estructura interna
            </p>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="gap-3 py-2.5"
          onSelect={() => onUpload("zip")}
        >
          <Archive className="h-4 w-4 shrink-0" />

          <div>
            <p className="font-medium">
              Subir archivo comprimido
            </p>

            <p className="text-xs text-muted-foreground">
              Archivo ZIP con documentos y carpetas
            </p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}