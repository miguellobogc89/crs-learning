// lib/trading/notifications.ts
// Avisos de Trading (17/11/2026). Cada pocos minutos (con la revisión de los agentes y con el vigilante
// externo de GitHub) se mira qué está roto (health.ts): un problema nuevo crea un aviso; mientras siga
// abierto no se repite; cuando se arregla, se cierra y se añade un aviso de «resuelto».
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { brokerRegistry } from "@/lib/brokers/providers";
import { usageToday } from "./ai";
import { healthProblems, type Problem } from "./health";
import { agentByKey } from "./agents/roster";
import { kamikazeByKey } from "./kamikaze/roster";
import { chipByKey } from "./chip/roster";

export type Notification = {
  id: string;
  createdAt: string;
  key: string;
  level: "error" | "aviso" | "ok";
  title: string;
  body: string | null;
  href: string | null;
  resolvedAt: string | null;
  readAt: string | null;
};

const agentName = (key: string) => agentByKey(key)?.name ?? kamikazeByKey(key)?.name ?? chipByKey(key)?.name ?? key;

/** Lo que está roto ahora mismo. */
export async function currentProblems(): Promise<Problem[]> {
  const [faro, tick, conns, ai, legs] = await Promise.all([
    prisma.trading_faro_runs.findFirst({ where: { status: "ok", scope: "crypto" }, orderBy: { created_at: "desc" }, select: { created_at: true } }),
    prisma.trading_kamikaze_rounds.aggregate({ where: { status: "en_curso" }, _max: { last_note_at: true } }),
    prisma.broker_connections.findMany({ where: { status: "error" }, select: { provider: true, last_error: true } }),
    usageToday(),
    prisma.trading_mirror_legs.findMany({ where: { mode: "real", status: "error" }, include: { mirror: { select: { agent: true } } }, take: 20 }),
  ]);
  return healthProblems({
    now: Date.now(),
    lastFaroAt: faro?.created_at.getTime() ?? null,
    lastTickAt: tick._max.last_note_at?.getTime() ?? null,
    brokers: conns.map((c) => ({ provider: c.provider, name: brokerRegistry.list().find((p) => p.id === c.provider)?.name ?? c.provider, error: c.last_error ?? "No se pudo conectar" })),
    ai: { calls: ai.calls, limit: ai.limit },
    mirrorErrors: legs.map((l) => ({ id: l.id, agent: agentName(l.mirror.agent), symbol: l.symbol, note: l.note })),
  });
}

/** Compara lo roto con los avisos abiertos: crea los nuevos y cierra (con aviso de «resuelto») los arreglados. */
export async function syncHealth(): Promise<{ problems: Problem[]; opened: number; resolved: number }> {
  const problems = await currentProblems();
  const open = await prisma.$queryRaw<{ id: string; key: string; title: string }[]>(Prisma.sql`
    SELECT id::text AS id, key, title FROM public.trading_notifications WHERE resolved_at IS NULL AND level <> 'ok'`);
  const openKeys = new Set(open.map((o) => o.key));
  const now = new Set(problems.map((p) => p.key));
  let opened = 0;
  let resolved = 0;
  for (const p of problems.filter((x) => !openKeys.has(x.key))) {
    await prisma.$executeRaw(Prisma.sql`INSERT INTO public.trading_notifications (key, level, title, body, href)
      VALUES (${p.key}, ${p.level}, ${p.title}, ${p.body}, ${p.href ?? null})`);
    opened++;
  }
  for (const o of open.filter((x) => !now.has(x.key))) {
    await prisma.$executeRaw(Prisma.sql`UPDATE public.trading_notifications SET resolved_at = now() WHERE id = ${o.id}::uuid`);
    await prisma.$executeRaw(Prisma.sql`INSERT INTO public.trading_notifications (key, level, title, body, resolved_at)
      VALUES (${o.key}, 'ok', ${`Resuelto · ${o.title}`}, 'Vuelve a funcionar con normalidad.', now())`);
    resolved++;
  }
  return { problems, opened, resolved };
}

export async function listNotifications(limit = 50): Promise<{ items: Notification[]; unread: number; openProblems: number }> {
  const rows = await prisma.$queryRaw<
    { id: string; created_at: Date; key: string; level: string; title: string; body: string | null; href: string | null; resolved_at: Date | null; read_at: Date | null }[]
  >(Prisma.sql`SELECT id::text AS id, created_at, key, level, title, body, href, resolved_at, read_at
    FROM public.trading_notifications ORDER BY created_at DESC LIMIT ${limit}`);
  const counts = await prisma.$queryRaw<{ unread: bigint; open: bigint }[]>(Prisma.sql`
    SELECT count(*) FILTER (WHERE read_at IS NULL) AS unread,
           count(*) FILTER (WHERE resolved_at IS NULL AND level <> 'ok') AS open
    FROM public.trading_notifications`);
  return {
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at.toISOString(),
      key: r.key,
      level: r.level as Notification["level"],
      title: r.title,
      body: r.body,
      href: r.href,
      resolvedAt: r.resolved_at?.toISOString() ?? null,
      readAt: r.read_at?.toISOString() ?? null,
    })),
    unread: Number(counts[0]?.unread ?? 0),
    openProblems: Number(counts[0]?.open ?? 0),
  };
}

export async function markAllRead() {
  await prisma.$executeRaw(Prisma.sql`UPDATE public.trading_notifications SET read_at = now() WHERE read_at IS NULL`);
}

/** Avisos de hace más de 60 días, fuera (los abiertos se quedan). */
export async function pruneNotifications() {
  await prisma.$executeRaw(Prisma.sql`DELETE FROM public.trading_notifications WHERE created_at < now() - interval '60 days' AND (resolved_at IS NOT NULL OR level = 'ok')`);
}
