import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { GMAIL_CALLBACK, GMAIL_STATE_COOKIE, gmailFinish, syncGmail } from "@/lib/finance/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Vuelta de Google: guarda la conexión y hace la primera lectura del correo. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.redirect(new URL("/", origin));
  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(GMAIL_STATE_COOKIE + "="))?.slice(GMAIL_STATE_COOKIE.length + 1);
  let query = "gmail=connected";
  try {
    await gmailFinish(origin, url.searchParams, cookie ? decodeURIComponent(cookie) : undefined, userId);
    await syncGmail(userId, origin).catch((e) => console.error("[finance] primera lectura de Gmail", e instanceof Error ? e.message : e));
  } catch (e) {
    const message = e instanceof Error && /redirect_uri_mismatch/.test(e.message) ? "La URI de redirección no está autorizada en Google Cloud" : e instanceof Error ? e.message : "No se pudo conectar Gmail";
    query = `gmail=error&message=${encodeURIComponent(message)}`;
  }
  const res = NextResponse.redirect(new URL(`/finanzas/conexiones?${query}`, origin));
  res.cookies.set(GMAIL_STATE_COOKIE, "", { path: GMAIL_CALLBACK, maxAge: 0 });
  return res;
}
