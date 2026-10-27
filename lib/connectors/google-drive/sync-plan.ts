import type { DriveFile } from "./drive";

/**
 * Pure decisions of a Drive sync: which files are new, which are skipped without downloading, the file name the
 * importer sees, and how far a sync goes (a few NEW documents per run; duplicates do not count but are bounded).
 */
export const SYNC_LIMIT = 10;
export const SYNC_LIMIT_MAX = 50;
export const MAX_DOWNLOADS = 40;
const MAX_BYTES = 20 * 1024 * 1024;
const EXT: Record<string, string> = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

export type Seen = { md5: string | null };
export type Outcome = "importado" | "duplicado" | "omitido";

export const syncLimit = (value: unknown) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, SYNC_LIMIT_MAX) : SYNC_LIMIT;
};

/** The importer decides by extension: a Drive name without one gets it from the MIME type. */
export function importName(file: Pick<DriveFile, "name" | "mimeType">): string {
  const ext = EXT[file.mimeType];
  const name = file.name.trim() || "documento";
  if (!ext) return name;
  const lower = name.toLowerCase();
  return lower.endsWith(ext) || (ext === ".jpg" && lower.endsWith(".jpeg")) ? name : `${name}${ext}`;
}

/** Files never seen, or seen with other content (Drive md5 changed), most recent first (the listing order). */
export function pendingFiles(files: DriveFile[], seen: Map<string, Seen>): DriveFile[] {
  return files.filter(f => {
    const s = seen.get(f.id);
    return !s || (!!f.md5 && !!s.md5 && f.md5 !== s.md5);
  });
}

/** Reason to skip a file without downloading it (null = download it). */
export function skipBeforeDownload(file: DriveFile): string | null {
  if (!EXT[file.mimeType]) return "Formato que todavía no se lee";
  if (file.size !== null && file.size > MAX_BYTES) return "Ocupa más de 20 MB";
  if (file.size === 0) return "Archivo vacío";
  return null;
}

export type SyncSummary = {
  loteId: string | null; libraryId: string | null;
  importados: number; duplicados: number; omitidos: { nombre: string; motivo: string }[];
  pendientes: number; listaIncompleta: boolean;
};
