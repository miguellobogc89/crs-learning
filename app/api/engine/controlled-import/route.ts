import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { prisma } from "@/lib/prisma";
import { knowledgeSourceReadWhere } from "@/lib/knowledge/access-control";
import { importKnowledgeIntoEngine } from "@/lib/engine/auto-import-knowledge.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin)
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  if (!["owner", "admin"].includes(activeWorkspace.role))
    return NextResponse.json({ error: "Se requieren permisos de administrador." }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "Solicitud JSON inválida." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  const { knowledgeFileId, analysisSnapshot } = payload as Record<string, unknown>;
  if (typeof knowledgeFileId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(knowledgeFileId))
    return NextResponse.json({ error: "Selecciona un documento válido." }, { status: 400 });
  let replayPayload: unknown;
  if (analysisSnapshot !== undefined) {
    if (!analysisSnapshot || typeof analysisSnapshot !== "object" || Array.isArray(analysisSnapshot))
      return NextResponse.json({ error: "Snapshot inválido." }, { status: 400 });
    const snapshot = analysisSnapshot as Record<string, unknown>;
    if (snapshot.version !== 1 || snapshot.knowledgeFileId !== knowledgeFileId ||
        !snapshot.payload || JSON.stringify(snapshot.payload).length > 350000)
      return NextResponse.json({ error: "El snapshot no corresponde al documento seleccionado." }, { status: 400 });
    replayPayload = snapshot.payload;
  }
  const file = await prisma.knowledge_files.findFirst({
    where: { id: knowledgeFileId, status: { in: ["ready", "processed"] },
      knowledge_sources: knowledgeSourceReadWhere(session.user.id, activeWorkspace.id) },
    select: { id: true, file_name: true },
  });
  if (!file) return NextResponse.json({ error: "Documento no accesible." }, { status: 404 });
  try {
    const result = await importKnowledgeIntoEngine({
      workspaceId: activeWorkspace.id, userId: session.user.id, knowledgeFileId: file.id,
      replayPayload,
    });
    return NextResponse.json({ fileName: file.file_name, result },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[engine-controlled-import]", error);
    return NextResponse.json({ error: "La importación no ha podido completarse. Consulta los registros del servidor." },
      { status: 500 });
  }
}
