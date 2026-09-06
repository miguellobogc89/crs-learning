"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";

import { inviteWorkspaceMemberAction } from "@/app/actions/workspace-admin.actions";
import { PlanLimitDialog } from "@/components/billing/plan-limit-dialog";
import { Button } from "@/components/ui/button";
import type { PlanLimitErrorPayload } from "@/lib/services/entitlements.service";

type WorkspaceInviteFormProps = {
  workspaceId: string;
};

export function WorkspaceInviteForm({
  workspaceId,
}: WorkspaceInviteFormProps) {
  const router = useRouter();
  const [planLimit, setPlanLimit] =
    useState<PlanLimitErrorPayload | null>(null);

  return (
    <>
      <form
        action={async (formData) => {
          const result =
            await inviteWorkspaceMemberAction(formData);

          if (result && !result.ok) {
            setPlanLimit(result.planLimit);
            return;
          }

          router.refresh();
        }}
        className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]"
      >
        <input
          type="hidden"
          name="workspaceId"
          value={workspaceId}
        />
        <input
          name="email"
          type="email"
          placeholder="persona@empresa.com"
          required
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
        />
        <Button type="submit">
          <Mail className="mr-2 h-4 w-4" />
          Invitar
        </Button>
      </form>

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
