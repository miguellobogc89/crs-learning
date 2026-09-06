"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Plus,
  Search,
  SquareStack,
} from "lucide-react";

import {
  createWorkspaceAction,
  switchWorkspaceAction,
} from "@/app/actions/workspace.actions";
import { PlanLimitDialog } from "@/components/billing/plan-limit-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  AccessibleWorkspace,
} from "@/lib/repositories/workspace.repository";
import type { PlanLimitErrorPayload } from "@/lib/services/entitlements.service";

type Props = {
  activeWorkspaceId: string;
  userId: string;
  workspaces: AccessibleWorkspace[];
};

export function DashboardWorkspaceSidebar({
  activeWorkspaceId,
  userId,
  workspaces,
}: Props) {
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [planLimit, setPlanLimit] =
    useState<PlanLimitErrorPayload | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const normalizedQuery = query.trim().toLowerCase();

  const ownWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          workspace.owner_user_id === userId &&
          workspace.name
            .toLowerCase()
            .includes(normalizedQuery),
      ),
    [normalizedQuery, userId, workspaces],
  );

  const sharedWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          workspace.owner_user_id !== userId &&
          workspace.name
            .toLowerCase()
            .includes(normalizedQuery),
      ),
    [normalizedQuery, userId, workspaces],
  );

  function enterWorkspace(workspaceId: string) {
    startTransition(async () => {
      await switchWorkspaceAction(workspaceId);
      router.push("/knowledge");
      router.refresh();
    });
  }

  return (
    <>
    <div className="flex min-h-full flex-col bg-panel">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Espacios de trabajo
          </h2>

          <button
            type="button"
            aria-label="Nuevo workspace"
            title="Nuevo workspace"
            onClick={() => setIsCreating((value) => !value)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {isCreating ? (
          <form
            action={async (formData) => {
              const result =
                await createWorkspaceAction(formData);
              if (result && !result.ok) {
                setPlanLimit(result.planLimit);
                return;
              }
              setIsCreating(false);
              router.push("/knowledge");
              router.refresh();
            }}
            className="mt-3 space-y-2"
          >
            <Input
              name="name"
              autoFocus
              required
              minLength={1}
              maxLength={80}
              placeholder="Nombre del workspace"
              className="h-8 bg-background"
            />

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="brand"
                size="sm"
                disabled={isPending}
                className="h-8"
              >
                Crear
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCreating(false)}
                className="h-8"
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-muted-foreground">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar workspace..."
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <WorkspaceGroup
          activeWorkspaceId={activeWorkspaceId}
          isPending={isPending}
          label="Tus espacios"
          onSelect={enterWorkspace}
          workspaces={ownWorkspaces}
        />

        <WorkspaceGroup
          activeWorkspaceId={activeWorkspaceId}
          className="mt-6"
          isPending={isPending}
          label="Compartidos contigo"
          onSelect={enterWorkspace}
          workspaces={sharedWorkspaces}
        />

        {ownWorkspaces.length === 0 &&
        sharedWorkspaces.length === 0 ? (
          <p className="px-2 py-6 text-sm leading-6 text-muted-foreground">
            No hay workspaces que coincidan con la busqueda.
          </p>
        ) : null}
      </div>
    </div>
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

function WorkspaceGroup({
  activeWorkspaceId,
  className,
  isPending,
  label,
  onSelect,
  workspaces,
}: {
  activeWorkspaceId: string;
  className?: string;
  isPending: boolean;
  label: string;
  onSelect: (workspaceId: string) => void;
  workspaces: AccessibleWorkspace[];
}) {
  if (workspaces.length === 0) {
    return null;
  }

  return (
    <section className={className}>
      <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>

      <div className="space-y-1">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            disabled={isPending}
            onClick={() => onSelect(workspace.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
              "hover:bg-surface hover:text-foreground disabled:opacity-60",
              workspace.id === activeWorkspaceId
                ? "bg-surface text-foreground"
                : "text-muted-foreground",
            )}
          >
            <SquareStack className="h-4 w-4 shrink-0 text-brand" />

            <span className="min-w-0 flex-1 truncate">
              {workspace.name}
            </span>

            {workspace.id === activeWorkspaceId ? (
              <Check className="h-4 w-4 shrink-0 text-brand" />
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
