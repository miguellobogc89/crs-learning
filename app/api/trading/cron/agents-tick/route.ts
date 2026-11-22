import { NextResponse } from "next/server";
import { applyAiSettings } from "@/lib/ai/usage";
import { maybeRunAgents } from "@/lib/trading/agents/service";
import { refreshLive } from "@/lib/trading/live";
import { kamikazeTick } from "@/lib/trading/kamikaze/engine";
import { runMirrors } from "@/lib/trading/mirror/service";
import { runManual } from "@/lib/trading/manual/service";
import { chipTick } from "@/lib/trading/chip/engine";
import { pruneNotifications, syncHealth } from "@/lib/trading/notifications";
import { syncTradeEvents } from "@/lib/trading/trade-events";
import { deliverPending } from "@/lib/push/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Revisión 24/7 (cron de Vercel cada 5 minutos, en vercel.json): precio en directo, FARO y sus
 * escáneres, los agentes, las copias y tus operaciones. Abrir el módulo de Trading también la lanza.
 */
export async function GET(req: Request) {
  await applyAiSettings();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const live = await refreshLive(10_000, true);
    const kamikazes = await kamikazeTick();
    // Las copias van justo detrás de los kamikazes (entran y salen en el mismo minuto que ellos) y
    // antes de las reuniones de los agentes clásicos, que pueden tardar.
    const mirrors = await runMirrors().catch((e) => ({ mirrors: 0, actions: [`error: ${e instanceof Error ? e.message : e}`] }));
    // Mis operaciones: stop y objetivo de lo que compraste tú.
    const manual = await runManual().catch((e) => ({ open: 0, actions: [`error: ${e instanceof Error ? e.message : e}`] }));
    // Agentes de dos modos: una decisión al día, con la vela de ayer cerrada (antes de las copias del exchange).
    const chips = await chipTick().catch((e) => [{ agent: "chip", skipped: e instanceof Error ? e.message : "error", actions: [] }]);
    const agents = await maybeRunAgents();
    // Avisos: qué se ha roto (o arreglado) desde la última revisión.
    // Avisos de Mi cartera: compras, ventas y movimientos del stop de lo que tienes con dinero real.
    const trades = await syncTradeEvents().catch((e) => ({ error: e instanceof Error ? e.message.slice(0, 200) : "error" }));
    const health = await syncHealth().catch((e) => ({ error: e instanceof Error ? e.message.slice(0, 200) : "error" }));
    // Notificaciones push: lo nuevo de la campana, al móvil.
    const push = await deliverPending().catch((e) => ({ error: e instanceof Error ? e.message.slice(0, 200) : "error" }));
    if (new Date().getUTCHours() === 3 && new Date().getUTCMinutes() < 5) await pruneNotifications().catch(() => undefined);
    return NextResponse.json({ live, kamikazes, chips, mirrors, manual, agents, trades, health, push });
  } catch (e) {
    console.error("[trading] cron agents-tick", e);
    return NextResponse.json({ error: "Falló la revisión" }, { status: 500 });
  }
}
