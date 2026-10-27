import { NextResponse } from "next/server";
import { accessToken, ConnectionError, connectorContext } from "@/lib/connectors/google-drive/connection";
import { DriveError, listFolders } from "@/lib/connectors/google-drive/drive";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Subfolders of ?parent= ("root" = Mi unidad, "shared" = Compartido conmigo), optionally filtered by ?q=. */
export async function GET(request: Request) {
  const ctx = await connectorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const token = await accessToken(ctx.workspaceId, url.origin);
    return NextResponse.json(await listFolders(token, url.searchParams.get("parent") ?? "root", url.searchParams.get("q") ?? undefined));
  } catch (error) {
    if (error instanceof ConnectionError) return NextResponse.json({ error: error.message, reconnect: true }, { status: 409 });
    if (error instanceof DriveError) return NextResponse.json({ error: error.message }, { status: error.status === 400 ? 400 : 502 });
    throw error;
  }
}
