import { NextResponse } from "next/server";
import { connectionView, connectorContext, disconnect } from "@/lib/connectors/google-drive/connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** State of the workspace's Drive connection (never the tokens). */
export async function GET() {
  const ctx = await connectorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ ...(await connectionView(ctx.workspaceId)), canManage: ctx.canManage });
}

/** "Desconectar": revokes the permission at Google and deletes the connection. Imported documents stay. */
export async function DELETE() {
  const ctx = await connectorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!ctx.canManage) return NextResponse.json({ error: "Solo el propietario o un administrador puede desconectar Drive" }, { status: 403 });
  return NextResponse.json(await disconnect(ctx.workspaceId));
}
