import { NextResponse } from "next/server";
import { refreshLive } from "@/lib/trading/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Precio en directo y ejecución de pendientes en la apertura, sin que nadie tenga la app abierta.
 * Pensado para un cron cada 10-15 min en horario de bolsa (p. ej. «*\/15 7-16 * * 1-5» en UTC);
 * Vercel Hobby solo permite crons diarios, por eso no está en vercel.json.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await refreshLive(50_000, true));
  } catch (e) {
    console.error("[trading] cron live", e);
    return NextResponse.json({ error: "Falló la revisión en directo" }, { status: 500 });
  }
}
