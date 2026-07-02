// components/course-editor/tree-item-menu.tsx
"use client";

import {
  Copy,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  children: React.ReactNode;
};

export function TreeItemMenu({ children }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="
            flex h-6 w-6 items-center justify-center
            rounded-md
            text-muted-foreground
            opacity-0
            transition-all
            hover:bg-surface
            hover:text-foreground
            group-hover:opacity-100
          "
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-44 rounded-lg border-border bg-popover"
      >
        <DropdownMenuItem disabled className="gap-2">
          <Pencil className="h-3.5 w-3.5" />
          Renombrar
        </DropdownMenuItem>

        <DropdownMenuItem disabled className="gap-2">
          <Copy className="h-3.5 w-3.5" />
          Duplicar
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DeleteMenuItem({
  action,
  children,
}: {
  action: (formData: FormData) => void;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      <DropdownMenuItem asChild>
        <button
          className="
            flex w-full items-center gap-2
            text-red-400
            hover:text-red-300
          "
        >
          <Trash2 className="h-3.5 w-3.5" />
          {children}
        </button>
      </DropdownMenuItem>
    </form>
  );
}