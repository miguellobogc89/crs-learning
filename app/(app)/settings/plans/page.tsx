// app/(app)/settings/plans

import { SettingsShell } from "@/components/settings/settings-shell";
import {
  PlansView,
  type PlanViewModel,
} from "@/components/settings/plans-view";
import { getActiveSubscriptionPlans } from "@/lib/services/subscription-plan.service";

export default async function PlansPage() {
  const plans = await getActiveSubscriptionPlans();

const viewModels: PlanViewModel[] = plans.map((plan) => ({
  id: plan.id,
  code: plan.code,
  name: plan.name,
  description: plan.description,
  monthlyPriceCents: plan.monthly_price_cents,
  annualMonthlyPriceCents: plan.annual_monthly_price_cents,
  annualDiscountPercent: Number(plan.annual_discount_percent),
  maxUsers: plan.max_users,
  maxWorkspaces: plan.max_workspaces,
  maxGroups: plan.max_groups,
  storageBytes:
    plan.storage_bytes === null
      ? null
      : Number(plan.storage_bytes),
  monthlyAiTokens:
    plan.monthly_ai_tokens === null
      ? null
      : Number(plan.monthly_ai_tokens),
  isRecommended: plan.is_recommended,
  requiresContact: plan.requires_contact,
  features: plan.subscription_plan_features.map((pf) => ({
    code: pf.plan_features.code,
    name: pf.plan_features.name,
    value: pf.value,
  })),
}));

  return (
    <SettingsShell>
      <PlansView plans={viewModels} />
    </SettingsShell>
  );
}