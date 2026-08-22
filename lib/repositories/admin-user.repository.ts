// lib/repositories/admin-user.repository.ts
import { prisma } from "@/lib/prisma";

export interface UserAdminView {
  id: string;
  email: string;
  name: string | null;
  status: string;
  system_role: string;
  provider: string | null;
  created_at: Date;
  last_login_at: Date | null;
  xp: number;
  level: number;
  workspaceCount: number;
  fileCount: number;
  conversationCount: number;
}

/**
 * Get all users with admin view details
 * Includes workspace, file, and conversation counts
 */
export async function getAllUsers(
  search?: string,
  role?: string,
  status?: string,
  orderBy: "created_at" | "name" | "last_login_at" = "created_at",
  orderDirection: "asc" | "desc" = "desc",
): Promise<UserAdminView[]> {
  const where: any = {};

  // Search filter
  if (search?.trim()) {
    const searchTerm = search.trim().toLowerCase();
    where.OR = [
      {
        email: {
          contains: searchTerm,
          mode: "insensitive" as const,
        },
      },
      {
        name: {
          contains: searchTerm,
          mode: "insensitive" as const,
        },
      },
    ];
  }

  // Status filter
  if (status) {
    where.status = status;
  }

  // Note: Role is typically on workspace_members, not users table
  // For MVP, we'll query after fetching users

  const users = await prisma.users.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      system_role: true,
      provider: true,
      created_at: true,
      last_login_at: true,
      xp: true,
      level: true,
      workspace_members: {
        select: {
          id: true,
        },
      },
      knowledge_files: {
        select: {
          id: true,
        },
      },
      chat_conversations_chat_conversations_owner_user_idTousers: {
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      [orderBy]: orderDirection,
    },
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    system_role: user.system_role,
    provider: user.provider,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
    xp: user.xp,
    level: user.level,
    workspaceCount: user.workspace_members.length,
    fileCount: user.knowledge_files.length,
    conversationCount:
      user.chat_conversations_chat_conversations_owner_user_idTousers.length,
  }));
}

/**
 * Get a single user with detailed admin information
 */
export async function getUserDetail(userId: string) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      system_role: true,
      provider: true,
      created_at: true,
      updated_at: true,
      last_login_at: true,
      xp: true,
      level: true,
      image: true,
      email_verified_at: true,
      company_id: true,
      workspace_members: {
        select: {
          workspace_id: true,
          role: true,
          workspaces: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      knowledge_files: {
        select: {
          id: true,
          file_size: true,
        },
      },
      chat_conversations_chat_conversations_owner_user_idTousers: {
        select: {
          id: true,
          created_at: true,
        },
      },
      knowledge_activity: {
        select: {
          id: true,
          created_at: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const totalStorageBytes = user.knowledge_files.reduce(
    (sum, file) => sum + (file.file_size || 0),
    0,
  );

  return {
    ...user,
    totalStorageBytes,
    totalStorageGB: (totalStorageBytes / (1024 ** 3)).toFixed(2),
  };
}

/**
 * Update user admin fields
 * Restricted to: name, status, system_role
 * Cannot update: email, password_hash, company_id, sensitive fields
 */
export async function updateUserAdmin(
  userId: string,
  data: {
    name?: string;
    status?: string;
    system_role?: string;
  },
) {
  return prisma.users.update({
    where: { id: userId },
    data: {
      name:
        data.name !== undefined
          ? data.name
          : undefined,
      status:
        data.status !== undefined
          ? data.status
          : undefined,
      system_role:
        data.system_role !== undefined
          ? data.system_role
          : undefined,
      updated_at: new Date(),
    },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      system_role: true,
      created_at: true,
      last_login_at: true,
    },
  });
}

/**
 * Get user statistics for dashboard
 */
export async function getUserStats() {
  const [
    totalUsers,
    activeUsers,
    inactiveUsers,
    newUsersLast30Days,
  ] = await Promise.all([
    prisma.users.count(),
    prisma.users.count({
      where: { status: "active" },
    }),
    prisma.users.count({
      where: { status: { not: "active" } },
    }),
    prisma.users.count({
      where: {
        created_at: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  return {
    totalUsers,
    activeUsers,
    inactiveUsers,
    newUsersLast30Days,
  };
}

/**
 * Get users created in a date range (for reporting)
 */
export async function getUsersByDateRange(
  startDate: Date,
  endDate: Date,
) {
  return prisma.users.findMany({
    where: {
      created_at: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      created_at: true,
      last_login_at: true,
    },
    orderBy: { created_at: "desc" },
  });
}
