"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, SquareStack } from "lucide-react";

import {
  createWorkspaceAction,
  switchWorkspaceAction,
} from "@/app/actions/workspace.actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { AccessibleWorkspace } from "@/lib/repositories/workspace.repository";

type Props = {
  activeWorkspace: AccessibleWorkspace;
  workspaces: AccessibleWorkspace[];
};

export function WorkspaceSelector({
  activeWorkspace,
  workspaces,
}: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 max-w-[220px] items-center gap-2 rounded-md border border-border bg-background px-2 text-sm text-foreground hover:bg-surface"
          aria-label="Cambiar workspace"
        >
          <SquareStack className="h-4 w-4 text-brand" />
          <span className="min-w-0 truncate font-medium">
            {activeWorkspace.name}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>

        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            disabled={isPending}
            onSelect={(event) => {
              event.preventDefault();

              if (workspace.id === activeWorkspace.id) {
                return;
              }

              startTransition(async () => {
                await switchWorkspaceAction(workspace.id);
                router.refresh();
              });
            }}
            className="justify-between"
          >
            <span className="truncate">{workspace.name}</span>
            {workspace.id === activeWorkspace.id ? (
              <Check className="h-4 w-4 text-brand" />
            ) : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {isCreating ? (
          <form
            action={async (formData) => {
              await createWorkspaceAction(formData);
              setIsCreating(false);
              router.refresh();
            }}
            className="space-y-2 p-1"
          >
            <Input
              name="name"
              autoFocus
              required
              minLength={1}
              maxLength={80}
              placeholder="Nombre"
              className="h-8"
            />
            <button
              type="submit"
              className="flex h-8 w-full items-center justify-center rounded-md bg-brand px-2 text-sm font-medium text-white hover:bg-brand/90"
            >
              Crear workspace
            </button>
          </form>
        ) : (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setIsCreating(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nuevo workspace
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
