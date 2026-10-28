import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

/** Who asks, in which workspace, and whether they may create tables and process documents (owner or admin). */
export async function templateContext() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  return { userId: session.user.id, workspaceId: activeWorkspace.id, canManage: activeWorkspace.role === "owner" || activeWorkspace.role === "admin" };
}
