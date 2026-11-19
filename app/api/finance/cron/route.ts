import { NextResponse } from "next/server";
import { applyAiSettings } from "@/lib/ai/usage";
import { syncEveryone } from "@/lib/finance/sync";
import { gmailUsers, syncGmail } from "@/lib/finance/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Sincronización diaria de los bancos de todas las personas (cron de Vercel, en vercel.json). */
export async function GET(req: Request) {
  await applyAiSettings();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const synced = await syncEveryone();
    // Correo de suscripciones de quien tenga Gmail conectado.
    const origin = new URL(req.url).origin;
    const gmail: Record<string, unknown> = {};
    for (const uid of await gmailUsers().catch(() => [])) gmail[uid] = await syncGmail(uid, origin).catch((e) => (e instanceof Error ? e.message : "error"));
    return NextResponse.json({ synced, gmail });
  } catch (e) {
    console.error("[finance] cron", e instanceof Error ? e.message.slice(0, 200) : e);
    return NextResponse.json({ error: "Falló la sincronización" }, { status: 500 });
  }
}
