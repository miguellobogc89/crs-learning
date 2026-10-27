import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryReadWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { readKnowledgeFile } from "@/lib/storage/knowledge-storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ fileId: string }> };

/** The original document of an import (to check where a value comes from). Opens in the browser; read-only. */
export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const { fileId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return NextResponse.json({ error: "Documento no válido" }, { status: 400 });
  const file = await prisma.knowledge_import_files.findFirst({
    where: { id: fileId, knowledge_imports: { knowledge_libraries: knowledgeLibraryReadWhere(session.user.id, activeWorkspace.id) } },
    select: { file_name: true, mime_type: true, storage_path: true } });
  if (!file?.storage_path) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  const content = await readKnowledgeFile(file.storage_path);
  return new Response(new Uint8Array(content), { headers: {
    "content-type": file.mime_type || "application/octet-stream",
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
    "cache-control": "private, max-age=300", "x-content-type-options": "nosniff",
  } });
}
