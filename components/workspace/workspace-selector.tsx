"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus, SquareStack } from "lucide-react";

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
          className="
            group/workspace relative
            flex h-full max-w-[240px] items-center gap-2
            rounded-md border border-border
            bg-background px-3
            text-sm text-foreground
            transition-colors
            hover:bg-surface
            focus:outline-none
            focus-visible:outline-none
            focus-visible:ring-0
            focus-visible:ring-offset-0
            data-[state=open]:outline-none
            data-[state=open]:ring-0
          "
          aria-label="Cambiar workspace"
        >
          <SquareStack className="h-4 w-4 shrink-0 text-brand" />

          <span className="min-w-0 truncate font-medium">
            {activeWorkspace.name}
          </span>

          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />

          <span
            className="
              pointer-events-none absolute left-1/2 top-full z-50 mt-2
              -translate-x-1/2 whitespace-nowrap rounded-md
              bg-foreground px-2.5 py-1.5
              text-xs font-medium text-background
              opacity-0
              transition-opacity duration-150
              group-hover/workspace:opacity-100
            "
          >
            Espacio de trabajo
          </span>
        </button>
      </DropdownMenuTrigger>

<DropdownMenuContent
  align="start"
  sideOffset={8}
  alignOffset={12}
  className="w-80 p-2"
>
<DropdownMenuLabel className="px-3 py-2 text-xs text-muted-foreground">
  Workspaces
</DropdownMenuLabel>

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
            className="min-h-10 justify-between rounded-md px-3 py-1"
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
              className="flex h-8 w-full items-center justify-center rounded-md bg-brand px-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
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
