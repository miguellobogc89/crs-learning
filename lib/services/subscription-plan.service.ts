// lib/services/subscription-plan.service.ts

import { prisma } from "@/lib/prisma";

export async function getActiveSubscriptionPlans() {
  return prisma.subscription_plans.findMany({
    where: {
      is_active: true,
    },
    orderBy: {
      sort_order: "asc",
    },
    include: {
      subscription_plan_features: {
        orderBy: {
          sort_order: "asc",
        },
        include: {
          plan_features: true,
        },
      },
    },
  });
}

export type SubscriptionPlanWithFeatures = Awaited<
  ReturnType<typeof getActiveSubscriptionPlans>
>[number];


export async function getSubscriptionPlanByCode(code: string) {
  return prisma.subscription_plans.findFirst({
    where: {
      code,
      is_active: true,
    },
    include: {
      subscription_plan_features: {
        orderBy: {
          sort_order: "asc",
        },
        include: {
          plan_features: true,
        },
      },
    },
  });
}