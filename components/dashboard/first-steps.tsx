"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { useState } from "react";

import { PlanLimitDialog } from "@/components/billing/plan-limit-dialog";
import { cn } from "@/lib/utils";
import type {
  DashboardFirstSteps,
  DashboardFirstStep,
} from "@/lib/services/dashboard.service";
import type { PlanLimitErrorPayload } from "@/lib/services/entitlements.service";

export function FirstSteps({
  onboarding,
}: {
  onboarding: DashboardFirstSteps;
}) {
  const [planLimit, setPlanLimit] =
    useState<PlanLimitErrorPayload | null>(null);
  const progressPercent =
    onboarding.totalCount > 0
      ? Math.round(
          (onboarding.completedCount /
            onboarding.totalCount) *
            100,
        )
      : 0;

  return (
    <>
      <section className="mt-10 rounded-xl border border-border bg-background p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Primeros pasos
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Completa lo esencial para que CRS LAB empiece a trabajar con el
              conocimiento de tu organizacion.
            </p>
          </div>

          <div className="shrink-0 text-left sm:text-right">
            <p className="text-sm font-semibold text-foreground">
              {onboarding.completedCount}/{onboarding.totalCount}
            </p>
            <p className="text-xs text-muted-foreground">
              completados
            </p>
          </div>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {onboarding.steps.map((step) => (
            <FirstStepRow
              key={step.id}
              step={step}
              onBlocked={() => setPlanLimit(step.planLimit ?? null)}
            />
          ))}
        </div>
      </section>

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

function FirstStepRow({
  step,
  onBlocked,
}: {
  step: DashboardFirstStep;
  onBlocked: () => void;
}) {
  const content = (
    <>
      <StepStatus isComplete={step.isComplete} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {step.title}
          </h3>
          {step.planLimit ? (
            <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">
              Plan superior
            </span>
          ) : null}
        </div>

        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {step.planLimit
            ? step.planLimit.message
            : step.description}
        </p>
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </>
  );

  if (step.planLimit && !step.isComplete) {
    return (
      <button
        type="button"
        onClick={onBlocked}
        className="group flex min-h-24 w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-surface"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={step.href}
      className="group flex min-h-24 w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-surface"
    >
      {content}
    </Link>
  );
}

function StepStatus({ isComplete }: { isComplete: boolean }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        isComplete
          ? "bg-brand-soft text-brand"
          : "bg-surface text-muted-foreground",
      )}
    >
      {isComplete ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <Circle className="h-4 w-4" />
      )}
    </span>
  );
}
