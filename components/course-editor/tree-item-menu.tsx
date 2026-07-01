// components/course-editor/tree-item-menu.tsx
"use client";

import { MoreHorizontal, Trash2, Copy, Pencil } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Props = {
  children: React.ReactNode;
};

export function TreeItemMenu({ children }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(event) => event.stopPropagation()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 opacity-0 transition hover:bg-slate-800 hover:text-white group-hover:opacity-100"
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem disabled>
          <Pencil size={14} />
          Renombrar
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <Copy size={14} />
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
        <button className="flex w-full items-center gap-2 text-red-400">
          <Trash2 size={14} />
          {children}
        </button>
      </DropdownMenuItem>
    </form>
  );
}