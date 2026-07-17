// components/knowledge/import/knowledge-upload-menu.tsx

"use client";

import {
  Archive,
  ChevronDown,
  FileUp,
  FolderUp,
  Upload,
} from "lucide-react";
import { useRef } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { KnowledgeImportMode } from "./knowledge-import.types";

type DirectoryInputProps =
  React.InputHTMLAttributes<HTMLInputElement> & {
    webkitdirectory?: string;
    directory?: string;
  };

type Props = {
  disabled?: boolean;
  onSelect: (
    mode: KnowledgeImportMode,
    files: File[],
  ) => void;
};

export function KnowledgeUploadMenu({
  disabled = false,
  onSelect,
}: Props) {
  const filesInputRef =
    useRef<HTMLInputElement | null>(null);
  const folderInputRef =
    useRef<HTMLInputElement | null>(null);
  const zipInputRef =
    useRef<HTMLInputElement | null>(null);

  function emitFiles(
    mode: KnowledgeImportMode,
    fileList: FileList | null,
  ) {
    const files = Array.from(fileList ?? []);

    if (files.length === 0) {
      return;
    }

    onSelect(mode, files);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-muted px-3.5 text-sm font-medium text-foreground transition hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
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
            onSelect={() =>
              filesInputRef.current?.click()
            }
          >
            <FileUp className="h-4 w-4" />

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
            onSelect={() =>
              folderInputRef.current?.click()
            }
          >
            <FolderUp className="h-4 w-4" />

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
            onSelect={() =>
              zipInputRef.current?.click()
            }
          >
            <Archive className="h-4 w-4" />

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

      <input
        ref={filesInputRef}
        hidden
        multiple
        type="file"
        accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.pptx"
        onChange={(event) => {
          emitFiles("files", event.target.files);
          event.target.value = "";
        }}
      />

      <input
        ref={folderInputRef}
        hidden
        multiple
        type="file"
        accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.pptx"
        {...({
          webkitdirectory: "",
          directory: "",
        } as DirectoryInputProps)}
        onChange={(event) => {
          emitFiles("folder", event.target.files);
          event.target.value = "";
        }}
      />

      <input
        ref={zipInputRef}
        hidden
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        onChange={(event) => {
          emitFiles("zip", event.target.files);
          event.target.value = "";
        }}
      />
    </>
  );
}
