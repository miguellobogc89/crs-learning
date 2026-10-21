import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { importKnowledgeIntoEngine } from "@/lib/engine/auto-import-knowledge.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON no válido." }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("knowledgeFileId" in body) ||
      typeof body.knowledgeFileId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.knowledgeFileId))
    return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });
  try {
    const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
    const result = await importKnowledgeIntoEngine({
      workspaceId: activeWorkspace.id, userId: session.user.id,
      knowledgeFileId: body.knowledgeFileId,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Engine automatic import failed", error);
    const message = error instanceof Error ? error.message : "";
    const stage = /^Engine (recognition|schema sweep|extraction sweep|extraction|verification)/.test(message)
      ? message.replace(/Error:\\s*/g, "").slice(0, 300)
      : null;
    return NextResponse.json({
      error: /permisos|administrador/i.test(message) ? message :
        stage ?? "No se ha podido completar la importación estructurada. Consulta los registros.",
    }, { status: 422 });
  }
}
