import { prisma } from "@/lib/prisma";
import { knowledgeLibraryWriteWhere, knowledgeSourceOwnerWhere } from "./access-control";

/** Use existing deleted tombstones: Engine citations keep their source and evidence intact. */
export async function deleteKnowledgeSelection(input: {
  userId: string; workspaceId: string; sourceIds: string[]; folderIds?: string[];
}) {
  const sourceIds = [...new Set(input.sourceIds)];
  const folderIds = [...new Set(input.folderIds ?? [])];
  if (!sourceIds.length && !folderIds.length) throw new Error("Selecciona al menos un documento o carpeta.");
  if (sourceIds.length + folderIds.length > 100 || [...sourceIds, ...folderIds].some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new Error("La selección no es válida o supera 100 elementos.");
  }
  await prisma.$transaction(async tx => {
    const folders = new Set(folderIds);
    if (folderIds.length) {
      const all = await tx.knowledge_libraries.findMany({
        where: { workspace_id: input.workspaceId }, select: { id: true, parent_id: true },
      });
      for (let changed = true; changed;) {
        changed = false;
        for (const folder of all) if (folder.parent_id && folders.has(folder.parent_id) && !folders.has(folder.id)) {
          folders.add(folder.id); changed = true;
        }
      }
      const authorized = await tx.knowledge_libraries.count({ where: {
        id: { in: [...folders] }, ...knowledgeLibraryWriteWhere(input.userId, input.workspaceId),
      } });
      if (authorized !== folders.size) throw new Error("No tienes permiso para eliminar todas las carpetas seleccionadas.");
    }
    const target = { OR: [{ id: { in: sourceIds } }, { library_id: { in: [...folders] } }] };
    const sources = await tx.knowledge_sources.findMany({
      where: { AND: [target, knowledgeSourceOwnerWhere(input.userId, input.workspaceId)] },
      select: { id: true, knowledge_files: { select: { id: true } } },
    });
    if (sourceIds.some(id => !sources.some(source => source.id === id))) throw new Error("Documento no encontrado o sin permiso para eliminarlo.");
    if (folders.size && await tx.knowledge_sources.count({ where: {
      library_id: { in: [...folders] }, status: { not: "deleted" }, NOT: knowledgeSourceOwnerWhere(input.userId, input.workspaceId),
    } })) throw new Error("La carpeta contiene documentos de otro propietario y no puede eliminarse.");
    const files = sources.flatMap(source => source.knowledge_files);
    await tx.knowledge_files.updateMany({ where: { id: { in: files.map(file => file.id) } },
      data: { status: "deleted" } });
    const changed = await tx.knowledge_sources.updateMany({ where: {
      id: { in: sources.map(source => source.id) }, ...knowledgeSourceOwnerWhere(input.userId, input.workspaceId),
    }, data: { status: "deleted", updated_at: new Date(), updated_by_user_id: input.userId } });
    if (changed.count !== sources.length) throw new Error("La selección cambió durante el borrado. Actualiza Knowledge.");
    // Keep tombstones and Engine citations when removing the containing folder.
    if (folders.size) await tx.knowledge_sources.updateMany({
      where: { library_id: { in: [...folders] }, status: "deleted" }, data: { library_id: null },
    });
    if (folders.size) await tx.knowledge_libraries.deleteMany({ where: {
      id: { in: [...folders] }, ...knowledgeLibraryWriteWhere(input.userId, input.workspaceId),
    } });
  }, { timeout: 20000 });
}

export async function deleteKnowledgeDocumentFile(input: { userId: string; workspaceId: string; fileId: string }) {
  await prisma.$transaction(async tx => {
    const file = await tx.knowledge_files.findFirst({ where: {
      id: input.fileId, status: { not: "deleted" },
      knowledge_sources: knowledgeSourceOwnerWhere(input.userId, input.workspaceId),
    }, select: { id: true, knowledge_source_id: true } });
    if (!file) throw new Error("Documento no encontrado o sin permiso para eliminarlo.");
    await tx.knowledge_files.update({ where: { id: file.id }, data: { status: "deleted" } });
    await tx.knowledge_sources.updateMany({ where: { id: file.knowledge_source_id, status: { not: "deleted" } },
      data: { status: "stale", updated_at: new Date(), updated_by_user_id: input.userId } });
    await tx.knowledge_analysis.updateMany({ where: { knowledge_source_id: file.knowledge_source_id },
      data: { status: "stale", updated_at: new Date() } });
  });
}
