import { NextResponse } from "next/server";
import { accessToken, ConnectionError, connectorContext, findConnection, saveSettings } from "@/lib/connectors/google-drive/connection";
import { countDocuments, DriveError, getFolder, readSettings } from "@/lib/connectors/google-drive/drive";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof ConnectionError) return NextResponse.json({ error: error.message, reconnect: true }, { status: 409 });
  if (error instanceof DriveError) return NextResponse.json({ error: error.message }, { status: error.status === 400 || error.status === 404 ? error.status : 502 });
  throw error;
}

/** The chosen folder, checked live in Drive, with how many documents the importer could read in it. */
export async function GET(request: Request) {
  const ctx = await connectorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const connection = await findConnection(ctx.workspaceId);
  const folder = readSettings(connection?.settings_json).folder;
  if (!folder) return NextResponse.json({ folder: null });
  try {
    const token = await accessToken(ctx.workspaceId, new URL(request.url).origin);
    return NextResponse.json({ folder, documents: await countDocuments(token, folder.id) });
  } catch (error) { return failure(error); }
}

/** Choose the folder ({ id }). Only owners and admins. Nothing is imported here: that is the "Sincronizar" step. */
export async function PUT(request: Request) {
  const ctx = await connectorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!ctx.canManage) return NextResponse.json({ error: "Solo el propietario o un administrador puede elegir la carpeta" }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (typeof body?.id !== "string") return NextResponse.json({ error: "Falta la carpeta" }, { status: 400 });
  try {
    const token = await accessToken(ctx.workspaceId, new URL(request.url).origin);
    const found = await getFolder(token, body.id);
    const documents = await countDocuments(token, found.id);
    const folder = { id: found.id, name: found.name, selectedAt: new Date().toISOString(), selectedBy: ctx.userId };
    await saveSettings(ctx.workspaceId, { folder });
    return NextResponse.json({ folder, documents });
  } catch (error) { return failure(error); }
}
