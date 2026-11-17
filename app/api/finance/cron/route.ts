import { NextResponse } from "next/server";
import { syncEveryone } from "@/lib/finance/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Sincronización diaria de los bancos de todas las personas (cron de Vercel, en vercel.json). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ synced: await syncEveryone() });
  } catch (e) {
    console.error("[finance] cron", e instanceof Error ? e.message.slice(0, 200) : e);
    return NextResponse.json({ error: "Falló la sincronización" }, { status: 500 });
  }
}
