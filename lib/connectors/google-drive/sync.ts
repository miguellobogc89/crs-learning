import { prisma } from "@/lib/prisma";
import { readKnowledgeFile } from "@/lib/storage/knowledge-storage";
import { EXTRACTOR_UPLOAD_TYPE } from "@/lib/knowledge/intake/extractor/contract";
import { contentHash, createIntakeBatch, type IntakeDocument } from "@/lib/knowledge/intake/create-batch";
import { accessToken, acquireSyncLease, ConnectionError, findConnection, PROVIDER, releaseSyncLease, saveSettings } from "./connection";
import { downloadFile, DriveError, listImportableFiles, readSettings, type DriveFile } from "./drive";
import { importName, MAX_DOWNLOADS, pendingFiles, skipBeforeDownload, type Outcome, type Seen, type SyncSummary } from "./sync-plan";
import type { Fetcher } from "./oauth";

/**
 * "Sincronizar ahora": brings up to `limit` NEW documents from the chosen Drive folder into ONE intake batch.
 * A document is new when no batch of the workspace already has the same content (SHA-256), whatever its name or
 * origin (manual upload included). Every file looked at is recorded, so it is never downloaded again. Nothing is
 * saved to the user's data here: the batch goes through the pipeline and stops before "Guardar".
 */
const LEGACY_HASH_LIMIT = 300;

export async function workspaceLibrary(workspaceId: string, userId: string) {
  return prisma.knowledge_libraries.findFirst({ where: { workspace_id: workspaceId, owner_user_id: userId, parent_id: null }, select: { id: true }, orderBy: { created_at: "asc" } });
}

/** Content hashes of every document already in an intake batch of the workspace (older files are hashed once). */
async function knownHashes(workspaceId: string): Promise<Set<string>> {
  const where = { knowledge_imports: { upload_type: EXTRACTOR_UPLOAD_TYPE, knowledge_libraries: { workspace_id: workspaceId } } };
  const legacy = await prisma.knowledge_import_files.findMany({ where: { ...where, content_hash: null, storage_path: { not: null } },
    select: { id: true, storage_path: true }, take: LEGACY_HASH_LIMIT });
  for (const file of legacy) {
    try {
      const hash = contentHash(await readKnowledgeFile(file.storage_path!));
      await prisma.knowledge_import_files.updateMany({ where: { id: file.id, content_hash: null }, data: { content_hash: hash } });
    } catch { /* unreadable: never treated as a duplicate */ }
  }
  const [files, synced] = await Promise.all([
    prisma.knowledge_import_files.findMany({ where: { ...where, content_hash: { not: null } }, select: { content_hash: true } }),
    prisma.connector_synced_files.findMany({ where: { workspace_id: workspaceId, content_hash: { not: null } }, select: { content_hash: true } }),
  ]);
  return new Set<string>([...files, ...synced].map((f: { content_hash: string | null }) => f.content_hash!));
}

async function seenFiles(workspaceId: string): Promise<Map<string, Seen>> {
  const rows = await prisma.connector_synced_files.findMany({ where: { workspace_id: workspaceId, provider: PROVIDER }, select: { external_id: true, external_md5: true } });
  return new Map(rows.map((r: { external_id: string; external_md5: string | null }) => [r.external_id, { md5: r.external_md5 }]));
}

type Record_ = { file: DriveFile; outcome: Outcome; detail?: string; hash?: string; importFileId?: string };

async function record(workspaceId: string, userId: string, importId: string | null, rows: Record_[]) {
  for (const r of rows) {
    const data = { external_name: r.file.name, external_md5: r.file.md5, external_modified_at: r.file.modifiedAt ? new Date(r.file.modifiedAt) : null,
      content_hash: r.hash ?? null, outcome: r.outcome, detail: r.detail ?? null, import_id: r.outcome === "importado" ? importId : null,
      import_file_id: r.importFileId ?? null, synced_by_user_id: userId, synced_at: new Date() };
    await prisma.connector_synced_files.upsert({ where: { workspace_id_provider_external_id: { workspace_id: workspaceId, provider: PROVIDER, external_id: r.file.id } },
      create: { workspace_id: workspaceId, provider: PROVIDER, external_id: r.file.id, ...data }, update: data });
  }
}

/** How many documents of the folder have not been brought yet (no download). */
export async function pendingCount(workspaceId: string, origin: string, fetcher: Fetcher = fetch) {
  const folder = readSettings((await findConnection(workspaceId))?.settings_json).folder;
  if (!folder) return null;
  const token = await accessToken(workspaceId, origin, fetcher);
  const [{ files, capped }, seen] = await Promise.all([listImportableFiles(token, folder.id, fetcher), seenFiles(workspaceId)]);
  return { pendientes: pendingFiles(files, seen).length, listaIncompleta: capped };
}

/** `only`: the Drive file ids chosen on the "Documentos de Drive" screen (otherwise, the most recent pending ones). */
export async function syncDrive(input: { workspaceId: string; userId: string; origin: string; limit: number; only?: string[]; fetcher?: Fetcher }): Promise<SyncSummary> {
  const { workspaceId, userId, origin, limit } = input;
  const fetcher = input.fetcher ?? fetch;
  const folder = readSettings((await findConnection(workspaceId))?.settings_json).folder;
  if (!folder) throw new ConnectionError("Elige primero una carpeta de Drive");
  const library = await workspaceLibrary(workspaceId, userId);
  if (!library) throw new ConnectionError("Crea primero una biblioteca propia en Conocimiento: las importaciones se guardan allí");
  if (!(await acquireSyncLease(workspaceId))) throw new ConnectionError("Ya hay una sincronización en marcha; espera a que termine");
  try {
    const token = await accessToken(workspaceId, origin, fetcher);
    const [{ files, capped }, seen, known] = await Promise.all([listImportableFiles(token, folder.id, fetcher), seenFiles(workspaceId), knownHashes(workspaceId)]);
    const chosen = input.only ? new Set(input.only) : null;
    const pending = pendingFiles(files, seen).filter(f => !chosen || chosen.has(f.id));
    const looked: Record_[] = [];
    const documents: (IntakeDocument & { file: DriveFile; hash: string })[] = [];
    let downloads = 0, index = 0;
    for (; index < pending.length && documents.length < limit && downloads < MAX_DOWNLOADS; index++) {
      const file = pending[index];
      const skip = skipBeforeDownload(file);
      if (skip) { looked.push({ file, outcome: "omitido", detail: skip }); continue; }
      downloads++;
      let content: Uint8Array;
      try { content = await downloadFile(token, file.id, fetcher); }
      catch (error) {
        if (error instanceof DriveError && (error.status === 401 || error.status === 429 || error.status >= 500)) throw error;
        looked.push({ file, outcome: "omitido", detail: error instanceof Error ? error.message : "No se pudo descargar" });
        continue;
      }
      const hash = contentHash(content);
      if (known.has(hash)) { looked.push({ file, outcome: "duplicado", hash, detail: "Ya estaba importado (mismo contenido)" }); continue; }
      known.add(hash);
      documents.push({ fileName: importName(file), relativePath: `Drive/${folder.name}/${importName(file)}`, mimeType: file.mimeType, content, file, hash });
    }
    let loteId: string | null = null;
    if (documents.length) {
      const batch = await createIntakeBatch({ libraryId: library.id, userId, documents, originalName: `Google Drive · ${folder.name}` });
      loteId = batch.id;
      documents.forEach((d, i) => looked.push({ file: d.file, outcome: "importado", hash: d.hash, importFileId: batch.files[i]?.id }));
    }
    await record(workspaceId, userId, loteId, looked);
    const summary: SyncSummary = { loteId, libraryId: library.id, importados: documents.length,
      duplicados: looked.filter(r => r.outcome === "duplicado").length,
      omitidos: looked.filter(r => r.outcome === "omitido").map(r => ({ nombre: r.file.name, motivo: r.detail ?? "" })),
      pendientes: pending.length - index, listaIncompleta: capped };
    await saveSettings(workspaceId, { lastSync: { at: new Date().toISOString(), loteId, importados: summary.importados, duplicados: summary.duplicados, omitidos: summary.omitidos.length } });
    return summary;
  } finally {
    await releaseSyncLease(workspaceId);
  }
}
