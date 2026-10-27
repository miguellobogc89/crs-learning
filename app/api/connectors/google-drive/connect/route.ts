import { NextResponse } from "next/server";
import { encrypt } from "@/lib/connectors/crypto";
import { connectorContext } from "@/lib/connectors/google-drive/connection";
import { authorizationUrl, CALLBACK_PATH, newOAuthState, oauthConfig, STATE_COOKIE, STATE_TTL_MS } from "@/lib/connectors/google-drive/oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (origin: string, message: string) =>
  NextResponse.redirect(new URL(`/connectors?drive=error&message=${encodeURIComponent(message)}`, origin));

/** "Conectar": opens Google's consent screen. State, PKCE verifier, user and workspace travel in an encrypted cookie. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const ctx = await connectorContext();
  if (!ctx) return NextResponse.redirect(new URL("/", origin));
  if (!ctx.canManage) return back(origin, "Solo el propietario o un administrador del espacio de trabajo puede conectar Drive");
  try {
    const state = newOAuthState(ctx.workspaceId, ctx.userId);
    const response = NextResponse.redirect(authorizationUrl(oauthConfig(origin), state));
    response.cookies.set(STATE_COOKIE, encrypt(JSON.stringify(state)), { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax",
      path: CALLBACK_PATH, maxAge: STATE_TTL_MS / 1000 });
    return response;
  } catch (error) {
    return back(origin, error instanceof Error ? error.message : "No se pudo iniciar la conexión");
  }
}
