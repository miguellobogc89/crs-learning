import { NextResponse } from "next/server";
import { syncTenders } from "@/lib/tenders/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Lectura programada del feed de licitaciones. Vercel Cron envía `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await syncTenders(50_000));
  } catch (e) {
    console.error("[tenders] cron", e);
    return NextResponse.json({ error: "Falló la sincronización" }, { status: 500 });
  }
}
