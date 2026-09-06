"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlanLimitErrorPayload } from "@/lib/services/entitlements.service";

type PlanLimitDialogProps = {
  open: boolean;
  limit: PlanLimitErrorPayload | null;
  onOpenChange: (open: boolean) => void;
};

export function PlanLimitDialog({
  open,
  limit,
  onOpenChange,
}: PlanLimitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Limite del plan</DialogTitle>
          <DialogDescription>
            {limit?.message ??
              "Esta accion no esta disponible en tu plan actual."}
          </DialogDescription>
        </DialogHeader>

        {limit?.requiredPlan ? (
          <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
            Disponible a partir del plan{" "}
            <span className="font-medium text-foreground">
              {limit.requiredPlan}
            </span>
            .
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Ahora no
          </Button>
          <Button asChild variant="default">
            <Link href="/settings/plans">
              Actualizar plan
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
