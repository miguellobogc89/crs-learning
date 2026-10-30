import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "../crypto";
import { oauthConfig, refreshAccessToken, revoke, TokenError, type Fetcher, type Tokens } from "./oauth";
import { readSettings, type DriveSettings } from "./drive";

/** The Drive connection of a workspace: stored encrypted, refreshed on demand, removable. */
export const PROVIDER = "google_drive";
const SKEW_MS = 60_000;

export { connectorContext } from "../context";
export type { ConnectorContext } from "../context";
export type DriveConnectionView = {
  status: "disconnected" | "active" | "error"; email: string | null; name: string | null;
  connectedAt: string | null; lastError: string | null; settings: DriveSettings;
};

export async function findConnection(workspaceId: string) {
  return prisma.workspace_connections.findUnique({ where: { workspace_id_provider: { workspace_id: workspaceId, provider: PROVIDER } } });
}

export async function connectionView(workspaceId: string): Promise<DriveConnectionView> {
  const c = await findConnection(workspaceId);
  if (!c) return { status: "disconnected", email: null, name: null, connectedAt: null, lastError: null, settings: {} };
  return { status: c.status === "active" ? "active" : "error", email: c.account_email, name: c.account_name,
    connectedAt: c.updated_at.toISOString(), lastError: c.last_error, settings: readSettings(c.settings_json) };
}

/** After Google's callback. A reconnect keeps the chosen folder (same workspace, maybe another account: then it is cleared). */
export async function saveConnection(input: { workspaceId: string; userId: string; tokens: Tokens; account: { email: string | null; name: string | null } }) {
  const { workspaceId, userId, tokens, account } = input;
  if (!tokens.refreshToken) throw new Error("Google no devolvió un token de acceso permanente; vuelve a conectar");
  const previous = await findConnection(workspaceId);
  const sameAccount = previous?.account_email && previous.account_email === account.email;
  const data = { status: "active", account_email: account.email, account_name: account.name, scopes: tokens.scopes.join(" "),
    refresh_token_enc: encrypt(tokens.refreshToken), access_token_enc: encrypt(tokens.accessToken), access_token_expires_at: tokens.expiresAt,
    last_error: null, connected_by_user_id: userId, updated_at: new Date(),
    settings_json: (sameAccount ? previous!.settings_json ?? {} : {}) as Prisma.InputJsonValue };
  await prisma.workspace_connections.upsert({ where: { workspace_id_provider: { workspace_id: workspaceId, provider: PROVIDER } },
    create: { workspace_id: workspaceId, provider: PROVIDER, ...data }, update: data });
}

/** A valid access token (refreshed when it is about to expire). A dead grant marks the connection as needing a reconnect. */
export async function accessToken(workspaceId: string, origin: string, fetcher: Fetcher = fetch): Promise<string> {
  const c = await findConnection(workspaceId);
  if (!c || !c.refresh_token_enc) throw new ConnectionError("Drive no está conectado");
  if (c.status !== "active") throw new ConnectionError(c.last_error ?? "Hay que volver a conectar Drive");
  if (c.access_token_enc && c.access_token_expires_at && c.access_token_expires_at.getTime() - SKEW_MS > Date.now()) return decrypt(c.access_token_enc);
  try {
    const tokens = await refreshAccessToken(oauthConfig(origin), decrypt(c.refresh_token_enc), fetcher);
    await prisma.workspace_connections.update({ where: { id: c.id }, data: { access_token_enc: encrypt(tokens.accessToken), access_token_expires_at: tokens.expiresAt,
      ...(tokens.refreshToken ? { refresh_token_enc: encrypt(tokens.refreshToken) } : {}), updated_at: new Date() } });
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof TokenError && error.needsReconnect) {
      const message = "Google ha caducado o retirado el permiso. Vuelve a conectar Drive.";
      await prisma.workspace_connections.update({ where: { id: c.id }, data: { status: "error", last_error: message, access_token_enc: null, updated_at: new Date() } });
      throw new ConnectionError(message);
    }
    throw error;
  }
}

/** Merges into the stored settings (one key replaced, the others kept). Changing the folder forgets the last sync. */
export async function saveSettings(workspaceId: string, settings: DriveSettings) {
  const current = readSettings((await findConnection(workspaceId))?.settings_json);
  const next: DriveSettings = { ...current, ...settings };
  if (settings.folder && settings.folder.id !== current.folder?.id) delete next.lastSync;
  // A raw merge keeps keys this code does not know (e.g. the sync lease).
  await prisma.$executeRaw(Prisma.sql`UPDATE public.workspace_connections SET settings_json = (settings_json - 'lastSync') || ${JSON.stringify(next)}::jsonb, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND provider = ${PROVIDER}`);
}

/** One sync at a time per workspace (also across app instances): a lease in the connection that expires on its own. */
export async function acquireSyncLease(workspaceId: string, minutes = 5): Promise<boolean> {
  const rows = await prisma.$executeRaw(Prisma.sql`UPDATE public.workspace_connections
    SET settings_json = settings_json || jsonb_build_object('syncLeaseUntil', (now() + make_interval(mins => ${minutes}))::text)
    WHERE workspace_id = ${workspaceId}::uuid AND provider = ${PROVIDER}
      AND (settings_json->>'syncLeaseUntil' IS NULL OR (settings_json->>'syncLeaseUntil')::timestamptz < now())`);
  return rows === 1;
}
export async function releaseSyncLease(workspaceId: string) {
  await prisma.$executeRaw(Prisma.sql`UPDATE public.workspace_connections SET settings_json = settings_json - 'syncLeaseUntil'
    WHERE workspace_id = ${workspaceId}::uuid AND provider = ${PROVIDER}`);
}

/** Revokes the grant at Google (best effort) and deletes the connection and its tokens. */
export async function disconnect(workspaceId: string, fetcher: Fetcher = fetch): Promise<{ revoked: boolean }> {
  const c = await findConnection(workspaceId);
  if (!c) return { revoked: false };
  let revoked = false;
  if (c.refresh_token_enc) { try { revoked = await revoke(decrypt(c.refresh_token_enc), fetcher); } catch { revoked = false; } }
  await prisma.workspace_connections.delete({ where: { id: c.id } });
  return { revoked };
}

export class ConnectionError extends Error {}
