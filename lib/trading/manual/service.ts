// lib/trading/manual/service.ts
// Mis operaciones: compras que haces tú desde Oportunidades con tu dinero real en el exchange conectado
// (Bitvavo). Compra a mercado por euros; luego, en cada pasada del cron (cada ~5 min), la app mira el
// precio y vende si toca el stop o el objetivo (o sube el stop si pediste «seguir si sube»).
// Misma pasarela que las copias de agentes: cada orden con clave de idempotencia, nunca se envía dos veces.
import "server-only";
import type { Prisma, trading_manual_trades } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import * as brokers from "@/lib/brokers/gateway";
import { BrokerError } from "@/lib/brokers/types";
import { referencePrice } from "../kamikaze/market";
import { MIN_ORDER_EUR, stepQuantity } from "../mirror/logic";
import { maxBudget, realConnection, realOrder, realProblem, venueFor } from "../mirror/service";
import { manualStep, tradeResult } from "./logic";

const STALE_MS = 10 * 60_000;
const MAX_SELL_ATTEMPTS = 5;
const coin = (s: string) => s.replace(/-EUR$/, "");

const save = (id: string, data: Prisma.trading_manual_tradesUpdateInput) => prisma.trading_manual_trades.update({ where: { id }, data: { ...data, updated_at: new Date() } });

/** Lo que ves en la pantalla: abiertas (con lo que valen ahora) y las últimas cerradas. */
export async function manualView(workspaceId: string) {
  const [open, closed, real] = await Promise.all([
    prisma.trading_manual_trades.findMany({ where: { workspace_id: workspaceId, status: { in: ["abriendo", "abierta", "vendiendo", "error"] } }, orderBy: { created_at: "desc" } }),
    prisma.trading_manual_trades.findMany({ where: { workspace_id: workspaceId, status: { in: ["cerrada", "omitida"] } }, orderBy: { created_at: "desc" }, take: 10 }),
    realConnection(workspaceId),
  ]);
  const trades = await Promise.all(
    [...open, ...closed].map(async (t) => {
      const price = t.status === "abierta" ? await referencePrice(t.symbol).catch(() => null) : null;
      const now = price && t.quantity && t.entry_price ? tradeResult(t.quantity, t.entry_price, price) : null;
      return {
        id: t.id,
        ideaId: t.idea_id,
        symbol: t.symbol,
        status: t.status,
        amount: t.amount,
        invested: t.quantity && t.entry_price ? t.quantity * t.entry_price : t.amount,
        entry: t.entry_price,
        stop: t.stop,
        target: t.target,
        trail: t.trail,
        trailing: t.trailing,
        price,
        result: t.status === "cerrada" ? t.result : now,
        note: t.note,
        openedAt: t.opened_at?.toISOString() ?? null,
        closedAt: t.closed_at?.toISOString() ?? null,
      };
    }),
  );
  const result = trades.reduce((s, t) => s + (t.status === "cerrada" || t.status === "abierta" ? t.result ?? 0 : 0), 0);
  const working = trades.filter((t) => t.status === "abierta").reduce((s, t) => s + t.invested + (t.result ?? 0), 0);
  return { trades, result, working, exchange: real.name, problem: realProblem(real), maxAmount: maxBudget() };
}

/** Compra con tu dinero una idea viva de Oportunidades. */
export async function buyManual(workspaceId: string, input: { ideaId?: unknown; amount?: unknown; trail?: unknown }) {
  const idea = await prisma.trading_faro_ideas.findUnique({ where: { id: String(input.ideaId ?? "") } });
  if (!idea) throw new Error("Esa idea no existe");
  if (idea.status !== "viva" || idea.valid_until.getTime() <= Date.now()) throw new Error("Esa idea ya no está viva");
  const amount = Math.floor(Number(input.amount) * 100) / 100;
  const max = maxBudget();
  if (!(amount >= MIN_ORDER_EUR)) throw new Error(`Como mínimo ${MIN_ORDER_EUR} € por compra`);
  if (amount > max) throw new Error(`Como mucho ${max} € por compra (se sube con TRADING_MIRROR_MAX_EUR)`);

  const real = await realConnection(workspaceId);
  const problem = realProblem(real);
  if (problem || !real.conn) throw new Error(problem ?? "Sin exchange conectado");
  const price = await referencePrice(idea.symbol);
  if (!price) throw new Error("Sin precio en este momento: prueba en un minuto");
  if (price <= idea.invalidation) throw new Error(`El precio ya está por debajo de la invalidación (${coin(idea.symbol)} a ${price.toFixed(4)} €): la idea no vale`);
  if (price >= idea.target) throw new Error("El precio ya llegó al objetivo: tarde para entrar");
  const venue = await venueFor(workspaceId, idea.symbol);
  if ("missing" in venue) throw new Error(venue.missing);
  const cash = (await brokers.getAccounts(real.conn.actor, real.conn.connectionId))[0]?.cashAvailable ?? 0;
  if (amount > cash * 0.98) throw new Error(`No tienes tantos euros libres en ${real.name} (hay ${cash.toFixed(2).replace(".", ",")} €)`);
  const quantity = stepQuantity(amount, price, venue.step);
  if (!(quantity > 0) || quantity * price < MIN_ORDER_EUR) throw new Error(`Con ${amount} € no llega al mínimo por orden`);

  // La operación se registra antes de comprar: su id es la clave de idempotencia de la orden.
  const t = await prisma.trading_manual_trades.create({
    data: {
      workspace_id: workspaceId,
      idea_id: idea.id,
      symbol: idea.symbol,
      pair: venue.pair,
      amount,
      stop: idea.invalidation,
      initial_stop: idea.invalidation,
      target: idea.target,
      trail: input.trail === true,
    },
  });
  try {
    const o = await realOrder(workspaceId, "buy", idea.symbol, venue.pair, quantity, `manual:${t.id}:compra`, `mi operación ${idea.symbol}`);
    const filled = o.filled && o.filled > 0 ? o.filled : quantity;
    const entry = o.price && o.price > 0 ? o.price : price;
    await save(t.id, { status: "abierta", quantity: filled, entry_price: entry, buy_order_id: o.orderId, opened_at: new Date(), note: `Comprado en ${o.name} (orden ${o.orderId})` });
    return { ok: true, id: t.id, quantity: filled, entry, exchange: o.name };
  } catch (e) {
    const unknown = e instanceof BrokerError && e.code === "unknown_outcome";
    const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
    await save(t.id, { status: unknown ? "error" : "omitida", note: unknown ? `No se sabe si la compra se hizo: revisa ${real.name}` : `No se pudo comprar: ${msg}` });
    throw new Error(unknown ? `No se sabe si la compra se hizo: revisa ${real.name}` : `No se pudo comprar: ${msg}`);
  }
}

/** Vende una operación abierta. Devuelve un texto de error o null. */
async function sellTrade(t: trading_manual_trades, reason: string): Promise<string | null> {
  const claimed = await prisma.trading_manual_trades.updateMany({ where: { id: t.id, status: "abierta" }, data: { status: "vendiendo", updated_at: new Date() } });
  if (claimed.count !== 1) return null;
  const entry = t.entry_price ?? 0;
  const qty = t.quantity ?? 0;
  try {
    const real = await realConnection(t.workspace_id);
    if (!real.conn) throw new BrokerError("not_connected", realProblem(real) ?? "Sin conexión");
    const venue = await venueFor(t.workspace_id, t.symbol);
    const step = "missing" in venue ? null : venue.step;
    const pair = t.pair ?? t.symbol;
    const held = (await brokers.getPositions(real.conn.actor, real.conn.connectionId)).find((p) => p.providerSymbol === pair);
    const available = held ? held.quantityAvailable ?? held.quantity : 0;
    const sellQty = stepQuantity(Math.min(qty, available), 1, step);
    if (!(sellQty > 0)) {
      await save(t.id, { status: "cerrada", closed_at: new Date(), note: `Ya no estaba en ${real.name} (vendida fuera de la app)` });
      return null;
    }
    const o = await realOrder(t.workspace_id, "sell", t.symbol, pair, sellQty, `manual:${t.id}:venta:${t.sell_attempts}`, `mi operación ${t.symbol}`);
    const exit = o.price && o.price > 0 ? o.price : ((await referencePrice(t.symbol)) ?? entry);
    await save(t.id, {
      status: "cerrada",
      exit_price: exit,
      result: tradeResult(o.filled && o.filled > 0 ? o.filled : sellQty, entry, exit),
      sell_order_id: o.orderId,
      closed_at: new Date(),
      note: `Vendido en ${o.name}: ${reason}`,
    });
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
    const attempts = t.sell_attempts + 1;
    await save(t.id, {
      status: attempts >= MAX_SELL_ATTEMPTS ? "error" : "abierta",
      sell_attempts: attempts,
      note: attempts >= MAX_SELL_ATTEMPTS ? `No se pudo vender tras ${attempts} intentos: véndelo a mano (${msg})` : `Venta fallida, se reintenta: ${msg}`,
    });
    return msg;
  }
}

/** «Vender ya» desde la pantalla. */
export async function sellManual(workspaceId: string, idInput: unknown) {
  const t = await prisma.trading_manual_trades.findFirst({ where: { id: String(idInput ?? ""), workspace_id: workspaceId } });
  if (!t) throw new Error("Esa operación no existe");
  if (t.status !== "abierta") throw new Error("Esa operación no está abierta");
  const err = await sellTrade(t, "la vendiste tú");
  if (err) throw new Error(`No se pudo vender: ${err}`);
  return { ok: true };
}

/** Una pasada de todas las operaciones abiertas (desde el cron, cada ~5 min). */
export async function runManual() {
  const stale = new Date(Date.now() - STALE_MS);
  await prisma.trading_manual_trades.updateMany({ where: { status: "vendiendo", updated_at: { lt: stale } }, data: { status: "abierta", sell_attempts: { increment: 1 }, updated_at: new Date() } });
  await prisma.trading_manual_trades.updateMany({
    where: { status: "abriendo", updated_at: { lt: stale } },
    data: { status: "error", note: "Se cortó a medias al comprar: revisa tu exchange", updated_at: new Date() },
  });
  const open = await prisma.trading_manual_trades.findMany({ where: { status: "abierta" } });
  const actions: string[] = [];
  for (const t of open) {
    try {
      const price = await referencePrice(t.symbol);
      if (!price || !t.entry_price) continue;
      const step = manualStep({ entry: t.entry_price, stop: t.stop, target: t.target, trail: t.trail, trailing: t.trailing }, price);
      if (!step) continue;
      if ("sell" in step) {
        const err = await sellTrade(t, step.sell);
        actions.push(`${coin(t.symbol)}: ${err ? `venta fallida (${err})` : `vendido (${step.sell})`}`);
      } else {
        await save(t.id, { stop: step.stop, trailing: step.trailing, note: `Objetivo superado: el stop sube a ${step.stop.toFixed(4)} € y sigue mientras suba` });
        actions.push(`${coin(t.symbol)}: stop sube a ${step.stop.toFixed(4)}`);
      }
    } catch (e) {
      actions.push(`${coin(t.symbol)}: error (${e instanceof Error ? e.message.slice(0, 120) : "desconocido"})`);
    }
  }
  return { open: open.length, actions };
}
