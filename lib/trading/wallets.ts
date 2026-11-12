// lib/trading/wallets.ts
// Tu dinero real: saldo de cada exchange/bróker conectado y, del que usa la cartera de Trading,
// el resultado de las copias de agentes en real. Solo lectura.
import "server-only";
import { prisma } from "@/lib/prisma";
import * as brokers from "@/lib/brokers/gateway";
import { brokerRegistry } from "@/lib/brokers/providers";
import type { BrokerActor } from "@/lib/brokers/types";
import { referencePrice } from "./kamikaze/market";
import { legResult } from "./mirror/logic";
import { madridDay } from "./accounts";
import { dayDate, dayKey } from "./sync";
import { agentByKey } from "./agents/roster";
import { chipByKey } from "./chip/roster";
import { kamikazeByKey } from "./kamikaze/roster";

/** Los saldos se piden como mucho una vez por minuto (el panel lateral se refresca solo). */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: { total: number; cash: number; currency: string } }>();

async function balance(actor: BrokerActor, connectionId: string) {
  const hit = cache.get(connectionId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const accounts = await brokers.getAccounts(actor, connectionId);
  const a = accounts[0];
  const value = { total: a?.totalValue ?? 0, cash: a?.cashAvailable ?? 0, currency: a?.currency ?? "EUR" };
  cache.set(connectionId, { at: Date.now(), value });
  return value;
}

/** Resultado de las copias en dinero real: lo cerrado más lo abierto a precio de ahora. */
async function copiesResult(workspaceId: string) {
  const mirrors = await prisma.trading_mirrors.findMany({
    where: { workspace_id: workspaceId, mode: "real" },
    include: { legs: { where: { mode: "real" } } },
  });
  if (!mirrors.length) return null;
  let realized = 0;
  let unrealized = 0;
  for (const m of mirrors)
    for (const l of m.legs) {
      if (l.result !== null && l.status === "cerrada") realized += l.result;
      else if (l.status === "abierta" && l.quantity && l.entry_price) {
        const price = await referencePrice(l.symbol).catch(() => null);
        if (price) unrealized += legResult(l.quantity, l.entry_price, price);
      }
    }
  const budget = mirrors.filter((m) => m.active).reduce((s, m) => s + m.budget, 0);
  const result = realized + unrealized;
  return { result, pct: budget > 0 ? (result / budget) * 100 : null, budget, copies: mirrors.filter((m) => m.active).length };
}

export async function getWallets(actor: Extract<BrokerActor, { kind: "user" }>) {
  const { connections } = await brokers.listIntegrations(actor);
  const live = connections.filter((c) => c.status !== "disconnected");
  const items = await Promise.all(
    live.map(async (c) => {
      const info = brokerRegistry.list().find((p) => p.id === c.provider);
      const base = {
        id: c.id,
        provider: c.provider,
        name: info?.name ?? c.provider,
        logo: info?.logo ?? null,
        environment: c.environment,
        usedByTrading: c.usedByTrading,
        operating: c.usedByTrading && c.permissions.includes("auto"),
      };
      try {
        const b = await balance(actor, c.id);
        // Foto del día para la gráfica de Mi cartera (la última del día se queda).
        if (c.environment === "real" && b.total > 0)
          await prisma.trading_wallet_snapshots
            .upsert({
              where: { connection_id_day: { connection_id: c.id, day: dayDate(madridDay()) } },
              create: { connection_id: c.id, workspace_id: actor.workspaceId, day: dayDate(madridDay()), total: b.total, currency: b.currency },
              update: { total: b.total, currency: b.currency, updated_at: new Date() },
            })
            .catch(() => undefined);
        return { ...base, ...b, error: null as string | null, copies: c.usedByTrading ? await copiesResult(actor.workspaceId) : null };
      } catch (e) {
        return { ...base, total: null, cash: null, currency: c.currency ?? "EUR", error: e instanceof Error ? e.message : "No se pudo leer el saldo", copies: null };
      }
    }),
  );
  // Primero el que opera, luego los reales y al final las demos.
  items.sort((a, b) => Number(b.operating) - Number(a.operating) || Number(b.environment === "real") - Number(a.environment === "real"));
  const total = items.filter((i) => i.environment === "real" && i.currency === "EUR" && i.total !== null).reduce((s, i) => s + (i.total ?? 0), 0);
  return { total, items };
}


/** Agentes del usuario (como mucho MAX_OWN) y la evolución de su dinero real. */
export const MAX_OWN = 3;

export async function myAgents(workspaceId: string) {
  const [owned, snaps] = await Promise.all([
    prisma.trading_user_agents.findMany({ where: { workspace_id: workspaceId }, orderBy: { created_at: "asc" } }),
    prisma.trading_wallet_snapshots.findMany({ where: { workspace_id: workspaceId, currency: "EUR" }, orderBy: { day: "asc" } }),
  ]);
  // Suma por día de todos los exchanges (cada uno arrastra su último valor).
  const last = new Map<string, number>();
  const byDay = new Map<string, number>();
  for (const s of snaps) {
    last.set(s.connection_id, s.total);
    byDay.set(dayKey(s.day), [...last.values()].reduce((a, b) => a + b, 0));
  }
  return {
    owned: owned.map((o) => o.agent),
    max: MAX_OWN,
    history: [...byDay.entries()].map(([day, equity]) => ({ day, equity })),
  };
}

/** Añade un agente del catálogo a «Tus agentes» (como mucho MAX_OWN). */
export async function addMyAgent(workspaceId: string, key: unknown) {
  const agent = String(key ?? "");
  if (!(agentByKey(agent) || kamikazeByKey(agent) || chipByKey(agent))) throw new Error("Ese agente no existe");
  const owned = await prisma.trading_user_agents.findMany({ where: { workspace_id: workspaceId }, select: { agent: true } });
  if (owned.some((o) => o.agent === agent)) return { ok: true };
  if (owned.length >= MAX_OWN) throw new Error(`Ya tienes ${MAX_OWN} agentes: quita uno para dejar hueco`);
  await prisma.trading_user_agents.create({ data: { workspace_id: workspaceId, agent } });
  return { ok: true };
}

/** Quita un agente de «Tus agentes» para dejar hueco. Solo si no tiene dinero tuyo trabajando. */
export async function removeMyAgent(workspaceId: string, key: unknown) {
  const agent = String(key ?? "");
  const mirror = await prisma.trading_mirrors.findFirst({ where: { workspace_id: workspaceId, agent, active: true }, select: { id: true } });
  if (mirror) throw new Error("Tiene dinero tuyo: despídelo primero desde «Gestionar»");
  await prisma.trading_user_agents.deleteMany({ where: { workspace_id: workspaceId, agent } });
  return { ok: true };
}
