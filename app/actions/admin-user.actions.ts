// app/actions/admin-user.actions.ts
"use server";

import { auth } from "@/auth";
import {
  getUserSystemRole,
  requireAdmin,
} from "@/lib/auth/admin";
import {
  getAllUsers,
  getUserDetail,
  updateUserAdmin,
} from "@/lib/repositories/admin-user.repository";

/**
 * Admin action: Get all users (with filters)
 */
export async function adminGetAllUsers(
  search?: string,
  status?: string,
  orderBy: "created_at" | "name" | "last_login_at" = "created_at",
  orderDirection: "asc" | "desc" = "desc",
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  try {
    await requireAdmin(session.user.id);
  } catch {
    throw new Error("Admin access required");
  }

  return getAllUsers(search, undefined, status, orderBy, orderDirection);
}

/**
 * Admin action: Get user detail
 */
export async function adminGetUserDetail(userId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  try {
    await requireAdmin(session.user.id);
  } catch {
    throw new Error("Admin access required");
  }

  return getUserDetail(userId);
}

/**
 * Admin action: Update user
 */
export async function adminUpdateUser(
  userId: string,
  data: {
    name?: string;
    status?: string;
    system_role?: string;
  },
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const currentAdmin = await getUserSystemRole(
    session.user.id,
  );

  if (
    currentAdmin !== "system_admin" &&
    currentAdmin !== "system_super_admin"
  ) {
    throw new Error("Admin access required");
  }

  if (!userId) {
    throw new Error("User ID is required");
  }

  if (
    data.name !== undefined &&
    typeof data.name !== "string"
  ) {
    throw new Error("Invalid name");
  }

  if (
    data.status !== undefined &&
    !["active", "inactive", "suspended"].includes(
      data.status,
    )
  ) {
    throw new Error(
      "Invalid status. Must be: active, inactive, or suspended",
    );
  }

  if (
    data.system_role !== undefined &&
    ![
      "user",
      "system_admin",
      "system_super_admin",
    ].includes(data.system_role)
  ) {
    throw new Error("Invalid system role");
  }

  const targetUser = await getUserDetail(userId);

  if (!targetUser) {
    throw new Error("User not found");
  }

  const targetRole =
    targetUser.system_role ?? "user";

  if (
    currentAdmin === "system_admin" &&
    (
      targetRole === "system_admin" ||
      targetRole === "system_super_admin" ||
      data.system_role === "system_admin" ||
      data.system_role === "system_super_admin"
    )
  ) {
    throw new Error(
      "Only a system super admin can manage system administrators",
    );
  }

  if (
    currentAdmin === "system_admin" &&
    (
      data.status === "inactive" ||
      data.status === "suspended"
    ) &&
    targetRole !== "user"
  ) {
    throw new Error(
      "Only a system super admin can disable system administrators",
    );
  }

  return updateUserAdmin(
    userId,
    data,
  );
}
