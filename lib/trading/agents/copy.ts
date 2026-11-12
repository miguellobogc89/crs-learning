// lib/trading/agents/copy.ts
// Copiar a un agente: una subcartera del usuario por agente seguido, con un peso (% del patrimonio total).
// Cuando el agente compra, vende o sube un stop, la subcartera hace lo mismo en proporción.
import "server-only";
import type { trading_accounts } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountState, closePosition, ensureAccount, madridDay, OPEN_STATUSES, placeOrder } from "../accounts";
import { dayDate, dayKey } from "../sync";
import { AGENTS, AGENTS_WORKSPACE, agentByKey as classicByKey, copyKey } from "./roster";
import { CHIP_AGENTS, chipByKey } from "../chip/roster";

/** Agentes que se pueden copiar en la cartera virtual: los clásicos y los de dos modos. */
const agentByKey = (key: string) => classicByKey(key) ?? chipByKey(key);

const COPY_PREFIX = "copia:";

async function transfer(from: trading_accounts, to: trading_accounts, amount: number, text: string) {
  if (!(amount > 0)) return;
  const day = dayDate(madridDay());
  await prisma.$transaction([
    prisma.trading_accounts.update({
      where: { id: from.id },
      data: { cash: { decrement: amount }, initial_capital: { decrement: amount }, updated_at: new Date() },
    }),
    prisma.trading_accounts.update({
      where: { id: to.id },
      data: { cash: { increment: amount }, initial_capital: { increment: amount }, updated_at: new Date() },
    }),
    prisma.trading_transactions.create({ data: { account_id: from.id, kind: "traspaso", amount: -amount, description: text, day } }),
    prisma.trading_transactions.create({ data: { account_id: to.id, kind: "traspaso", amount, description: text, day } }),
  ]);
}

/** Tu patrimonio completo: la cartera que manejas tú y las copias de agentes. */
export async function getPortfolio(workspaceId: string) {
  const main = await accountState(workspaceId);
  const subs = await prisma.trading_accounts.findMany({
    where: { workspace_id: workspaceId, agent: { startsWith: COPY_PREFIX }, copy_weight_pct: { not: null } },
    orderBy: { created_at: "asc" },
  });
  const copies = await Promise.all(
    subs.map(async (a) => {
      const key = a.agent.slice(COPY_PREFIX.length);
      const def = agentByKey(key);
      const st = await accountState(workspaceId, a.agent);
      return {
        agent: key,
        name: def?.name ?? key,
        color: def?.color ?? "slate",
        weightPct: a.copy_weight_pct ?? 0,
        since: a.created_at.toISOString(),
        summary: st.summary,
        positions: st.positions.filter((p) => (OPEN_STATUSES as readonly string[]).includes(p.status)),
        closed: st.positions.filter((p) => p.status === "cerrada").slice(0, 20),
      };
    }),
  );
  const ids = [main.account.id, ...subs.map((s) => s.id)];
  const rows = await prisma.trading_equity.findMany({ where: { account_id: { in: ids } }, orderBy: { day: "asc" } });
  // Suma por día; cada cuenta arrastra su último valor conocido (0 antes de existir).
  const days = [...new Set<string>(rows.map((r) => dayKey(r.day)))].sort();
  const last = new Map<string, number>();
  const byDay = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const k = dayKey(r.day);
    const m = byDay.get(k) ?? new Map<string, number>();
    m.set(r.account_id, r.equity);
    byDay.set(k, m);
  }
  const equity = days.map((d) => {
    for (const [id, v] of byDay.get(d) ?? []) last.set(id, v);
    return { day: d, equity: [...last.values()].reduce((s, v) => s + v, 0) };
  });
  const totalEquity = main.summary.equity + copies.reduce((s, c) => s + c.summary.equity, 0);
  const totalInitial = main.summary.initialCapital + copies.reduce((s, c) => s + c.summary.initialCapital, 0);
  return {
    opened: main.summary.opened,
    openedAt: main.account.opened_at?.toISOString() ?? null,
    total: {
      equity: totalEquity,
      initialCapital: totalInitial,
      returnPct: totalInitial > 0 ? ((totalEquity - totalInitial) / totalInitial) * 100 : 0,
      cash: main.summary.cash + copies.reduce((s, c) => s + c.summary.cash, 0),
      reserved: main.summary.reserved + copies.reduce((s, c) => s + c.summary.reserved, 0),
      available: main.summary.available + copies.reduce((s, c) => s + c.summary.available, 0),
      invested: main.summary.invested + copies.reduce((s, c) => s + c.summary.invested, 0),
      closed: main.summary.stats.closed + copies.reduce((s, c) => s + c.summary.stats.closed, 0),
    },
    main: { summary: main.summary, positions: main.positions.filter((p) => (OPEN_STATUSES as readonly string[]).includes(p.status)) },
    copies,
    equity,
  };
}

/** Peso de la cartera del agente que ocupa una posición (0-1). */
function fractionOf(quantity: number, price: number, agentEquity: number) {
  return agentEquity > 0 ? Math.max(0, Math.min(1, (quantity * price) / agentEquity)) : 0;
}

/** Empieza a copiar a un agente o cambia su peso (% de tu patrimonio total). */
export async function setCopy(workspaceId: string, agentInput: unknown, weightInput: unknown, mirror: boolean) {
  const def = agentByKey(String(agentInput ?? ""));
  if (!def) throw new Error("Agente desconocido");
  const weight = Math.round(Number(weightInput));
  if (!(weight >= 1 && weight <= 100)) throw new Error("El peso tiene que estar entre 1 % y 100 %");
  const portfolio = await getPortfolio(workspaceId);
  if (!portfolio.opened) throw new Error("Primero abre tu cuenta");
  const otherWeights = portfolio.copies.filter((c) => c.agent !== def.key).reduce((s, c) => s + c.weightPct, 0);
  if (otherWeights + weight > 100) throw new Error(`Con las demás copias (${otherWeights} %) te pasarías del 100 %`);

  const key = copyKey(def.key);
  const existed = await prisma.trading_accounts.findUnique({ where: { workspace_id_agent: { workspace_id: workspaceId, agent: key } } });
  const wasActive = existed?.copy_weight_pct !== null && existed?.copy_weight_pct !== undefined;
  const sub = await ensureAccount(workspaceId, key, {
    name: `Copia de ${def.name}`,
    capital: 0,
    settings: { commission_pct: 0, commission_min: 0, slippage_bps: def.settings.slippage_bps, max_open_positions: 40, max_position_pct: 100, breakeven: def.settings.breakeven },
  });
  const main = await ensureAccount(workspaceId);
  const subEquity = portfolio.copies.find((c) => c.agent === def.key)?.summary.equity ?? sub.cash;
  const target = (portfolio.total.equity * weight) / 100;
  const delta = target - subEquity;
  if (delta > 0) {
    const amount = Math.floor(Math.min(delta, main.cash) * 100) / 100;
    if (!wasActive && amount < 50) throw new Error("No tienes efectivo libre suficiente en tu cartera para esta copia");
    await transfer(main, sub, amount, `Asignación a la copia de ${def.name}`);
  } else if (delta < 0) {
    const amount = Math.floor(Math.min(-delta, sub.cash) * 100) / 100;
    await transfer(sub, main, amount, `Reducción de la copia de ${def.name}`);
  }
  await prisma.trading_accounts.update({ where: { id: sub.id }, data: { copy_weight_pct: weight, updated_at: new Date() } });

  // Igualar su cartera actual: mismas posiciones, en proporción.
  let mirrored = 0;
  if (mirror && !wasActive) {
    const agent = await accountState(AGENTS_WORKSPACE, def.key);
    const mine = await accountState(workspaceId, key);
    for (const p of agent.positions.filter((x) => (OPEN_STATUSES as readonly string[]).includes(x.status))) {
      const price = p.lastPrice ?? p.entryPrice ?? p.plannedEntry;
      const quantity = (fractionOf(p.quantity, price, agent.summary.equity) * mine.summary.equity) / price;
      try {
        await placeOrder(
          workspaceId,
          null,
          {
            symbol: p.symbol,
            direction: "long",
            quantity,
            stop: p.stop,
            target: p.target,
            execution: p.status === "abierta" ? "now" : "next_open",
            fractional: true,
            signalKey: `copia:pos:${p.id}`,
            maxHoldDays: null,
            notes: `Copia de ${def.name} (igualar cartera)`,
            source: "agente",
          },
          key,
        );
        mirrored++;
      } catch {
        // Precio ya fuera del stop/objetivo o tamaño mínimo: se omite.
      }
    }
  }
  return { weight, mirrored };
}

/** Deja de copiar: vende sus posiciones al último precio y devuelve el dinero a tu cartera. */
export async function stopCopy(workspaceId: string, agentInput: unknown) {
  const def = agentByKey(String(agentInput ?? ""));
  if (!def) throw new Error("Agente desconocido");
  const key = copyKey(def.key);
  const sub = await prisma.trading_accounts.findUnique({ where: { workspace_id_agent: { workspace_id: workspaceId, agent: key } } });
  if (!sub || sub.copy_weight_pct === null) throw new Error("No estás copiando a este agente");
  const open = await prisma.trading_positions.findMany({ where: { account_id: sub.id, status: { in: [...OPEN_STATUSES] } } });
  for (const p of open) await closePosition(workspaceId, p.id, key, "dejas de copiar");
  const fresh = await prisma.trading_accounts.findUniqueOrThrow({ where: { id: sub.id } });
  const main = await ensureAccount(workspaceId);
  await transfer(fresh, main, Math.floor(fresh.cash * 100) / 100, `Fin de la copia de ${def.name}`);
  await prisma.trading_accounts.update({ where: { id: sub.id }, data: { copy_weight_pct: null, updated_at: new Date() } });
}

/** El agente ha ejecutado una decisión: todas las copias hacen lo mismo en proporción. */
export async function replicate(
  agentKey: string,
  p: { id: string; action: string; symbol: string; price: number; quantity: number | null; stop: number | null; target: number | null; horizon_days: number },
  agentEquity: number,
  /** Las copias se ejecutan igual que el agente: ya (mercado abierto) o en la próxima apertura. */
  execution: "now" | "next_open" = "next_open",
) {
  const def = agentByKey(agentKey);
  if (!def) return { copies: 0, errors: 0 };
  const key = copyKey(agentKey);
  const followers = await prisma.trading_accounts.findMany({ where: { agent: key, copy_weight_pct: { not: null } } });
  let copies = 0;
  let errors = 0;
  for (const f of followers) {
    try {
      if (p.action === "comprar" && p.quantity && p.stop) {
        const mine = await accountState(f.workspace_id, key);
        const quantity = (fractionOf(p.quantity, p.price, agentEquity) * mine.summary.equity) / p.price;
        await placeOrder(
          f.workspace_id,
          null,
          {
            symbol: p.symbol,
            direction: "long",
            quantity,
            stop: p.stop,
            // Sin objetivo (agentes de dos modos): salen por el stop o cuando el agente vende.
            target: p.target ?? p.price * 10,
            execution,
            fractional: true,
            signalKey: `copia:${p.id}`,
            maxHoldDays: p.target === null ? null : Math.round(p.horizon_days * 1.5),
            notes: `Copia de ${def.name}`,
            source: "agente",
          },
          key,
        );
      } else if (p.action === "vender") {
        const open = await prisma.trading_positions.findMany({ where: { account_id: f.id, symbol: p.symbol, status: { in: [...OPEN_STATUSES] } } });
        for (const pos of open) await closePosition(f.workspace_id, pos.id, key, `${def.name} vende`);
      } else if (p.action === "mantener" && p.stop) {
        const pos = await prisma.trading_positions.findFirst({ where: { account_id: f.id, symbol: p.symbol, status: "abierta" } });
        if (pos && p.stop > pos.stop) await prisma.trading_positions.update({ where: { id: pos.id }, data: { stop: p.stop, updated_at: new Date() } });
      } else continue;
      copies++;
    } catch (e) {
      errors++;
      console.error("[trading] copia", agentKey, f.workspace_id, e instanceof Error ? e.message : e);
    }
  }
  return { copies, errors };
}

export const COPYABLE = [...AGENTS, ...CHIP_AGENTS].map((a) => a.key);
