import { EXTRACTOR_UPLOAD_TYPE } from "@/lib/knowledge/intake/extractor/contract";
import { intakeImageMime } from "@/lib/knowledge/intake/formats";
import { createIntakeBatch } from "@/lib/knowledge/intake/create-batch";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { buildKnowledgeImportInventory } from "@/lib/knowledge/import/pipeline/build-inventory";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  try {
    if (Number(request.headers.get("content-length")) > 150*1024*1024) throw new Error("Máximo 150 MB por lote");
    const form = await request.formData();
    const libraryId = String(form.get("libraryId") ?? "");
    const library = await prisma.knowledge_libraries.findFirst({ where: { id: libraryId, ...knowledgeLibraryWriteWhere(session.user.id, activeWorkspace.id) }, select: { id: true } });
    if (!library) return NextResponse.json({ error: "Carpeta no accesible" }, { status: 403 });
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length || files.length > 100 || files.reduce((n,f) => n+f.size,0) > 150*1024*1024) throw new Error("Selecciona entre 1 y 100 archivos, hasta 150 MB");
    const inventory = buildKnowledgeImportInventory({ mode: files.length === 1 && files[0].name.toLowerCase().endsWith(".zip") ? "zip" : "files",
      files: await Promise.all(files.map(async (f,i) => ({ id: `source-${i}`, fileName: f.name, relativePath: f.name, mimeType: f.type || intakeImageMime(f.name) || "", content: new Uint8Array(await f.arrayBuffer()) }))) });
    const batch = await createIntakeBatch({ libraryId: library.id, userId: session.user.id,
      documents: inventory.files.map(f => ({ fileName: f.fileName, relativePath: f.relativePath, mimeType: f.mimeType ?? "", content: f.content })) });
    return NextResponse.json({ loteId: batch.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo preparar el lote" }, { status: 400 });
  }
}
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const libraryId = new URL(request.url).searchParams.get("libraryId");

  const batches = await prisma.knowledge_imports.findMany({ where: { owner_user_id: session.user.id, ...(libraryId ? { library_id: libraryId } : { status: "intake_pending" }), upload_type: EXTRACTOR_UPLOAD_TYPE, knowledge_libraries: knowledgeLibraryWriteWhere(session.user.id, activeWorkspace.id) },
    select: { id: true, status: true, created_at: true }, orderBy: { created_at: "desc" }, take: 20 });
  return NextResponse.json(batches);
}
