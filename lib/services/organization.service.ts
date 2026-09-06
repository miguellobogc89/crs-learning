import { prisma } from "@/lib/prisma";

const DEFAULT_PLAN_CODE = "free";

function slugifyOrganizationName(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "organizacion";
}

async function getAvailableOrganizationSlug(baseName: string) {
  const baseSlug = slugifyOrganizationName(baseName);
  let slug = baseSlug;
  let suffix = 2;

  while (
    await prisma.organizations.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
      },
    })
  ) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

export async function ensureUserPrimaryOrganization(
  userId: string,
) {
  const existingMember =
    await prisma.organization_members.findFirst({
      where: {
        user_id: userId,
        status: "active",
        is_primary: true,
        organizations: {
          status: "active",
        },
      },
      include: {
        organizations: {
          include: {
            organization_subscriptions: {
              include: {
                subscription_plans: true,
              },
            },
          },
        },
      },
    });

  if (existingMember) {
    if (!existingMember.organizations.organization_subscriptions) {
      await ensureFreeSubscription(
        existingMember.organization_id,
      );
    }

    return existingMember.organizations;
  }

  const user = await prisma.users.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (!user) {
    throw new Error("Usuario no encontrado");
  }

  const fallbackName =
    user.name?.trim() || user.email.split("@")[0] || "Mi organizacion";
  const organizationName = `Organizacion de ${fallbackName}`.slice(
    0,
    120,
  );
  const slug = await getAvailableOrganizationSlug(
    `${fallbackName}-${user.id.slice(0, 8)}`,
  );
  const freePlan = await getFreePlan();

  const organization = await prisma.$transaction(async (tx) => {
    const createdOrganization =
      await tx.organizations.create({
        data: {
          name: organizationName,
          slug,
          organization_type: "personal",
          is_independent_tenant: true,
          status: "active",
        },
      });

    await tx.organization_members.create({
      data: {
        organization_id: createdOrganization.id,
        user_id: user.id,
        role: "owner",
        status: "active",
        is_primary: true,
      },
    });

    await tx.organization_subscriptions.create({
      data: {
        organization_id: createdOrganization.id,
        plan_id: freePlan.id,
        billing_period: "monthly",
        status: "active",
      },
    });

    return createdOrganization;
  });

  return organization;
}

export async function getActiveOrganizationForUser(
  userId: string,
) {
  return ensureUserPrimaryOrganization(userId);
}

async function ensureFreeSubscription(
  organizationId: string,
) {
  const freePlan = await getFreePlan();

  return prisma.organization_subscriptions.upsert({
    where: {
      organization_id: organizationId,
    },
    create: {
      organization_id: organizationId,
      plan_id: freePlan.id,
      billing_period: "monthly",
      status: "active",
    },
    update: {
      plan_id: freePlan.id,
      status: "active",
      updated_at: new Date(),
    },
  });
}

async function getFreePlan() {
  const freePlan =
    await prisma.subscription_plans.findFirst({
      where: {
        code: DEFAULT_PLAN_CODE,
        is_active: true,
      },
      select: {
        id: true,
      },
    });

  if (!freePlan) {
    throw new Error(
      'No existe un plan activo con code = "free"',
    );
  }

  return freePlan;
}
