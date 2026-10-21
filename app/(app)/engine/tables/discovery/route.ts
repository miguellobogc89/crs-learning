import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { discoverEngineSchemaFromKnowledge } from "@/lib/engine/schema-discovery/discover.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (!["owner", "admin"].includes(activeWorkspace.role))
    return NextResponse.json({ error: "Se requieren permisos de administrador." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  const id = body && typeof body === "object" && "knowledgeFileId" in body
    ? (body as { knowledgeFileId: unknown }).knowledgeFileId : null;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  try {
    const result = await discoverEngineSchemaFromKnowledge({
      workspaceId: activeWorkspace.id, userId: session.user.id, knowledgeFileIds: [id],
    });
    return NextResponse.json({ ...result, writesPerformed: false },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[engine-discovery-preview]", error);
    return NextResponse.json({ error: "No se ha podido completar el análisis. Revisa el registro del servidor." },
      { status: 500 });
  }
}
