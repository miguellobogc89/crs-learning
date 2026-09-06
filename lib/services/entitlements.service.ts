import { prisma } from "@/lib/prisma";
import { getActiveOrganizationForUser } from "@/lib/services/organization.service";

export type PlanLimitReason =
  | "workspace_limit_reached"
  | "group_limit_reached"
  | "member_limit_reached"
  | "feature_not_available";

export type PlanLimitErrorPayload = {
  code: "PLAN_LIMIT_REACHED";
  reason: PlanLimitReason;
  limit: number | null;
  current: number;
  requiredPlan?: string;
  planName: string;
  message: string;
};

export class PlanLimitError extends Error {
  readonly payload: PlanLimitErrorPayload;

  constructor(payload: PlanLimitErrorPayload) {
    super(payload.message);
    this.name = "PlanLimitError";
    this.payload = payload;
  }
}

type LimitCheckResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      error: PlanLimitErrorPayload;
    };

type OrganizationPlanContext = {
  organization: {
    id: string;
    name: string;
  };
  plan: {
    id: string;
    code: string;
    name: string;
    max_users: number | null;
    max_workspaces: number | null;
    max_groups: number | null;
    storage_bytes: bigint | null;
    monthly_ai_tokens: bigint | null;
    subscription_plan_features: {
      is_included: boolean;
      value: string | null;
      plan_features: {
        code: string;
      };
    }[];
  };
};

export function isPlanLimitError(error: unknown) {
  return (
    error instanceof PlanLimitError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "PLAN_LIMIT_REACHED")
  );
}

export function serializePlanLimitError(error: unknown) {
  if (error instanceof PlanLimitError) {
    return error.payload;
  }

  return null;
}

export async function getOrganizationPlanContextForUser(
  userId: string,
): Promise<OrganizationPlanContext> {
  const organization =
    await getActiveOrganizationForUser(userId);

  const subscription =
    await prisma.organization_subscriptions.findUnique({
      where: {
        organization_id: organization.id,
      },
      include: {
        subscription_plans: {
          include: {
            subscription_plan_features: {
              include: {
                plan_features: true,
              },
            },
          },
        },
      },
    });

  if (!subscription) {
    throw new Error(
      "La organizacion no tiene una suscripcion activa",
    );
  }

  return {
    organization: {
      id: organization.id,
      name: organization.name,
    },
    plan: subscription.subscription_plans,
  };
}

export async function canCreateWorkspace(
  userId: string,
): Promise<LimitCheckResult> {
  const context =
    await getOrganizationPlanContextForUser(userId);
  const current = await prisma.workspaces.count({
    where: {
      OR: [
        {
          owner_user_id: userId,
          organization_id: null,
        },
        {
          organization_id: context.organization.id,
        },
      ],
      status: "active",
    },
  });

  return checkNumericLimit({
    planName: context.plan.name,
    reason: "workspace_limit_reached",
    limit: context.plan.max_workspaces,
    current,
    singular: "espacio de trabajo",
    plural: "espacios de trabajo",
    requiredPlan: await findRequiredPlanForLimit(
      "max_workspaces",
      current + 1,
    ),
  });
}

export async function canCreateGroup(
  userId: string,
  workspaceId: string,
): Promise<LimitCheckResult> {
  await assertWorkspaceAccessibleForEntitlement(userId, workspaceId);

  const context =
    await getOrganizationPlanContextForUser(userId);
  const current = await prisma.knowledge_teams.count({
    where: {
      workspace_id: workspaceId,
    },
  });

  return checkNumericLimit({
    planName: context.plan.name,
    reason: "group_limit_reached",
    limit: context.plan.max_groups,
    current,
    singular: "grupo",
    plural: "grupos",
    requiredPlan: await findRequiredPlanForLimit(
      "max_groups",
      current + 1,
    ),
  });
}

export async function canInviteMember(
  userId: string,
  workspaceId: string,
): Promise<LimitCheckResult> {
  const context =
    await getOrganizationPlanContextForUser(userId);
  const workspace =
    await getWorkspaceEntitlementScope(userId, workspaceId);

  const [members, pendingInvites] = await Promise.all([
    prisma.organization_members.count({
      where: {
        organization_id:
          workspace.organization_id ?? context.organization.id,
        status: "active",
      },
    }),
    prisma.workspace_invites.count({
      where: {
        status: "pending",
        workspaces: {
          ...(workspace.organization_id
            ? {
                organization_id: workspace.organization_id,
              }
            : {
                id: workspaceId,
              }),
          status: "active",
        },
      },
    }),
  ]);
  const current = members + pendingInvites;

  return checkNumericLimit({
    planName: context.plan.name,
    reason: "member_limit_reached",
    limit: context.plan.max_users,
    current,
    singular: "usuario",
    plural: "usuarios",
    requiredPlan: await findRequiredPlanForLimit(
      "max_users",
      current + 1,
    ),
  });
}

export async function canUseFeature(
  userId: string,
  featureCode: string,
): Promise<LimitCheckResult> {
  const context =
    await getOrganizationPlanContextForUser(userId);
  const feature =
    context.plan.subscription_plan_features.find(
      (item) => item.plan_features.code === featureCode,
    );

  if (feature?.is_included) {
    return {
      allowed: true,
    };
  }

  return {
    allowed: false,
    error: {
      code: "PLAN_LIMIT_REACHED",
      reason: "feature_not_available",
      limit: null,
      current: 0,
      planName: context.plan.name,
      requiredPlan: await findRequiredPlanForFeature(
        featureCode,
      ),
      message: "Esta funcionalidad no esta incluida en tu plan actual.",
    },
  };
}

export function assertPlanAllows(result: LimitCheckResult) {
  if (!result.allowed) {
    throw new PlanLimitError(result.error);
  }
}

async function assertWorkspaceAccessibleForEntitlement(
  userId: string,
  workspaceId: string,
) {
  const workspace = await prisma.workspaces.findFirst({
    where: {
      id: workspaceId,
      status: "active",
      workspace_members: {
        some: {
          user_id: userId,
          status: "active",
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!workspace) {
    throw new Error(
      "Workspace no encontrado",
    );
  }
}

async function getWorkspaceEntitlementScope(
  userId: string,
  workspaceId: string,
) {
  const workspace = await prisma.workspaces.findFirst({
    where: {
      id: workspaceId,
      status: "active",
      workspace_members: {
        some: {
          user_id: userId,
          status: "active",
        },
      },
    },
    select: {
      id: true,
      organization_id: true,
    },
  });

  if (!workspace) {
    throw new Error("Workspace no encontrado");
  }

  return workspace;
}

function checkNumericLimit({
  planName,
  reason,
  limit,
  current,
  singular,
  plural,
  requiredPlan,
}: {
  planName: string;
  reason: PlanLimitReason;
  limit: number | null;
  current: number;
  singular: string;
  plural: string;
  requiredPlan?: string;
}): LimitCheckResult {
  if (limit === null || current < limit) {
    return {
      allowed: true,
    };
  }

  const noun = limit === 1 ? singular : plural;

  return {
    allowed: false,
    error: {
      code: "PLAN_LIMIT_REACHED",
      reason,
      limit,
      current,
      requiredPlan,
      planName,
      message: `Has alcanzado el limite de ${limit} ${noun} de tu plan ${planName}.`,
    },
  };
}

async function findRequiredPlanForLimit(
  field:
    | "max_users"
    | "max_workspaces"
    | "max_groups",
  minimum: number,
) {
  const plans = await prisma.subscription_plans.findMany({
    where: {
      is_active: true,
      OR: [
        {
          [field]: {
            gte: minimum,
          },
        },
        {
          [field]: null,
        },
      ],
    },
    orderBy: {
      sort_order: "asc",
    },
    select: {
      name: true,
    },
    take: 1,
  });

  return plans[0]?.name;
}

async function findRequiredPlanForFeature(
  featureCode: string,
) {
  const plan =
    await prisma.subscription_plans.findFirst({
      where: {
        is_active: true,
        subscription_plan_features: {
          some: {
            is_included: true,
            plan_features: {
              code: featureCode,
            },
          },
        },
      },
      orderBy: {
        sort_order: "asc",
      },
      select: {
        name: true,
      },
    });

  return plan?.name;
}
