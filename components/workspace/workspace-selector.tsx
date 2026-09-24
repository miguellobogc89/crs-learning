// components/workspace/workspace-selector.tsx


"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  PanelsTopLeft,
  Plus,
} from "lucide-react";

import {
  createWorkspaceAction,
  switchWorkspaceAction,
} from "@/app/actions/workspace.actions";
import { PlanLimitDialog } from "@/components/billing/plan-limit-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui";
import type { AccessibleWorkspace } from "@/lib/repositories/workspace.repository";
import type { PlanLimitErrorPayload } from "@/lib/services/entitlements.service";

type Props = {
  activeWorkspace: AccessibleWorkspace;
  workspaces: AccessibleWorkspace[];
  variant?: "default" | "sidebar";
};

export function WorkspaceSelector({
  activeWorkspace,
  workspaces,
  variant = "default",
}: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [planLimit, setPlanLimit] =
    useState<PlanLimitErrorPayload | null>(null);

  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isSidebar = variant === "sidebar";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Cambiar espacio de trabajo"
            className={
              isSidebar
                ? "group flex h-10 w-full min-w-0 items-center gap-2.5 rounded-lg border-0 bg-transparent px-2 text-left text-sm text-foreground outline-none transition-colors hover:bg-surface focus-visible:bg-surface"
                : "group flex h-full max-w-[240px] items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors hover:bg-surface"
            }
          >
            <PanelsTopLeft
              className="h-[18px] w-[18px] shrink-0 text-brand"
              strokeWidth={1.9}
            />

            <span className="min-w-0 flex-1 truncate font-medium">
              {activeWorkspace.name}
            </span>

            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
              strokeWidth={1.8}
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-72 p-2"
        >
          <DropdownMenuLabel className="px-3 py-2 text-xs text-muted-foreground">
            Espacios de trabajo
          </DropdownMenuLabel>

          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              disabled={isPending}
              className="min-h-10 justify-between rounded-md px-3 py-1"
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
            >
              <span className="min-w-0 truncate">
                {workspace.name}
              </span>

              {workspace.id === activeWorkspace.id && (
                <Check className="h-4 w-4 shrink-0 text-brand" />
              )}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          {isCreating ? (
            <form
              className="space-y-2 p-1"
              action={async (formData) => {
                const result =
                  await createWorkspaceAction(formData);

                if (result && !result.ok) {
                  setPlanLimit(result.planLimit);
                  return;
                }

                setIsCreating(false);
                router.refresh();
              }}
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

              <Button variant="brand">
                Crear workspace
              </Button>
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

      <PlanLimitDialog
        open={Boolean(planLimit)}
        limit={planLimit}
        onOpenChange={(open) => {
          if (!open) {
            setPlanLimit(null);
          }
        }}
      />
    </>
  );
}