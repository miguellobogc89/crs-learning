// lib/trading/mirror/service.ts
// Copia de agentes en tu bróker. Cada pocos minutos (cron) compara las posiciones abiertas del agente con
// tus tramos y compra o vende lo que falte. Dos modos:
// - ensayo: calcula la orden exacta (par, cantidad ajustada al exchange, precio del momento) y la apunta sin enviarla;
// - real: la envía a tu exchange de cripto (Bitvavo, Binance…) por la pasarela de brókeres (permiso «automatismos», entorno real y
//   BROKERS_REAL_ENABLED=true; cada orden con clave de idempotencia: nunca se envía dos veces).
// Nunca toca retiros ni transferencias: solo compra y venta a mercado de pares en euros.
import "server-only";
import type { trading_mirror_legs, trading_mirrors } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import * as brokers from "@/lib/brokers/gateway";
import { brokerRegistry } from "@/lib/brokers/providers";
import { normalizePermissions, parsePermissions, realEnabledFromEnv } from "@/lib/brokers/policy";
import { BrokerError } from "@/lib/brokers/types";
import { accountState } from "../accounts";
import { AGENTS_WORKSPACE, agentByKey } from "../agents/roster";
import { kamikazeByKey } from "../kamikaze/roster";
import { referencePrice } from "../kamikaze/market";
import { legResult, MIN_ORDER_EUR, planMirror, stepQuantity } from "./logic";

const MODES = ["ensayo", "real"] as const;
export type MirrorMode = (typeof MODES)[number];
/** Tope por copia mientras esto se valida (se sube con TRADING_MIRROR_MAX_EUR). */
export const maxBudget = () => Math.max(5, Number(process.env.TRADING_MIRROR_MAX_EUR) || 100);
const STALE_MS = 10 * 60_000;
const MAX_SELL_ATTEMPTS = 5;

const agentName = (key: string) => agentByKey(key)?.name ?? kamikazeByKey(key)?.name ?? null;

/** Exchange de cripto conectado a la cartera (Binance, Bitvavo…) y si puede operar en real sin preguntar. */
async function realConnection(workspaceId: string) {
  const conn = await brokers.tradingConnection(workspaceId, "copia de agentes");
  const row = conn ? await prisma.broker_connections.findUnique({ where: { id: conn.connectionId } }) : null;
  const crypto = !!row && brokerRegistry.has(row.provider) && brokerRegistry.get(row.provider).info.markets.includes("crypto");
  const auto = !!row && normalizePermissions(parsePermissions(row.permissions)).includes("auto");
  return {
    conn,
    crypto,
    name: conn?.providerName ?? "el exchange",
    environment: conn?.environment ?? null,
    auto,
    realEnabled: realEnabledFromEnv(),
    ready: !!conn && crypto && conn.environment === "real" && auto && realEnabledFromEnv(),
  };
}

function realProblem(r: Awaited<ReturnType<typeof realConnection>>) {
  if (!r.conn || !r.crypto) return "Conecta un exchange de cripto (Bitvavo, Binance…) en Trading → Integraciones y úsalo para la cartera";
  if (r.environment !== "real") return `La conexión de ${r.name} es de pruebas, no real`;
  if (!r.auto) return `Da a la conexión de ${r.name} el permiso de automatismos (operar sin confirmar cada orden)`;
  if (!r.realEnabled) return "El dinero real no está habilitado en el servidor (BROKERS_REAL_ENABLED=true)";
  return null;
}

// ---------------------------------------------------------------------------
// Pantalla y ajustes
// ---------------------------------------------------------------------------
export async function mirrorView(workspaceId: string) {
  const [mirrors, real] = await Promise.all([
    prisma.trading_mirrors.findMany({
      where: { workspace_id: workspaceId },
      include: { legs: { orderBy: { created_at: "desc" }, take: 60 } },
      orderBy: { created_at: "asc" },
    }),
    realConnection(workspaceId),
  ]);
  return {
    maxBudget: maxBudget(),
    real: { ready: real.ready, problem: realProblem(real) },
    mirrors: mirrors.map((m) => ({
      agent: m.agent,
      name: agentName(m.agent) ?? m.agent,
      budget: m.budget,
      mode: m.mode as MirrorMode,
      active: m.active,
      startedAt: m.started_at.toISOString(),
      result: m.legs.reduce((s, l) => s + (l.result ?? 0), 0),
      legs: m.legs.map((l) => ({
        id: l.id,
        mode: l.mode,
        symbol: l.symbol,
        pair: l.pair,
        status: l.status,
        amount: l.amount,
        quantity: l.quantity,
        entryPrice: l.entry_price,
        exitPrice: l.exit_price,
        result: l.result,
        note: l.note,
        openedAt: l.opened_at?.toISOString() ?? null,
        closedAt: l.closed_at?.toISOString() ?? null,
        createdAt: l.created_at.toISOString(),
      })),
    })),
  };
}

export async function setMirror(workspaceId: string, input: { agent?: unknown; budget?: unknown; mode?: unknown }) {
  const agent = String(input.agent ?? "");
  if (!agentName(agent)) throw new Error("Agente desconocido");
  const budget = Math.round(Number(String(input.budget ?? "").replace(",", ".")) * 100) / 100;
  if (!(budget >= 5 && budget <= maxBudget())) throw new Error(`El presupuesto tiene que estar entre 5 € y ${maxBudget()} €`);
  const mode = String(input.mode ?? "ensayo") as MirrorMode;
  if (!(MODES as readonly string[]).includes(mode)) throw new Error("Modo no válido");
  if (mode === "real") {
    const problem = realProblem(await realConnection(workspaceId));
    if (problem) throw new Error(problem);
  }
  const existing = await prisma.trading_mirrors.findUnique({ where: { workspace_id_agent: { workspace_id: workspaceId, agent } } });
  if (existing?.active && existing.mode !== mode) {
    const open = await prisma.trading_mirror_legs.count({ where: { mirror_id: existing.id, status: { in: ["abriendo", "abierta", "vendiendo"] } } });
    if (open) throw new Error("Tiene una posición abierta: espera a que salga (o deja de copiar) antes de cambiar de modo");
  }
  const restart = !existing?.active;
  const row = await prisma.trading_mirrors.upsert({
    where: { workspace_id_agent: { workspace_id: workspaceId, agent } },
    create: { workspace_id: workspaceId, agent, budget, mode },
    update: { budget, mode, active: true, ...(restart ? { started_at: new Date() } : {}), updated_at: new Date() },
  });
  return { agent, budget: row.budget, mode: row.mode };
}

/** Deja de copiar: vende lo que haya abierto (en real, a mercado en tu exchange). */
export async function stopMirror(workspaceId: string, agentInput: unknown) {
  const agent = String(agentInput ?? "");
  const m = await prisma.trading_mirrors.findUnique({ where: { workspace_id_agent: { workspace_id: workspaceId, agent } } });
  if (!m || !m.active) throw new Error("No estás copiando a este agente");
  await prisma.trading_mirrors.update({ where: { id: m.id }, data: { active: false, updated_at: new Date() } });
  const open = await prisma.trading_mirror_legs.findMany({ where: { mirror_id: m.id, status: "abierta" } });
  const errors: string[] = [];
  for (const l of open) {
    const r = await sellLeg(m, l, "dejas de copiar");
    if (r) errors.push(r);
  }
  return { sold: open.length - errors.length, errors };
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------
const note = (id: string, data: Partial<trading_mirror_legs>) =>
  prisma.trading_mirror_legs.update({ where: { id }, data: { ...data, updated_at: new Date() } });

type Venue = { name: string; pair: string; step: number | null } | { name: string; missing: string };

/**
 * Dónde se operaría el símbolo: en el exchange conectado (si lo hay), con su par y su paso de cantidad.
 * En ensayo sin exchange conectado se da por bueno si hay precio de referencia.
 */
async function venueFor(workspaceId: string, symbol: string): Promise<Venue> {
  const r = await realConnection(workspaceId);
  if (!r.conn || !r.crypto) return { name: "tu exchange", pair: symbol, step: null };
  const res = await brokers.resolveSymbol(r.conn.actor, r.conn.connectionId, { symbol, market: "crypto" });
  if (res.status === "ok") return { name: r.name, pair: res.instrument.providerSymbol, step: res.instrument.quantityStep };
  return { name: r.name, missing: res.status === "unsupported" ? res.reason : `${r.name} no tiene ${symbol}: no se puede copiar` };
}

/** Envía una orden a mercado y devuelve lo ejecutado (cantidad y precio medio). */
async function realOrder(workspaceId: string, side: "buy" | "sell", symbol: string, pair: string, quantity: number, key: string) {
  const r = await realConnection(workspaceId);
  const problem = realProblem(r);
  if (problem || !r.conn) throw new BrokerError("permission_denied", problem ?? "Sin conexión");
  const res = await brokers.placeOrder(r.conn.actor, {
    connectionId: r.conn.connectionId,
    environment: r.conn.environment,
    instrument: { symbol, market: "crypto" },
    providerSymbol: pair,
    side,
    type: "market",
    quantity,
    idempotencyKey: key,
    reference: `copia de agente ${symbol}`,
  });
  if (res.status === "rejected" || !res.orderId) throw new BrokerError("conflict", res.status === "rejected" ? `${r.name} rechazó la orden` : `Orden sin confirmar: revisa ${r.name}`);
  const o = await brokers.getOrder(r.conn.actor, r.conn.connectionId, res.orderId).catch(() => null);
  return { orderId: res.orderId, filled: o?.filledQuantity ?? null, price: o?.averageFillPrice ?? null, name: r.name };
}

async function buyLeg(m: trading_mirrors, legId: string, symbol: string, amount: number) {
  const venue = await venueFor(m.workspace_id, symbol).catch((e) => ({ name: "el exchange", missing: `No se pudo comprobar el par: ${e instanceof Error ? e.message.slice(0, 120) : "error"}` }) as Venue);
  if ("missing" in venue) return note(legId, { status: "omitida", note: venue.missing });
  const price = await referencePrice(symbol);
  if (!price) return note(legId, { status: "omitida", pair: venue.pair, note: "Sin precio de referencia en este momento" });

  if (m.mode === "ensayo") {
    const quantity = stepQuantity(amount, price, venue.step);
    if (!(quantity > 0) || quantity * price < MIN_ORDER_EUR) return note(legId, { status: "omitida", pair: venue.pair, note: `Con ${amount.toFixed(2)} € no llega al mínimo por orden` });
    return note(legId, {
      status: "abierta",
      pair: venue.pair,
      quantity,
      entry_price: price,
      amount: quantity * price,
      opened_at: new Date(),
      note: `Ensayo: se habría comprado ${quantity} ${symbol.replace(/-EUR$/, "")} a mercado en ${venue.name} (${venue.pair})`,
    });
  }

  try {
    const r = await realConnection(m.workspace_id);
    if (!r.conn) throw new BrokerError("not_connected", realProblem(r) ?? "Sin conexión");
    const cash = (await brokers.getAccounts(r.conn.actor, r.conn.connectionId))[0]?.cashAvailable ?? 0;
    const spend = Math.min(amount, cash * 0.98);
    if (spend < MIN_ORDER_EUR) return note(legId, { status: "omitida", pair: venue.pair, note: `Sin euros libres en ${r.name} (hay ${cash.toFixed(2)} €)` });
    const quantity = stepQuantity(spend, price, venue.step);
    const o = await realOrder(m.workspace_id, "buy", symbol, venue.pair, quantity, `mirror:${legId}:compra`);
    const filled = o.filled && o.filled > 0 ? o.filled : quantity;
    const entry = o.price && o.price > 0 ? o.price : price;
    return note(legId, {
      status: "abierta",
      pair: venue.pair,
      quantity: filled,
      entry_price: entry,
      amount: filled * entry,
      buy_order_id: o.orderId,
      opened_at: new Date(),
      note: `Comprado en ${o.name} (orden ${o.orderId})`,
    });
  } catch (e) {
    const unknown = e instanceof BrokerError && e.code === "unknown_outcome";
    return note(legId, {
      status: unknown ? "error" : "omitida",
      pair: venue.pair,
      note: unknown ? `No se sabe si la compra se hizo: revisa ${venue.name}` : `No se pudo comprar: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`,
    });
  }
}

/** Vende un tramo abierto. Devuelve un texto de error o null. */
async function sellLeg(m: trading_mirrors, l: trading_mirror_legs, reason: string): Promise<string | null> {
  const claimed = await prisma.trading_mirror_legs.updateMany({ where: { id: l.id, status: "abierta" }, data: { status: "vendiendo", updated_at: new Date() } });
  if (claimed.count !== 1) return null;
  const pair = l.pair ?? l.symbol;
  const qty = l.quantity ?? 0;
  const entry = l.entry_price ?? 0;
  try {
    if (l.mode === "ensayo") {
      const price = (await referencePrice(l.symbol)) ?? entry;
      await note(l.id, { status: "cerrada", exit_price: price, result: legResult(qty, entry, price), closed_at: new Date(), note: `Ensayo: se habría vendido a mercado (${reason})` });
      return null;
    }
    const r = await realConnection(m.workspace_id);
    if (!r.conn) throw new BrokerError("not_connected", realProblem(r) ?? "Sin conexión");
    const venue = await venueFor(m.workspace_id, l.symbol);
    const step = "missing" in venue ? null : venue.step;
    const held = (await brokers.getPositions(r.conn.actor, r.conn.connectionId)).find((p) => p.providerSymbol === pair);
    const available = held ? held.quantityAvailable ?? held.quantity : 0;
    const sellQty = stepQuantity(Math.min(qty, available), 1, step);
    if (!(sellQty > 0)) {
      await note(l.id, { status: "cerrada", closed_at: new Date(), note: `Ya no estaba en ${r.name} (vendida fuera de la app): ${reason}` });
      return null;
    }
    const o = await realOrder(m.workspace_id, "sell", l.symbol, pair, sellQty, `mirror:${l.id}:venta:${l.sell_attempts}`);
    const exit = o.price && o.price > 0 ? o.price : ((await referencePrice(l.symbol)) ?? entry);
    await note(l.id, {
      status: "cerrada",
      exit_price: exit,
      result: legResult(o.filled && o.filled > 0 ? o.filled : sellQty, entry, exit),
      sell_order_id: o.orderId,
      closed_at: new Date(),
      note: `Vendido en ${o.name} (orden ${o.orderId}): ${reason}`,
    });
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
    const attempts = l.sell_attempts + 1;
    await note(l.id, {
      status: attempts >= MAX_SELL_ATTEMPTS ? "error" : "abierta",
      sell_attempts: attempts,
      note: attempts >= MAX_SELL_ATTEMPTS ? `No se pudo vender tras ${attempts} intentos: véndelo a mano (${msg})` : `Venta fallida, se reintenta: ${msg}`,
    });
    return msg;
  }
}

/** Una pasada de todas las copias activas (desde el cron, después de los agentes). */
export async function runMirrors() {
  const mirrors = await prisma.trading_mirrors.findMany({ where: { active: true } });
  const actions: string[] = [];
  for (const m of mirrors) {
    try {
      // Tramos que se quedaron a medias (corte del cron): la venta se reintenta; la compra la revisas tú.
      const stale = new Date(Date.now() - STALE_MS);
      await prisma.trading_mirror_legs.updateMany({
        where: { mirror_id: m.id, status: "vendiendo", updated_at: { lt: stale } },
        data: { status: "abierta", sell_attempts: { increment: 1 }, updated_at: new Date() },
      });
      await prisma.trading_mirror_legs.updateMany({
        where: { mirror_id: m.id, status: "abriendo", updated_at: { lt: stale } },
        data: { status: m.mode === "ensayo" ? "omitida" : "error", note: "Se cortó a medias al comprar: revisa tu exchange", updated_at: new Date() },
      });

      const agent = await accountState(AGENTS_WORKSPACE, m.agent);
      const open = agent.positions
        .filter((p) => p.status === "abierta")
        .map((p) => ({ id: p.id, symbol: p.symbol, quantity: p.quantity, price: p.entryPrice ?? p.plannedEntry, openedAt: new Date(p.createdAt).getTime() }));
      const legs = await prisma.trading_mirror_legs.findMany({ where: { mirror_id: m.id } });
      const plan = planMirror({
        open,
        legs: legs.map((l) => ({ sourceId: l.source_position_id, status: l.status, amount: l.amount })),
        agentEquity: agent.summary.equity,
        budget: m.budget,
        startedAt: m.started_at.getTime(),
        now: Date.now(),
      });

      for (const sourceId of plan.sells) {
        const l = legs.find((x) => x.source_position_id === sourceId);
        if (!l) continue;
        const err = await sellLeg(m, l, `${agentName(m.agent)} ha salido`);
        actions.push(`${m.agent} ${l.symbol}: ${err ? `venta fallida (${err})` : "vendido"}`);
      }
      for (const s of plan.skips) {
        await prisma.trading_mirror_legs
          .create({ data: { mirror_id: m.id, source_position_id: s.source.id, mode: m.mode, symbol: s.source.symbol, status: "omitida", note: s.reason } })
          .catch(() => undefined);
      }
      for (const b of plan.buys) {
        // El tramo se registra antes de comprar: su id es la clave de idempotencia de la orden.
        const leg = await prisma.trading_mirror_legs
          .create({ data: { mirror_id: m.id, source_position_id: b.source.id, mode: m.mode, symbol: b.source.symbol, amount: b.amount, status: "abriendo" } })
          .catch(() => null);
        if (!leg) continue;
        const done = await buyLeg(m, leg.id, b.source.symbol, b.amount);
        actions.push(`${m.agent} ${b.source.symbol}: ${done.status === "abierta" ? (m.mode === "ensayo" ? "compra (ensayo)" : "comprado") : done.note}`);
      }
    } catch (e) {
      actions.push(`${m.agent}: error (${e instanceof Error ? e.message.slice(0, 120) : "desconocido"})`);
    }
  }
  return { mirrors: mirrors.length, actions };
}
