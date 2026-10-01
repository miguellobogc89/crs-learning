// components/dashboard/dashboard-workspace-sidebar.tsx

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Plus,
  Search,
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
      <div className="flex min-h-full flex-col bg-white/70">
        {/* Cabecera */}
        <div className="border-b border-slate-200/60 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-semibold text-slate-900">
              Espacios de trabajo
            </h2>

            <button
              type="button"
              aria-label="Nuevo workspace"
              title="Nuevo workspace"
              onClick={() =>
                setIsCreating((value) => !value)
              }
              className="
                flex h-7 w-7 shrink-0
                items-center justify-center
                rounded-lg
                text-slate-400
                transition
                hover:bg-slate-100
                hover:text-slate-700
              "
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
                className="
                  h-9 rounded-xl
                  border-slate-200
                  bg-white
                  text-[12px]
                  shadow-none
                "
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

        {/* Buscador */}
        <div className="border-b border-slate-200/60 px-4 py-4">
          <div
            className="
              flex h-9 items-center gap-2
              rounded-xl border border-slate-200
              bg-white px-3
              text-slate-400
              transition
              focus-within:border-slate-300
            "
          >
            <Search className="h-3.5 w-3.5 shrink-0" />

            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Buscar workspace..."
              className="
                min-w-0 flex-1
                bg-transparent
                text-[12px] text-slate-700
                outline-none
                placeholder:text-slate-400
              "
            />
          </div>
        </div>

        {/* Workspaces */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
            <p className="px-2 py-6 text-[12px] leading-5 text-slate-400">
              No hay workspaces que coincidan con la búsqueda.
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
      <p
        className="
          mb-2 px-2
          text-[10px] font-semibold
          uppercase tracking-[0.08em]
          text-slate-400
        "
      >
        {label}
      </p>

      <div className="space-y-1">
        {workspaces.map((workspace) => {
          const active =
            workspace.id === activeWorkspaceId;

          return (
            <button
              key={workspace.id}
              type="button"
              disabled={isPending}
              onClick={() =>
                onSelect(workspace.id)
              }
              className={cn(
                `
                  flex w-full items-center
                  rounded-xl
                  px-3 py-2.5
                  text-left text-[13px]
                  transition-colors
                  disabled:opacity-60
                `,
                active
                  ? "bg-[#EDF3FF] font-medium text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {workspace.name}
              </span>

              {active ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-[#0A58FF]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}