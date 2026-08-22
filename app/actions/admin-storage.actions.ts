"use server";

import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getAllStorageFiles,
  getStorageStats,
  getStorageFileDetail,
  getStorageFilterOptions,
  type StorageFileFilter,
} from "@/lib/repositories/admin-storage.repository";

/**
 * Get all storage files with filtering
 */
export async function adminGetStorageFiles(filter?: StorageFileFilter) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await requireAdmin(session.user.id);
  return getAllStorageFiles(filter);
}

/**
 * Get storage statistics
 */
export async function adminGetStorageStats() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await requireAdmin(session.user.id);
  return getStorageStats();
}

/**
 * Get single file details
 */
export async function adminGetStorageFileDetail(fileId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await requireAdmin(session.user.id);
  return getStorageFileDetail(fileId);
}

/**
 * Get filtering options (users, file types, statuses, workspaces)
 */
export async function adminGetStorageFilterOptions() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await requireAdmin(session.user.id);
  return getStorageFilterOptions();
}
