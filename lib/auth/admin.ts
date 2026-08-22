// lib/auth/admin.ts

import { prisma } from "@/lib/prisma";

export async function getUserSystemRole(
  userId: string,
): Promise<string | null> {
  const user = await prisma.users.findUnique({
    where: {
      id: userId,
    },
    select: {
      system_role: true,
    },
  });

  return user?.system_role ?? null;
}

export async function isUserAdmin(
  userId: string,
): Promise<boolean> {
  const role = await getUserSystemRole(userId);

  return (
    role === "system_admin" ||
    role === "system_super_admin"
  );
}

export async function isUserSuperAdmin(
  userId: string,
): Promise<boolean> {
  const role = await getUserSystemRole(userId);

  return role === "system_super_admin";
}

export async function requireAdmin(
  userId: string,
): Promise<void> {
  const isAdmin = await isUserAdmin(userId);

  if (!isAdmin) {
    throw new Error(
      "Unauthorized: Admin access required",
    );
  }
}

export async function requireSuperAdmin(
  userId: string,
): Promise<void> {
  const isSuperAdmin =
    await isUserSuperAdmin(userId);

  if (!isSuperAdmin) {
    throw new Error(
      "Unauthorized: Super admin access required",
    );
  }
}