// components/knowledge/content/toolbar/knowledge-actions.tsx

"use client";

import {
  Archive,
  ChevronDown,
  FileUp,
  FolderPlus,
  FolderUp,
  Plus,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { UploadType } from "./types";

type Props = {
  onCreateFolder: () => void;
  onUpload: (type: UploadType) => void;
};

export function KnowledgeActions({
  onCreateFolder,
  onUpload,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#0A58FF] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0849D6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A58FF]/40 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />

          Nuevo

          <ChevronDown
            className="ml-1 h-4 w-4 text-white/80"
            strokeWidth={2}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-xl p-1.5"
      >
        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
          onSelect={onCreateFolder}
        >
          <FolderPlus className="h-4 w-4 shrink-0 text-[#0A58FF]" />

          <span className="text-sm font-medium">
            Nueva carpeta
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
          onSelect={() => onUpload("files")}
        >
          <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" />

          <span className="text-sm font-medium">
            Subir archivos
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
          onSelect={() => onUpload("folder")}
        >
          <FolderUp className="h-4 w-4 shrink-0 text-muted-foreground" />

          <span className="text-sm font-medium">
            Subir carpeta
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
          onSelect={() => onUpload("zip")}
        >
          <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />

          <span className="text-sm font-medium">
            Subir archivo comprimido
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}