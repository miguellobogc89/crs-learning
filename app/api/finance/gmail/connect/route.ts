import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { GMAIL_CALLBACK, GMAIL_STATE_COOKIE, gmailStart } from "@/lib/finance/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** «Conectar Gmail»: lleva a la pantalla de permisos de Google (solo lectura del correo). */
export async function GET(req: Request) {
  const userId = (await auth())?.user?.id;
  const origin = new URL(req.url).origin;
  if (!userId) return NextResponse.redirect(new URL("/", origin));
  try {
    const { url, cookie } = gmailStart(origin, userId);
    const res = NextResponse.redirect(url);
    res.cookies.set(GMAIL_STATE_COOKIE, cookie, { path: GMAIL_CALLBACK, httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", maxAge: 600 });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo iniciar la conexión";
    return NextResponse.redirect(new URL(`/finanzas/conexiones?gmail=error&message=${encodeURIComponent(message)}`, origin));
  }
}
