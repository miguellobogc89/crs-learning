// components/home/plan/plan-usage-view.tsx

import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
} from "lucide-react";

import { getPlanUsageForUser } from "@/lib/services/entitlements.service";

type Props = {
  userId: string;
};

export async function PlanUsageView({
  userId,
}: Props) {
  const usage =
    await getPlanUsageForUser(userId);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 pt-6">
      <section className="rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Plan actual
            </p>

            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              {usage.plan.name}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {usage.organization.name}
            </p>
          </div>

          <CreditCard className="h-5 w-5 text-[#0A58FF]" />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <UsageCard
            label="Usuarios"
            current={usage.usage.users}
            limit={usage.plan.maxUsers}
          />

          <UsageCard
            label="Espacios"
            current={
              usage.usage.workspaces
            }
            limit={
              usage.plan.maxWorkspaces
            }
          />

          <UsageCard
            label="Equipos"
            current={usage.usage.groups}
            limit={usage.plan.maxGroups}
          />
        </div>
      </section>

      <Link
        href="/settings/plans"
        className="inline-flex items-center gap-2 text-sm font-medium text-[#0A58FF] hover:underline"
      >
        Ver planes disponibles
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function UsageCard({
  label,
  current,
  limit,
}: {
  label: string;
  current: number;
  limit: number | null;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-xl font-semibold text-slate-950">
        {current}
        <span className="ml-1 text-sm font-normal text-slate-400">
          / {limit ?? "∞"}
        </span>
      </p>
    </div>
  );
}