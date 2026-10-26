import { isSupportedKnowledgeDocument } from "@/lib/knowledge/import/supported-formats";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere } from "@/lib/knowledge/access-control";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";
import { buildKnowledgeImportInventory } from "@/lib/knowledge/import/pipeline/build-inventory";
import { uploadKnowledgeFile, deleteKnowledgeFile } from "@/lib/storage/knowledge-storage";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const stored: string[] = [];
  try {
    if (Number(request.headers.get("content-length")) > 150*1024*1024) throw new Error("Máximo 150 MB por lote");
    const form = await request.formData();
    const libraryId = String(form.get("libraryId") ?? "");
    const library = await prisma.knowledge_libraries.findFirst({ where: { id: libraryId, ...knowledgeLibraryWriteWhere(session.user.id, activeWorkspace.id) }, select: { id: true } });
    if (!library) return NextResponse.json({ error: "Carpeta no accesible" }, { status: 403 });
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length || files.length > 100 || files.reduce((n,f) => n+f.size,0) > 150*1024*1024) throw new Error("Selecciona entre 1 y 100 archivos, hasta 150 MB");
    const inventory = buildKnowledgeImportInventory({ mode: files.length === 1 && files[0].name.toLowerCase().endsWith(".zip") ? "zip" : "files",
      files: await Promise.all(files.map(async (f,i) => ({ id: `source-${i}`, fileName: f.name, relativePath: f.name, mimeType: f.type, content: new Uint8Array(await f.arrayBuffer()) }))) });
    if (!inventory.files.length) throw new Error("No hay documentos compatibles");
    const unsupported = inventory.files.filter(file => !isSupportedKnowledgeDocument(file.fileName));
    if (unsupported.length) throw new Error(`Formatos no admitidos: ${unsupported.map(f => f.fileName).join(", ")}`);
    const staged = [];
    for (const file of inventory.files) {
      const storage = await uploadKnowledgeFile(`knowledge/intake/${crypto.randomUUID()}`, Buffer.from(file.content), file.mimeType || "application/octet-stream");
      stored.push(storage);
      staged.push({ file_name: file.fileName, relative_path: file.relativePath, mime_type: file.mimeType, file_size: file.content.byteLength, storage_path: storage, status: "uploaded" });
    }
    const batch = await prisma.knowledge_imports.create({ data: {
      library_id: library.id, owner_user_id: session.user.id, upload_type: "intake-v1", status: "intake_pending", total_files: staged.length,
      total_size: staged.reduce((n,f) => n+f.file_size,0), proposal_json: { version: 1 }, knowledge_import_files: { create: staged },
    }, select: { id: true } });
    return NextResponse.json({ loteId: batch.id }, { status: 201 });
  } catch (error) {
    await Promise.allSettled(stored.map(deleteKnowledgeFile));
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo preparar el lote" }, { status: 400 });
  }
}
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { activeWorkspace } = await getActiveWorkspaceContext(session.user.id);
  const libraryId = new URL(request.url).searchParams.get("libraryId");

  const batches = await prisma.knowledge_imports.findMany({ where: { owner_user_id: session.user.id, ...(libraryId ? { library_id: libraryId } : { status: "intake_pending" }), upload_type: "intake-v1", knowledge_libraries: knowledgeLibraryWriteWhere(session.user.id, activeWorkspace.id) },
    select: { id: true, status: true, created_at: true }, orderBy: { created_at: "desc" }, take: 20 });
  return NextResponse.json(batches);
}
