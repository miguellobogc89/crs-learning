//components/workspace/workspace-selector.tsx


"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Layers3,
  Plus,
  SquareStack,
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

import type { AccessibleWorkspace } from "@/lib/repositories/workspace.repository";
import type { PlanLimitErrorPayload } from "@/lib/services/entitlements.service";

import { Button } from "../ui";

type Props = {
  activeWorkspace: AccessibleWorkspace;
  workspaces: AccessibleWorkspace[];
};

export function WorkspaceSelector({
  activeWorkspace,
  workspaces,
}: Props) {
  const [isCreating, setIsCreating] = useState(false);

  const [planLimit, setPlanLimit] =
    useState<PlanLimitErrorPayload | null>(null);

  const [isPending, startTransition] = useTransition();

  const router = useRouter();

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) {
            setIsCreating(false);
          }
        }}
      >

<DropdownMenuTrigger asChild>
  <button
    type="button"
    disabled={isPending}
    aria-label={`Cambiar espacio de trabajo. Actual: ${activeWorkspace.name}`}
    className="
      group/workspace
      flex h-[60px] w-full min-w-0 items-center gap-2
      rounded-[18px]
      border border-[#E3EAF8]
      bg-white/95
      px-2.5
      text-left
      shadow-[0_3px_12px_rgba(30,64,175,0.035)]
      transition-all duration-200
      hover:border-[#C9D9FA]
      hover:bg-white
      hover:shadow-[0_6px_20px_rgba(30,64,175,0.08)]
      focus-visible:outline-none
      focus-visible:ring-2
      focus-visible:ring-[#2563EB]/25
      disabled:cursor-wait
      disabled:opacity-70
      data-[state=open]:border-[#BFD3FF]
      data-[state=open]:shadow-[0_6px_20px_rgba(30,64,175,0.09)]
    "
  >
    {/* Icono más compacto */}
    <span
      className="
        flex h-8 w-8 shrink-0
        items-center justify-center
        rounded-[10px]
        bg-gradient-to-br
        from-[#F0F5FF] to-[#DFE9FF]
        text-[#155DFC]
        ring-1 ring-[#DCE7FF]
      "
    >
      <Layers3
        className="h-[17px] w-[17px]"
        strokeWidth={2}
      />
    </span>

    {/* Más espacio para el nombre */}
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span
        className="
          truncate text-[13px] font-semibold
          leading-[18px] tracking-[-0.02em]
          text-[#17233B]
        "
        title={activeWorkspace.name}
      >
        {activeWorkspace.name}
      </span>

      <span className="truncate text-[11px] leading-[15px] text-[#8390A6]">
        Espacio de trabajo
      </span>
    </span>

    <ChevronDown
      className="
        h-3.5 w-3.5 shrink-0
        text-[#7B8AA3]
        transition-transform duration-200
        group-data-[state=open]/workspace:rotate-180
      "
      strokeWidth={1.8}
    />
  </button>
</DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          sideOffset={10}
          className="
            w-[300px]
            rounded-[18px]
            border border-[#E3EAF8]
            bg-white
            p-2
            shadow-[0_18px_50px_rgba(22,42,90,0.13)]
          "
        >
          <DropdownMenuLabel
            className="
              px-3 pb-2 pt-2
              text-[10px] font-semibold
              uppercase tracking-[0.12em]
              text-[#8793A8]
            "
          >
            Tus espacios de trabajo
          </DropdownMenuLabel>

          {workspaces.map((workspace) => {
            const isActive =
              workspace.id === activeWorkspace.id;

            return (
              <DropdownMenuItem
                key={workspace.id}
                disabled={isPending}
                onSelect={(event) => {
                  event.preventDefault();

                  if (isActive) {
                    return;
                  }

                  startTransition(async () => {
                    await switchWorkspaceAction(workspace.id);
                    router.refresh();
                  });
                }}
                className="
                  flex min-h-[48px] cursor-pointer
                  items-center gap-3
                  rounded-xl px-2.5 py-2
                  focus:bg-[#F2F6FF]
                "
              >
                <span
                  className="
                    flex h-8 w-8 shrink-0
                    items-center justify-center
                    rounded-[10px]
                    bg-[#EEF4FF]
                    text-[#2563EB]
                  "
                >
                  <SquareStack className="h-4 w-4" />
                </span>

                <span
                  className="
                    min-w-0 flex-1 truncate
                    text-[13px] font-medium
                    text-[#263550]
                  "
                >
                  {workspace.name}
                </span>

                {isActive ? (
                  <span
                    className="
                      flex h-6 w-6 shrink-0
                      items-center justify-center
                      rounded-full bg-[#EAF1FF]
                      text-[#155DFC]
                    "
                  >
                    <Check
                      className="h-3.5 w-3.5"
                      strokeWidth={2.5}
                    />
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator className="my-2 bg-[#E9EEF7]" />

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
                placeholder="Nombre del espacio"
                className="
                  h-10 rounded-xl
                  border-[#E3EAF8]
                  bg-[#F8FAFF]
                  text-sm
                "
              />

              <Button variant="brand">
                Crear espacio
              </Button>
            </form>
          ) : (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setIsCreating(true);
              }}
              className="
                flex min-h-10 cursor-pointer
                items-center gap-2.5
                rounded-xl px-3
                text-[13px] font-medium
                text-[#155DFC]
                focus:bg-[#F2F6FF]
                focus:text-[#155DFC]
              "
            >
              <Plus className="h-4 w-4" />
              Nuevo espacio de trabajo
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