// lib/push/service.ts
// Notificaciones push de Trading (22/11/2026): suscripciones de cada móvil, claves VAPID y envío de los avisos
// de la campana (trading_notifications) que aún no se han mandado. Lo llama la revisión de cada 5 minutos.
//
// Los avisos de Trading son de tus cuentas con dinero real, así que solo se mandan a los móviles de usuarios
// administradores (system_admin / system_super_admin), no a cualquiera que tenga sesión.
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateVapidKeys, sendPush, type PushMessage, type PushSub, type VapidKeys } from "./webpush";
import { DEFAULT_PREFS, MAX_FAILURES, PUSH_MAX_AGE_MS, pushKind, type PushPrefs } from "./kinds";

/** Contacto del servidor que exigen Apple y Google (no se usa para nada más). */
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || "https://crussader.com";
const ADMIN_ROLES = ["system_admin", "system_super_admin"];

let cached: VapidKeys | null = null;

/** Claves VAPID: las de las variables de entorno o, si no hay, las de la base de datos (se crean la primera vez). */
export async function vapidKeys(): Promise<VapidKeys> {
  if (cached) return cached;
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) return (cached = { publicKey: envPub, privateKey: envPriv });
  const rows = await prisma.$queryRaw<{ public_key: string; private_key: string }[]>(Prisma.sql`
    SELECT public_key, private_key FROM public.push_vapid_keys WHERE id = 1`);
  if (rows[0]) return (cached = { publicKey: rows[0].public_key, privateKey: rows[0].private_key });
  const k = generateVapidKeys();
  // Si dos servidores las crean a la vez, gana la primera y las dos leen la misma.
  await prisma.$executeRaw(Prisma.sql`INSERT INTO public.push_vapid_keys (id, public_key, private_key)
    VALUES (1, ${k.publicKey}, ${k.privateKey}) ON CONFLICT (id) DO NOTHING`);
  cached = null;
  return vapidKeys();
}

export async function isPushAdmin(userId: string) {
  const u = await prisma.users.findUnique({ where: { id: userId }, select: { system_role: true } });
  return ADMIN_ROLES.includes(u?.system_role ?? "");
}

type Row = { id: string; endpoint: string; p256dh: string; auth: string; notify_trades: boolean; notify_stops: boolean; notify_health: boolean };
const prefsOf = (r: Row): PushPrefs => ({ trades: r.notify_trades, stops: r.notify_stops, health: r.notify_health });
const subOf = (r: Row): PushSub => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } });

/** Estado para la pantalla: clave pública, si este usuario puede recibirlas y las preferencias de este móvil. */
export async function pushState(userId: string, endpoint: string | null) {
  const [keys, admin] = await Promise.all([vapidKeys(), isPushAdmin(userId)]);
  const row = endpoint
    ? (
        await prisma.$queryRaw<Row[]>(Prisma.sql`SELECT id::text AS id, endpoint, p256dh, auth, notify_trades, notify_stops, notify_health
          FROM public.push_subscriptions WHERE endpoint = ${endpoint} AND user_id = ${userId}::uuid`)
      )[0]
    : undefined;
  return { publicKey: keys.publicKey, allowed: admin, subscribed: !!row, prefs: row ? prefsOf(row) : DEFAULT_PREFS };
}

export async function subscribe(userId: string, sub: PushSub, userAgent: string | null) {
  if (!(await isPushAdmin(userId))) throw new Error("Las notificaciones de Trading son solo para administradores");
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Suscripción no válida");
  await prisma.$executeRaw(Prisma.sql`INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (${userId}::uuid, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent?.slice(0, 300) ?? null})
    ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent, failures = 0, last_error = NULL`);
}

export async function unsubscribe(userId: string, endpoint: string) {
  await prisma.$executeRaw(Prisma.sql`DELETE FROM public.push_subscriptions WHERE endpoint = ${endpoint} AND user_id = ${userId}::uuid`);
}

export async function setPrefs(userId: string, endpoint: string, p: Partial<PushPrefs>) {
  await prisma.$executeRaw(Prisma.sql`UPDATE public.push_subscriptions SET
      notify_trades = COALESCE(${p.trades ?? null}::boolean, notify_trades),
      notify_stops = COALESCE(${p.stops ?? null}::boolean, notify_stops),
      notify_health = COALESCE(${p.health ?? null}::boolean, notify_health)
    WHERE endpoint = ${endpoint} AND user_id = ${userId}::uuid`);
}

/** Manda un aviso a un móvil y apunta el resultado (borra la suscripción si el móvil ya no la tiene). */
async function deliver(r: Row, msg: PushMessage, keys: VapidKeys) {
  try {
    const res = await sendPush(subOf(r), msg, keys, SUBJECT);
    if (res.status === 404 || res.status === 410) {
      await prisma.$executeRaw(Prisma.sql`DELETE FROM public.push_subscriptions WHERE id = ${r.id}::uuid`);
      return "caducada" as const;
    }
    if (res.status >= 200 && res.status < 300) {
      await prisma.$executeRaw(Prisma.sql`UPDATE public.push_subscriptions SET last_ok_at = now(), failures = 0, last_error = NULL WHERE id = ${r.id}::uuid`);
      return "ok" as const;
    }
    throw new Error(`${res.status} ${res.text}`);
  } catch (e) {
    const m = e instanceof Error ? e.message.slice(0, 200) : "error";
    await prisma.$executeRaw(Prisma.sql`UPDATE public.push_subscriptions SET failures = failures + 1, last_error = ${m} WHERE id = ${r.id}::uuid`);
    return "error" as const;
  }
}

async function adminSubs(userId?: string) {
  return prisma.$queryRaw<Row[]>(Prisma.sql`SELECT s.id::text AS id, s.endpoint, s.p256dh, s.auth, s.notify_trades, s.notify_stops, s.notify_health
    FROM public.push_subscriptions s JOIN public.users u ON u.id = s.user_id
    WHERE u.system_role::text = ANY(${ADMIN_ROLES}::text[]) AND s.failures < ${MAX_FAILURES}
      ${userId ? Prisma.sql`AND s.user_id = ${userId}::uuid` : Prisma.empty}`);
}

/** Aviso de prueba a los móviles de este usuario. */
export async function sendTest(userId: string) {
  const [keys, subs] = await Promise.all([vapidKeys(), adminSubs(userId)]);
  if (!subs.length) throw new Error("Este móvil no tiene las notificaciones activadas");
  const out = await Promise.all(subs.map((r) => deliver(r, { title: "CRS Trading", body: "Las notificaciones funcionan. Aquí te llegarán tus operaciones y los fallos.", url: "/trading/inicio", tag: "prueba" }, keys)));
  return { sent: out.filter((x) => x === "ok").length, total: subs.length };
}

/**
 * Manda al móvil los avisos de la campana que aún no se han enviado (los de las últimas 2 h; los más viejos se
 * dan por enviados). Cada aviso se marca antes de mandarlo, así dos revisiones a la vez no lo repiten.
 */
export async function deliverPending(): Promise<{ notices: number; sent: number; errors: number }> {
  const rows = await prisma.$queryRaw<{ id: string; key: string; level: string; title: string; body: string | null; href: string | null; created_at: Date }[]>(Prisma.sql`
    UPDATE public.trading_notifications SET pushed_at = now()
    WHERE id IN (SELECT id FROM public.trading_notifications WHERE pushed_at IS NULL ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED)
    RETURNING id::text AS id, key, level, title, body, href, created_at`);
  const fresh = rows.filter((n) => Date.now() - n.created_at.getTime() <= PUSH_MAX_AGE_MS).sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  if (!fresh.length) return { notices: 0, sent: 0, errors: 0 };
  const [keys, subs] = await Promise.all([vapidKeys(), adminSubs()]);
  let sent = 0;
  let errors = 0;
  for (const n of fresh) {
    const kind = pushKind(n);
    const msg: PushMessage = { title: n.title, body: n.body, url: n.href ?? "/trading/inicio", tag: n.key };
    for (const r of subs.filter((s) => prefsOf(s)[kind])) {
      const res = await deliver(r, msg, keys);
      if (res === "ok") sent++;
      else if (res === "error") errors++;
    }
  }
  return { notices: fresh.length, sent, errors };
}
