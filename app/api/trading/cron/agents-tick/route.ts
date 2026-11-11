import { NextResponse } from "next/server";
import { maybeRunAgents } from "@/lib/trading/agents/service";
import { refreshLive } from "@/lib/trading/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Precio en directo y, si le toca a algún agente, su reunión. Pensado para un cron cada 10-15 min
 * (p. ej. «*\/10 * * * *»); Vercel Hobby solo permite crons diarios, por eso no está en vercel.json.
 * Sin cron, lo mismo se hace cuando alguien abre el módulo de Trading.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const live = await refreshLive(10_000, true);
    const agents = await maybeRunAgents();
    return NextResponse.json({ live, agents });
  } catch (e) {
    console.error("[trading] cron agents-tick", e);
    return NextResponse.json({ error: "Falló la revisión" }, { status: 500 });
  }
}
