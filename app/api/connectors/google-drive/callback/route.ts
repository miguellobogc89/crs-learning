import { NextResponse } from "next/server";
import { decrypt } from "@/lib/connectors/crypto";
import { connectorContext, saveConnection } from "@/lib/connectors/google-drive/connection";
import { CALLBACK_PATH, checkCallback, DRIVE_SCOPE, exchangeCode, fetchAccount, oauthConfig, STATE_COOKIE, type OAuthState } from "@/lib/connectors/google-drive/oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  try { return JSON.parse(decrypt(raw)) as OAuthState; } catch { return null; }
}

/** Google returns here after the consent screen: checks the state, exchanges the code and stores the connection. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const saved = readState(request.headers.get("cookie")?.split(/;\s*/).find(c => c.startsWith(STATE_COOKIE + "="))?.slice(STATE_COOKIE.length + 1));
  const finish = (query: string) => {
    const response = NextResponse.redirect(new URL(`${saved?.returnTo ?? "/connectors"}?${query}`, origin));
    response.cookies.set(STATE_COOKIE, "", { path: CALLBACK_PATH, maxAge: 0 });
    return response;
  };
  const fail = (message: string) => finish(`drive=error&message=${encodeURIComponent(message)}`);
  const ctx = await connectorContext();
  if (!ctx) return NextResponse.redirect(new URL("/", origin));
  const problem = checkCallback(url.searchParams, saved, { userId: ctx.userId, workspaceId: ctx.workspaceId });
  if (problem) return fail(problem);
  if (!ctx.canManage) return fail("Solo el propietario o un administrador del espacio de trabajo puede conectar Drive");
  try {
    const config = oauthConfig(origin);
    const tokens = await exchangeCode(config, url.searchParams.get("code")!, saved!.verifier);
    if (!tokens.scopes.includes(DRIVE_SCOPE)) return fail("No se concedió el permiso para ver tus archivos de Drive. Vuelve a conectar y marca esa casilla.");
    const account = await fetchAccount(tokens.accessToken);
    await saveConnection({ workspaceId: ctx.workspaceId, userId: ctx.userId, tokens, account });
    return finish("drive=connected");
  } catch (error) {
    console.error("[connectors] google drive callback", error instanceof Error ? error.message : error);
    return fail(error instanceof Error && /redirect_uri_mismatch/.test(error.message)
      ? "La URI de redirección no está autorizada en Google Cloud (revisa las credenciales)"
      : "No se pudo completar la conexión con Google. Inténtalo de nuevo.");
  }
}
