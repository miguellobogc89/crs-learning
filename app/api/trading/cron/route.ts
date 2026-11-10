import { NextResponse } from "next/server";
import { runDaily } from "@/lib/trading/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cierre diario: cotizaciones, backtest y carteras virtuales. Vercel Cron envía `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await runDaily(50_000));
  } catch (e) {
    console.error("[trading] cron", e);
    return NextResponse.json({ error: "Falló el proceso diario" }, { status: 500 });
  }
}
