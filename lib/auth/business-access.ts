import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth/password";

export const BUSINESS_HOME = "/dashboard";
export const TRADING_HOME = "/trading/inicio";

// Preserve access for accounts that already existed when public registration became Trading-only.
const EXISTING_ACCOUNTS_BEFORE = new Date("2026-11-15T10:48:15Z");

export async function hasBusinessAccess(userId: string): Promise<boolean> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { email: true, status: true, created_at: true, system_role: true },
  });

  if (!user || user.status !== "active") return false;
  if (
    user.created_at < EXISTING_ACCOUNTS_BEFORE ||
    user.system_role === "system_admin" ||
    user.system_role === "system_super_admin"
  ) return true;

  const membership = await prisma.workspace_members.findFirst({
    where: {
      user_id: userId,
      status: "active",
      workspaces: {
        status: "active",
        workspace_invites: {
          some: {
            email: { equals: normalizeEmail(user.email), mode: "insensitive" },
            status: "accepted",
          },
        },
      },
    },
    select: { id: true },
  });

  return membership !== null;
}
