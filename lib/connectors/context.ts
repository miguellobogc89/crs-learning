import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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

/**
 * Como connectorContext, pero para Trading: usa siempre el espacio donde viven tus brókeres y tus agentes, aunque
 * el espacio activo sea otro (p. ej. el del negocio). Si no tienes nada de Trading todavía, el espacio activo.
 */
export async function tradingContext(): Promise<ConnectorContext | null> {
  const ctx = await connectorContext();
  if (!ctx) return null;
  const rows = await prisma.$queryRaw<{ id: string; name: string; role: string }[]>`
    SELECT w.id::text AS id, w.name, wm.role::text AS role
      FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = ${ctx.userId}::uuid
     ORDER BY (SELECT count(*) FROM broker_connections b WHERE b.workspace_id = w.id AND b.user_id = ${ctx.userId}::uuid AND b.status <> 'disconnected') DESC,
              (SELECT count(*) FROM trading_user_agents a WHERE a.workspace_id = w.id) DESC,
              (w.id::text = ${ctx.workspaceId}) DESC
     LIMIT 1`;
  const w = rows[0];
  if (!w || w.id === ctx.workspaceId) return ctx;
  return { ...ctx, workspaceId: w.id, workspaceName: w.name, canManage: w.role === "owner" || w.role === "admin" };
}
