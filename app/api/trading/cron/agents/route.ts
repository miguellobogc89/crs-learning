import { NextResponse } from "next/server";
import { runAgentsDaily } from "@/lib/trading/agents/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reunión diaria de los agentes, después del cierre (el cron de datos va antes). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await runAgentsDaily());
  } catch (e) {
    console.error("[trading] cron agentes", e);
    return NextResponse.json({ error: "Falló la reunión de los agentes" }, { status: 500 });
  }
}
