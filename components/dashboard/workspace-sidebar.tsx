"use client";

import { useRouter } from "next/navigation";
import { FolderPlus, Search, SquareStack } from "lucide-react";
import { useState, useTransition } from "react";

import {
  createWorkspaceAction,
  switchWorkspaceAction,
} from "@/app/actions/workspace.actions";
import { AppSectionSidebar } from "@/components/app/section-sidebar";
import { Input } from "@/components/ui/input";
import type { AccessibleWorkspace } from "@/lib/repositories/workspace.repository";

export function DashboardWorkspaceSidebar({
  workspaces,
  currentUserId,
}: {
  workspaces: AccessibleWorkspace[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filtered = workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(search.toLowerCase()),
  );

  const owned = filtered.filter(
    (workspace) => workspace.owner_user_id === currentUserId,
  );
  const shared = filtered.filter(
    (workspace) => workspace.owner_user_id !== currentUserId,
  );

  return (
    <AppSectionSidebar>
      <div className="flex min-h-full flex-col bg-panel">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <SquareStack className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold text-foreground">
              Espacios de trabajo
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsCreating(true)}
            aria-label="Nuevo workspace"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-brand/30 hover:text-brand"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar workspace..."
              className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        {isCreating ? (
          <div className="border-b border-border p-4">
            <form
              action={async (formData) => {
                await createWorkspaceAction(formData);
                setIsCreating(false);
                router.refresh();
              }}
              className="space-y-2"
            >
              <Input
                name="name"
                autoFocus
                required
                placeholder="Nombre del workspace"
                className="h-9"
              />
              <button
                type="submit"
                disabled={isPending}
                className="flex h-9 w-full items-center justify-center rounded-md bg-brand px-3 text-sm font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Crear workspacess
              </button>
            </form>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <WorkspaceGroup
            title="Tus espacios"
            items={owned}
            currentUserId={currentUserId}
            onSelect={(workspaceId) => {
              startTransition(async () => {
                await switchWorkspaceAction(workspaceId);
                router.push("/knowledge");
              });
            }}
          />

          {shared.length > 0 ? (
            <div className="mt-6">
              <WorkspaceGroup
                title="Compartidos contigo"
                items={shared}
                currentUserId={currentUserId}
                onSelect={(workspaceId) => {
                  startTransition(async () => {
                    await switchWorkspaceAction(workspaceId);
                    router.push("/knowledge");
                  });
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </AppSectionSidebar>
  );
}

function WorkspaceGroup({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: AccessibleWorkspace[];
  currentUserId: string;
  onSelect: (workspaceId: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </p>

      <div className="space-y-1">
        {items.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            onClick={() => onSelect(workspace.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition hover:border-border hover:bg-surface/60"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-xs font-semibold text-foreground">
              {workspace.name.charAt(0).toUpperCase()}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {workspace.name}
              </span>
              {workspace.description ? (
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {workspace.description}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
