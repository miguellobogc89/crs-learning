import { createHash, randomBytes } from "node:crypto";

/**
 * Google OAuth for the Drive connector (authorization code + PKCE, offline access). Pure helpers with an injectable
 * fetcher; no Google SDK. This is a separate grant from the app login: connecting or disconnecting Drive never
 * touches the user's session.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const SCOPES = ["openid", "email", "profile", DRIVE_SCOPE];
export const CALLBACK_PATH = "/api/connectors/google-drive/callback";
export const STATE_COOKIE = "crs_drive_oauth";
export const STATE_TTL_MS = 10 * 60 * 1000;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Drive-specific credentials, or the login ones when the same Google client is used for both. */
export function oauthConfig(origin: string, env: Record<string, string | undefined> = process.env): OAuthConfig {
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID ?? env.AUTH_GOOGLE_ID;
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET ?? env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) throw new Error("Faltan GOOGLE_DRIVE_CLIENT_ID y GOOGLE_DRIVE_CLIENT_SECRET en el entorno");
  return { clientId, clientSecret, redirectUri: env.GOOGLE_DRIVE_REDIRECT_URI ?? new URL(CALLBACK_PATH, origin).toString() };
}

/** What travels (encrypted) in the short-lived cookie between "Conectar" and Google's callback. */
export type OAuthState = { state: string; verifier: string; workspaceId: string; userId: string; returnTo: string; expiresAt: number };

export function newOAuthState(workspaceId: string, userId: string, returnTo = "/connectors", now = Date.now()): OAuthState {
  return { state: randomBytes(24).toString("base64url"), verifier: randomBytes(48).toString("base64url"), workspaceId, userId,
    returnTo: returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/connectors", expiresAt: now + STATE_TTL_MS };
}

export const challenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function authorizationUrl(config: OAuthConfig, state: OAuthState, loginHint?: string | null): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: SCOPES.join(" "),
    // offline + consent: Google returns a refresh token every time (needed after a reconnect).
    access_type: "offline", prompt: "consent", include_granted_scopes: "true",
    state: state.state, code_challenge: challenge(state.verifier), code_challenge_method: "S256",
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();
  return url.toString();
}

/** Why a callback is rejected, in words for the person (null = valid). */
export function checkCallback(params: URLSearchParams, saved: OAuthState | null, session: { userId: string; workspaceId: string }, now = Date.now()): string | null {
  const error = params.get("error");
  if (error) return error === "access_denied" ? "Has cancelado el permiso en Google" : `Google devolvió un error: ${error}`;
  if (!saved) return "La conexión ha caducado; vuelve a pulsar «Conectar»";
  if (saved.expiresAt < now) return "La conexión ha caducado; vuelve a pulsar «Conectar»";
  if (params.get("state") !== saved.state) return "La respuesta de Google no corresponde a esta conexión";
  if (saved.userId !== session.userId || saved.workspaceId !== session.workspaceId) return "Has cambiado de usuario o de espacio de trabajo durante la conexión";
  if (!params.get("code")) return "Google no devolvió el código de autorización";
  return null;
}

export type Tokens = { accessToken: string; expiresAt: Date; refreshToken: string | null; scopes: string[] };

async function tokenRequest(body: Record<string, string>, fetcher: Fetcher): Promise<Tokens> {
  const response = await fetcher(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
  const json = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; error?: string; error_description?: string };
  if (!response.ok || !json.access_token) throw new TokenError(json.error ?? `http_${response.status}`, json.error_description);
  return { accessToken: json.access_token, expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000), refreshToken: json.refresh_token ?? null, scopes: (json.scope ?? "").split(" ").filter(Boolean) };
}

export class TokenError extends Error {
  constructor(public code: string, description?: string) { super(description ? `${code}: ${description}` : code); }
  /** The grant is gone (revoked by the user, or a 7-day "Testing" token expired): only reconnecting fixes it. */
  get needsReconnect() { return this.code === "invalid_grant" || this.code === "unauthorized_client"; }
}

export const exchangeCode = (config: OAuthConfig, code: string, verifier: string, fetcher: Fetcher = fetch) =>
  tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri }, fetcher);

export const refreshAccessToken = (config: OAuthConfig, refreshToken: string, fetcher: Fetcher = fetch) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret }, fetcher);

export async function fetchAccount(accessToken: string, fetcher: Fetcher = fetch): Promise<{ email: string | null; name: string | null }> {
  const response = await fetcher(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return { email: null, name: null };
  const json = await response.json() as { email?: string; name?: string };
  return { email: json.email ?? null, name: json.name ?? null };
}

/** Best effort: the connection is removed here even if Google does not answer. */
export async function revoke(token: string, fetcher: Fetcher = fetch): Promise<boolean> {
  try {
    const response = await fetcher(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
    return response.ok;
  } catch { return false; }
}
