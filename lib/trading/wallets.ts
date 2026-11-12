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
