import { NextResponse } from "next/server";
import { maybeRunAgents } from "@/lib/trading/agents/service";
import { refreshLive } from "@/lib/trading/live";
import { kamikazeTick } from "@/lib/trading/kamikaze/engine";
import { runMirrors } from "@/lib/trading/mirror/service";

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
    const kamikazes = await kamikazeTick();
    // Las copias van justo detrás de los kamikazes (entran y salen en el mismo minuto que ellos) y
    // antes de las reuniones de los agentes clásicos, que pueden tardar.
    const mirrors = await runMirrors().catch((e) => ({ mirrors: 0, actions: [`error: ${e instanceof Error ? e.message : e}`] }));
    const agents = await maybeRunAgents();
    return NextResponse.json({ live, kamikazes, mirrors, agents });
  } catch (e) {
    console.error("[trading] cron agents-tick", e);
    return NextResponse.json({ error: "Falló la revisión" }, { status: 500 });
  }
}
