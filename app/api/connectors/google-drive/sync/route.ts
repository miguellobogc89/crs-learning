import { NextResponse } from "next/server";
import { ConnectionError, connectorContext } from "@/lib/connectors/google-drive/connection";
import { DriveError } from "@/lib/connectors/google-drive/drive";
import { pendingCount, syncDrive } from "@/lib/connectors/google-drive/sync";
import { syncLimit } from "@/lib/connectors/google-drive/sync-plan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function failure(error: unknown) {
  if (error instanceof ConnectionError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof DriveError) return NextResponse.json({ error: error.message }, { status: 502 });
  console.error("[connectors] drive sync", error);
  return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo sincronizar" }, { status: 500 });
}

/** How many documents of the folder are still to be brought (lists Drive, downloads nothing). */
export async function GET(request: Request) {
  const ctx = await connectorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try { return NextResponse.json(await pendingCount(ctx.workspaceId, new URL(request.url).origin)); }
  catch (error) { return failure(error); }
}

/** "Sincronizar ahora" ({ limit? }): creates one intake batch with the next new documents. Saves nothing to the data. */
export async function POST(request: Request) {
  const ctx = await connectorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!ctx.canManage) return NextResponse.json({ error: "Solo el propietario o un administrador puede sincronizar" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { limit?: unknown; fileIds?: unknown };
  const only = Array.isArray(body.fileIds) ? body.fileIds.filter((x): x is string => typeof x === "string").slice(0, 50) : undefined;
  if (Array.isArray(body.fileIds) && !only?.length) return NextResponse.json({ error: "No hay documentos seleccionados" }, { status: 400 });
  try { return NextResponse.json(await syncDrive({ workspaceId: ctx.workspaceId, userId: ctx.userId, origin: new URL(request.url).origin, limit: syncLimit(body.limit), only })); }
  catch (error) { return failure(error); }
}
