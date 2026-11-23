// lib/trading/trade-events.ts
// Avisos de Mi cartera (21/11/2026): una notificación por cada compra, por cada venta y por cada movimiento
// del stop de tus operaciones con dinero real (las tuyas y las copias de los agentes). Se mira en cada
// revisión (cron cada 5 min): lo nuevo de las últimas horas que aún no tenga aviso, crea uno. Van a la
// misma campana que los avisos de fallos, pero nacen «resueltos»: no cuentan como problemas abiertos.
//
// El stop de persecución se ajusta en cada revisión, así que solo se avisa cuando se ha movido al menos
// STOP_STEP_PCT desde el último aviso (o desde el inicial), y siempre que pase a asegurar beneficio.
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { agentByKey } from "./agents/roster";
import { kamikazeByKey } from "./kamikaze/roster";
import { chipByKey } from "./chip/roster";
import { AGENTS_WORKSPACE } from "./agents/roster";

/** Ventana para avisar de compras y ventas (lo anterior al despliegue no se avisa). */
const WINDOW_MS = 3 * 3_600_000;
/** Movimiento mínimo del stop (en %) entre avisos. */
export const STOP_STEP_PCT = 1;
const HREF = "/trading/cartera";

const agentName = (key: string) => agentByKey(key)?.name ?? kamikazeByKey(key)?.name ?? chipByKey(key)?.name ?? key;
const coin = (s: string) => s.replace(/-EUR$/, "");
const nf = (d: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" });
const eur = (v: number, d?: number) => `${nf(d ?? (v !== 0 && Math.abs(v) < 1 ? 4 : 2)).format(v)} €`;
const signedEur = (v: number) => `${v >= 0 ? "+" : "−"}${nf(2).format(Math.abs(v))} €`;
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${nf(1).format(Math.abs(v))} %`;

/** Una operación con dinero real, la tuya o la copia de un agente, vista igual para los avisos. */
type Trade = {
  id: string;
  kind: "manual" | "copia";
  symbol: string;
  who: string | null;
  short: boolean;
  leverage: number | null;
  status: string;
  invested: number;
  entry: number | null;
  exit: number | null;
  result: number | null;
  stop: number | null;
  initialStop: number | null;
  openedAt: Date | null;
  closedAt: Date | null;
};

async function trades(since: Date): Promise<Trade[]> {
  const [manual, legs] = await Promise.all([
    prisma.trading_manual_trades.findMany({
      where: { OR: [{ status: { in: ["abierta", "vendiendo"] } }, { opened_at: { gte: since } }, { closed_at: { gte: since } }] },
    }),
    prisma.trading_mirror_legs.findMany({
      where: { mode: "real", OR: [{ status: { in: ["abierta", "vendiendo"] } }, { opened_at: { gte: since } }, { closed_at: { gte: since } }] },
      include: { mirror: { select: { agent: true } } },
    }),
  ]);
  const sources = await prisma.trading_positions.findMany({
    where: { id: { in: legs.map((l) => l.source_position_id) } },
    select: { id: true, stop: true, initial_stop: true },
  });
  const src = new Map(sources.map((s) => [s.id, s]));
  return [
    ...manual.map<Trade>((t) => ({
      id: t.id,
      kind: "manual",
      symbol: t.symbol,
      who: null,
      short: false,
      leverage: null,
      status: t.status,
      invested: t.quantity && t.entry_price ? t.quantity * t.entry_price : t.amount,
      entry: t.entry_price,
      exit: t.exit_price,
      result: t.result,
      stop: t.stop,
      initialStop: t.initial_stop ?? t.stop,
      openedAt: t.opened_at,
      closedAt: t.closed_at,
    })),
    ...legs.map<Trade>((l) => ({
      id: l.id,
      kind: "copia",
      symbol: l.symbol,
      who: agentName(l.mirror.agent),
      short: !!l.pair?.startsWith("PF_"),
      leverage: l.leverage,
      status: l.status,
      invested: l.quantity && l.entry_price ? l.quantity * l.entry_price : l.amount ?? 0,
      entry: l.entry_price,
      exit: l.exit_price,
      result: l.result,
      stop: src.get(l.source_position_id)?.stop ?? null,
      initialStop: src.get(l.source_position_id)?.initial_stop ?? null,
      openedAt: l.opened_at,
      closedAt: l.closed_at,
    })),
  ];
}

const opening = (t: Trade) => (t.short ? `Corto${t.leverage && t.leverage > 1 ? ` x${t.leverage}` : ""}` : "Compra");

function buyText(t: Trade) {
  const what = t.who ? `${t.who}: ${opening(t).toLowerCase()} de ${eur(t.invested, 2)}` : `Has comprado ${eur(t.invested, 2)}`;
  return { title: `${opening(t)} · ${coin(t.symbol)}`, body: `${what}${t.entry ? ` a ${eur(t.entry)}` : ""}.` };
}

function sellText(t: Trade) {
  const r = t.result ?? 0;
  const rPct = t.invested > 0 ? (r / t.invested) * 100 : null;
  const close = t.short ? "cierra el corto" : "vende";
  const who = t.who ? `${t.who} ${close}` : t.short ? "Cierras el corto" : "Has vendido";
  const prices = t.entry && t.exit ? `: entrada ${eur(t.entry)} → salida ${eur(t.exit)}` : "";
  return {
    title: `${t.short ? "Cierre" : "Venta"} · ${coin(t.symbol)} · ${signedEur(r)}`,
    body: `${who}${prices}${rPct !== null ? ` (${pct(rPct)})` : ""}.`,
  };
}

function stopText(t: Trade, from: number, to: number) {
  const move = ((to - from) / from) * 100;
  const locks = t.entry ? (t.short ? to < t.entry : to > t.entry) : false;
  const dir = to > from ? "sube" : "baja";
  return {
    title: `Stop ${dir === "sube" ? "subido" : "bajado"} · ${coin(t.symbol)}`,
    body: `${t.who ? `${t.who}: el` : "El"} stop ${dir} de ${eur(from)} a ${eur(to)} (${pct(move)}).${locks ? " Ya asegura beneficio si salta." : ""}`,
  };
}

async function insert(key: string, title: string, body: string) {
  await prisma.$executeRaw(Prisma.sql`INSERT INTO public.trading_notifications (key, level, title, body, href, resolved_at)
    VALUES (${key}, 'operacion', ${title}, ${body}, ${HREF}, now())`);
}

/** Crea los avisos que falten. Devuelve cuántos de cada tipo. */
export async function syncTradeEvents(now = Date.now()): Promise<{ compras: number; ventas: number; stops: number }> {
  const since = new Date(now - WINDOW_MS);
  const list = await trades(since);
  if (!list.length) return { compras: 0, ventas: 0, stops: 0 };

  // Lo ya avisado: claves «op:compra:<id>», «op:venta:<id>» y «op:stop:<id>:<valor>» (el último manda).
  const done = await prisma.$queryRaw<{ key: string }[]>(Prisma.sql`
    SELECT key FROM public.trading_notifications WHERE key LIKE 'op:%' AND created_at > now() - interval '30 days' ORDER BY created_at ASC`);
  const keys = new Set(done.map((d) => d.key));
  const lastStop = new Map<string, number>();
  for (const d of done) {
    const m = /^op:stop:([^:]+):(.+)$/.exec(d.key);
    if (m) lastStop.set(m[1], Number(m[2]));
  }

  const out = { compras: 0, ventas: 0, stops: 0 };
  for (const t of list) {
    if (t.openedAt && t.openedAt.getTime() >= since.getTime() && !keys.has(`op:compra:${t.id}`)) {
      const x = buyText(t);
      await insert(`op:compra:${t.id}`, x.title, x.body);
      out.compras++;
    }
    if (t.status === "cerrada" && t.closedAt && t.closedAt.getTime() >= since.getTime() && !keys.has(`op:venta:${t.id}`)) {
      const x = sellText(t);
      await insert(`op:venta:${t.id}`, x.title, x.body);
      out.ventas++;
    }
    if (t.status === "abierta" && t.stop && t.stop > 0) {
      const from = lastStop.get(t.id) ?? t.initialStop;
      if (!from || !(from > 0)) continue;
      const move = Math.abs((t.stop - from) / from) * 100;
      const lockedBefore = t.entry ? (t.short ? from < t.entry : from > t.entry) : false;
      const lockedNow = t.entry ? (t.short ? t.stop < t.entry : t.stop > t.entry) : false;
      if (move >= STOP_STEP_PCT || (lockedNow && !lockedBefore && move > 0.05)) {
        const x = stopText(t, from, t.stop);
        await insert(`op:stop:${t.id}:${t.stop}`, x.title, x.body);
        out.stops++;
      }
    }
  }
  return out;
}

/**
 * Primera operación de cada agente (22/11/2026): un aviso cuando un agente (con dinero virtual o no) abre la
 * primera posición de su cuenta, para saber cuándo se estrena uno que llevaba días esperando. Solo las de las
 * últimas horas: los que ya habían operado antes de esto no avisan. Si un agente se reinicia (cuenta nueva),
 * vuelve a avisar con su primera operación.
 */
export async function syncAgentFirsts(now = Date.now()): Promise<number> {
  const since = new Date(now - WINDOW_MS);
  const firsts = await prisma.$queryRaw<{ account_id: string; agent: string; symbol: string; direction: string; entry: number | null; created_at: Date }[]>(Prisma.sql`
    SELECT DISTINCT ON (a.id) a.id::text AS account_id, a.agent, p.symbol, p.direction,
      COALESCE(p.entry_price, p.planned_entry) AS entry, p.created_at
    FROM public.trading_accounts a JOIN public.trading_positions p ON p.account_id = a.id
    WHERE a.workspace_id = ${AGENTS_WORKSPACE}::uuid AND COALESCE(a.agent, '') <> '' AND a.agent NOT LIKE 'copia:%' AND p.status NOT IN ('cancelada', 'error')
    ORDER BY a.id, p.created_at ASC`);
  const fresh = firsts.filter((f) => f.created_at.getTime() >= since.getTime());
  if (!fresh.length) return 0;
  const done = await prisma.$queryRaw<{ key: string }[]>(Prisma.sql`
    SELECT key FROM public.trading_notifications WHERE key LIKE 'agente:primera:%'`);
  const keys = new Set(done.map((d) => d.key));
  let n = 0;
  for (const f of fresh) {
    const key = `agente:primera:${f.account_id}`;
    if (keys.has(key)) continue;
    const name = agentName(f.agent);
    const what = f.direction === "short" ? "corto" : "compra";
    await prisma.$executeRaw(Prisma.sql`INSERT INTO public.trading_notifications (key, level, title, body, href, resolved_at)
      VALUES (${key}, 'operacion', ${`Primera operación · ${name}`},
        ${`${name} se estrena: ${what} de ${coin(f.symbol)}${f.entry ? ` a ${eur(f.entry)}` : ""}.`}, ${`/trading/agentes/${f.agent}`}, now())`);
    n++;
  }
  return n;
}
