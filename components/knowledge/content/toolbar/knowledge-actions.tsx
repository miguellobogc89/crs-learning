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
          className="inline-flex h-control-lg shrink-0 items-center gap-2 rounded-xl bg-[#0A58FF] px-4 text-body font-semibold text-white transition-colors hover:bg-[#0849D6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A58FF]/40 focus-visible:ring-offset-2"
        >
          <Plus className="size-icon-md" strokeWidth={2.5} />

          Nuevo

          <ChevronDown
            className="ml-1 size-icon-md text-white/80"
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
          <FolderPlus className="size-icon-md shrink-0 text-[#0A58FF]" />

          <span className="text-body font-medium">
            Nueva carpeta
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
          onSelect={() => onUpload("files")}
        >
          <FileUp className="size-icon-md shrink-0 text-muted-foreground" />

          <span className="text-body font-medium">
            Subir archivos
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
          onSelect={() => onUpload("folder")}
        >
          <FolderUp className="size-icon-md shrink-0 text-muted-foreground" />

          <span className="text-body font-medium">
            Subir carpeta
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
          onSelect={() => onUpload("zip")}
        >
          <Archive className="size-icon-md shrink-0 text-muted-foreground" />

          <span className="text-body font-medium">
            Subir archivo comprimido
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
