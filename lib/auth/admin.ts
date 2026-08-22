import { prisma } from "@/lib/prisma";

/**
 * Check if a user is an admin
 * 
 * Note: This requires an is_admin field in the users table.
 * You may need to add this field via Prisma migration if it doesn't exist.
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        // is_admin field should be added to users model in Prisma schema
        // For now, we'll use company_id as a temporary workaround
        // In production, add an explicit is_admin boolean field
        company_id: true,
      },
    });

    // TODO: Replace this with actual is_admin field check once schema is updated
    // return user?.is_admin ?? false;
    
    // Temporary implementation: assume company owner is admin
    // You should change this to check an is_admin flag
    return user?.company_id !== null && user?.company_id !== undefined;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * Ensure user is admin, otherwise throw unauthorized error
 * Use this in server actions and API routes
 */
export async function requireAdmin(userId: string): Promise<void> {
  const isAdmin = await isUserAdmin(userId);
  
  if (!isAdmin) {
    throw new Error("Unauthorized: Admin access required");
  }
}
