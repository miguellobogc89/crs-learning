// app/actions/admin-user.actions.ts
"use server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/admin";
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
  },
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

  // Validate input
  if (!userId) {
    throw new Error("User ID is required");
  }

  if (data.name !== undefined && typeof data.name !== "string") {
    throw new Error("Invalid name");
  }

  if (
    data.status !== undefined &&
    !["active", "inactive", "suspended"].includes(data.status)
  ) {
    throw new Error(
      "Invalid status. Must be: active, inactive, or suspended",
    );
  }

  return updateUserAdmin(userId, data);
}
