import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

export type ConnectorContext = {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  canManage: boolean;
};

/** Who is asking and whether they may connect, disconnect or choose the folder (workspace owner or admin). */
export async function connectorContext(): Promise<ConnectorContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  return {
    userId: session.user.id,
    workspaceId: activeWorkspace.id,
    workspaceName: activeWorkspace.name,
    canManage:
      activeWorkspace.role === "owner" || activeWorkspace.role === "admin",
  };
}
