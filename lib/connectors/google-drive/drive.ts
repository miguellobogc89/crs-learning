import type { Fetcher } from "./oauth";

/**
 * Read-only Drive calls used by the connector: browse folders, check a folder and count the documents the importer
 * can read in it. Pure request building and response mapping with an injectable fetcher.
 */
const API = "https://www.googleapis.com/drive/v3/files";
export const FOLDER_MIME = "application/vnd.google-apps.folder";
/** Same formats as the importer (PDF and images). Google Docs/Sheets come later (they need an export). */
export const IMPORTABLE_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
export const COUNT_LIMIT = 1000;

export type DriveFolder = { id: string; name: string; shared: boolean };
export type FolderSetting = { id: string; name: string; selectedAt: string; selectedBy: string };
export type LastSync = { at: string; loteId: string | null; importados: number; duplicados: number; omitidos: number };
export type DriveSettings = { folder?: FolderSetting; lastSync?: LastSync };

export class DriveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const escapeQuery = (v: string) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
/** Drive ids are [A-Za-z0-9_-]; anything else is rejected before it reaches a query. */
export const validId = (id: string) => id === "root" || /^[A-Za-z0-9_-]{5,200}$/.test(id);

/** "root" = Mi unidad; "shared" = Compartido conmigo; otherwise the subfolders of that folder. */
export function folderListQuery(parent: string, search?: string): URLSearchParams {
  if (parent !== "shared" && !validId(parent)) throw new DriveError(400, "Carpeta no válida");
  const where = [`mimeType = '${FOLDER_MIME}'`, "trashed = false", parent === "shared" ? "sharedWithMe = true" : `'${parent}' in parents`];
  if (search?.trim()) where.push(`name contains '${escapeQuery(search.trim().slice(0, 100))}'`);
  return new URLSearchParams({ q: where.join(" and "), fields: "nextPageToken, files(id, name, ownedByMe)", orderBy: "name_natural", pageSize: "200",
    supportsAllDrives: "true", includeItemsFromAllDrives: "true", spaces: "drive" });
}

async function call<T>(url: string, accessToken: string, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new DriveError(response.status, response.status === 404 ? "No se encuentra la carpeta en Drive (¿se borró o ya no tienes acceso?)"
      : response.status === 403 ? `Drive no permite el acceso: ${body.error?.message ?? "permiso denegado"}` : `Drive respondió ${response.status}: ${body.error?.message ?? ""}`.trim());
  }
  return response.json() as Promise<T>;
}

export async function listFolders(accessToken: string, parent: string, search: string | undefined, fetcher: Fetcher = fetch): Promise<{ folders: DriveFolder[]; more: boolean }> {
  const json = await call<{ files?: { id: string; name: string; ownedByMe?: boolean }[]; nextPageToken?: string }>(`${API}?${folderListQuery(parent, search)}`, accessToken, fetcher);
  return { folders: (json.files ?? []).map(f => ({ id: f.id, name: f.name, shared: f.ownedByMe === false })), more: !!json.nextPageToken };
}

/** The folder itself (to confirm it exists, is a folder and to show its real name and location). */
export async function getFolder(accessToken: string, id: string, fetcher: Fetcher = fetch): Promise<{ id: string; name: string; parents: string[] }> {
  if (!validId(id)) throw new DriveError(400, "Carpeta no válida");
  const json = await call<{ id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean }>(
    `${API}/${encodeURIComponent(id)}?${new URLSearchParams({ fields: "id, name, mimeType, parents, trashed", supportsAllDrives: "true" })}`, accessToken, fetcher);
  if (json.mimeType !== FOLDER_MIME) throw new DriveError(400, "Lo elegido no es una carpeta");
  if (json.trashed) throw new DriveError(400, "La carpeta está en la papelera");
  return { id: json.id, name: id === "root" ? "Mi unidad" : json.name, parents: json.parents ?? [] };
}

/** Documents directly inside the folder that the importer can read, plus the ones it cannot (for the message). */
export async function countDocuments(accessToken: string, folderId: string, fetcher: Fetcher = fetch): Promise<{ importable: number; other: number; capped: boolean }> {
  if (!validId(folderId)) throw new DriveError(400, "Carpeta no válida");
  let importable = 0, other = 0, pageToken: string | undefined, seen = 0;
  do {
    const params = new URLSearchParams({ q: `'${folderId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`, fields: "nextPageToken, files(mimeType)",
      pageSize: "1000", supportsAllDrives: "true", includeItemsFromAllDrives: "true", ...(pageToken ? { pageToken } : {}) });
    const json = await call<{ files?: { mimeType: string }[]; nextPageToken?: string }>(`${API}?${params}`, accessToken, fetcher);
    for (const f of json.files ?? []) (IMPORTABLE_MIME.includes(f.mimeType) ? importable++ : other++);
    seen += json.files?.length ?? 0;
    pageToken = json.nextPageToken;
  } while (pageToken && seen < COUNT_LIMIT);
  return { importable, other, capped: !!pageToken };
}

export function readSettings(value: unknown): DriveSettings {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const f = v.folder as Record<string, unknown> | undefined;
  const l = v.lastSync as Record<string, unknown> | undefined;
  return {
    ...(f && typeof f.id === "string" && typeof f.name === "string" ? { folder: { id: f.id, name: f.name, selectedAt: String(f.selectedAt ?? ""), selectedBy: String(f.selectedBy ?? "") } } : {}),
    ...(l && typeof l.at === "string" ? { lastSync: { at: l.at, loteId: typeof l.loteId === "string" ? l.loteId : null,
      importados: Number(l.importados) || 0, duplicados: Number(l.duplicados) || 0, omitidos: Number(l.omitidos) || 0 } } : {}),
  };
}

export type DriveFile = { id: string; name: string; mimeType: string; size: number | null; md5: string | null; modifiedAt: string | null };
export const LIST_LIMIT = 2000;

/** Readable documents directly in the folder, most recently modified first (up to LIST_LIMIT). */
export async function listImportableFiles(accessToken: string, folderId: string, fetcher: Fetcher = fetch): Promise<{ files: DriveFile[]; capped: boolean }> {
  if (!validId(folderId)) throw new DriveError(400, "Carpeta no válida");
  const mimes = IMPORTABLE_MIME.map(m => `mimeType = '${m}'`).join(" or ");
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: `'${folderId}' in parents and trashed = false and (${mimes})`, orderBy: "modifiedTime desc",
      fields: "nextPageToken, files(id, name, mimeType, size, md5Checksum, modifiedTime)", pageSize: "1000",
      supportsAllDrives: "true", includeItemsFromAllDrives: "true", ...(pageToken ? { pageToken } : {}) });
    const json = await call<{ files?: { id: string; name: string; mimeType: string; size?: string; md5Checksum?: string; modifiedTime?: string }[]; nextPageToken?: string }>(`${API}?${params}`, accessToken, fetcher);
    for (const f of json.files ?? []) files.push({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ? Number(f.size) : null, md5: f.md5Checksum ?? null, modifiedAt: f.modifiedTime ?? null });
    pageToken = json.nextPageToken;
  } while (pageToken && files.length < LIST_LIMIT);
  return { files, capped: !!pageToken };
}

/** The bytes of a file (read-only). */
export async function downloadFile(accessToken: string, id: string, fetcher: Fetcher = fetch): Promise<Uint8Array> {
  if (!validId(id)) throw new DriveError(400, "Archivo no válido");
  const response = await fetcher(`${API}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new DriveError(response.status, response.status === 403 ? "Drive no permite descargar este archivo" : `Drive respondió ${response.status} al descargar`);
  return new Uint8Array(await response.arrayBuffer());
}
