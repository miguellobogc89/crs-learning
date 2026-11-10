// lib/trading/accounts.ts
// Cartera virtual por espacio de trabajo: ajustes, órdenes, cierre y proceso diario.
import "server-only";
import type { trading_accounts, trading_positions } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PATTERN_LIBRARY } from "./library";
import { cashDelta, fillAtOpen, marketValue, realizedPnl, stepPosition } from "./paper";
import { isCryptoMarket, lotStepOf } from "./market-data";
import { closeSide, commission, openSide, roundQty, slipped, type CostModel } from "./risk";
import { dayDate, dayKey, loadSeries } from "./sync";
import type { Direction, PatternKey } from "./types";

const PATTERN_KEYS = new Set<string>(PATTERN_LIBRARY.map((p) => p.key));

export const OPEN_STATUSES = ["pendiente", "abierta"] as const;

export function costOf(a: trading_accounts): CostModel {
  return { commissionPct: a.commission_pct, commissionMin: a.commission_min, slippageBps: a.slippage_bps };
}

/** Fecha (AAAA-MM-DD) en Madrid. */
export function madridDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
}

/** Cartera de un espacio. `agent` vacío = la del usuario; si no, la del agente. */
export async function ensureAccount(workspaceId: string, agent = "", defaults: AccountDefaults = {}) {
  const key = { workspace_id_agent: { workspace_id: workspaceId, agent } };
  const found = await prisma.trading_accounts.findUnique({ where: key });
  if (found) return found;
  const capital = defaults.capital ?? 10_000;
  return prisma.trading_accounts.upsert({
    where: key,
    create: {
      workspace_id: workspaceId,
      agent,
      ...(defaults.name ? { name: defaults.name } : {}),
      initial_capital: capital,
      cash: capital,
      ...(defaults.settings ?? {}),
      transactions: {
        create: { kind: "aportación", amount: capital, description: "Capital inicial", day: dayDate(madridDay()) },
      },
    },
    update: {},
  });
}

export type AccountDefaults = {
  name?: string;
  capital?: number;
  settings?: Partial<Pick<trading_accounts, "risk_per_trade_pct" | "max_position_pct" | "max_open_positions" | "commission_pct" | "commission_min" | "slippage_bps" | "breakeven">>;
};

/** Último cierre de cada instrumento. */
export async function latestCloses(instrumentIds: string[]) {
  if (!instrumentIds.length) return new Map<string, { close: number; day: Date }>();
  const rows = await prisma.$queryRaw<{ instrument_id: string; close: number; day: Date }[]>`
    SELECT DISTINCT ON (instrument_id) instrument_id, close, day
    FROM market_candles
    WHERE instrument_id = ANY(${instrumentIds}::uuid[])
    ORDER BY instrument_id, day DESC`;
  return new Map<string, { close: number; day: Date }>(rows.map((r) => [r.instrument_id, { close: r.close, day: r.day }]));
}

export type PositionView = {
  id: string;
  symbol: string;
  name: string;
  direction: Direction;
  status: string;
  quantity: number;
  plannedEntry: number;
  entryPrice: number | null;
  entryDay: string | null;
  stop: number;
  initialStop: number;
  target: number;
  lastPrice: number | null;
  marketValue: number | null;
  unrealized: number | null;
  unrealizedR: number | null;
  exitPrice: number | null;
  exitDay: string | null;
  exitReason: string | null;
  pnl: number | null;
  rMultiple: number | null;
  fees: number;
  pattern: PatternKey | null;
  score: number | null;
  source: string;
  notes: string | null;
  maxHoldUntil: string | null;
  createdAt: string;
};

export type AccountSummary = {
  id: string;
  name: string;
  initialCapital: number;
  cash: number;
  equity: number;
  invested: number;
  realized: number;
  unrealized: number;
  returnPct: number;
  settings: {
    riskPerTradePct: number;
    maxPositionPct: number;
    maxOpenPositions: number;
    commissionPct: number;
    commissionMin: number;
    slippageBps: number;
    allowShort: boolean;
    autoTrade: boolean;
    minScore: number;
    breakeven: boolean;
    patterns: string[];
  };
  lastProcessedDay: string | null;
  stats: { closed: number; wins: number; winRate: number; avgR: number; profitFactor: number | null; bestTrade: number; worstTrade: number };
};

function viewPosition(p: trading_positions & { instrument: { name: string } }, last?: { close: number }): PositionView {
  const open = p.status === "abierta" && p.entry_price !== null;
  const lastPrice = last?.close ?? null;
  const dir = p.direction as Direction;
  const unrealized =
    open && lastPrice !== null ? realizedPnl(dir, p.quantity, p.entry_price!, lastPrice) - p.fees : null;
  const risk = Math.abs((p.entry_price ?? p.planned_entry) - p.initial_stop) * p.quantity;
  return {
    id: p.id,
    symbol: p.symbol,
    name: p.instrument.name,
    direction: dir,
    status: p.status,
    quantity: p.quantity,
    plannedEntry: p.planned_entry,
    entryPrice: p.entry_price,
    entryDay: p.entry_day ? dayKey(p.entry_day) : null,
    stop: p.stop,
    initialStop: p.initial_stop,
    target: p.target,
    lastPrice,
    marketValue: open && lastPrice !== null ? p.quantity * lastPrice : null,
    unrealized,
    unrealizedR: unrealized !== null && risk > 0 ? unrealized / risk : null,
    exitPrice: p.exit_price,
    exitDay: p.exit_day ? dayKey(p.exit_day) : null,
    exitReason: p.exit_reason,
    pnl: p.pnl,
    rMultiple: p.r_multiple,
    fees: p.fees,
    pattern: (p.pattern as PatternKey | null) ?? null,
    score: p.score,
    source: p.source,
    notes: p.notes,
    maxHoldUntil: p.max_hold_until ? dayKey(p.max_hold_until) : null,
    createdAt: p.created_at.toISOString(),
  };
}

export async function accountState(workspaceId: string, agent = "") {
  const account = await ensureAccount(workspaceId, agent);
  const positions = await prisma.trading_positions.findMany({
    where: { account_id: account.id },
    include: { instrument: { select: { name: true } } },
    orderBy: { created_at: "desc" },
    take: 500,
  });
  const closes = await latestCloses([...new Set(positions.filter((p) => p.status === "abierta").map((p) => p.instrument_id))]);
  const views = positions.map((p) => viewPosition(p, closes.get(p.instrument_id)));
  const open = views.filter((p) => p.status === "abierta");
  let mv = 0;
  let invested = 0;
  for (const p of open) {
    const price = p.lastPrice ?? p.entryPrice ?? p.plannedEntry;
    mv += marketValue(p.direction, p.quantity, price);
    invested += p.quantity * price;
  }
  const equity = account.cash + mv;
  const closed = views.filter((p) => p.status === "cerrada" && p.pnl !== null);
  const wins = closed.filter((p) => p.pnl! > 0);
  const gw = wins.reduce((s, p) => s + p.pnl!, 0);
  const gl = -closed.filter((p) => p.pnl! < 0).reduce((s, p) => s + p.pnl!, 0);
  const rs = closed.map((p) => p.rMultiple ?? 0);
  const summary: AccountSummary = {
    id: account.id,
    name: account.name,
    initialCapital: account.initial_capital,
    cash: account.cash,
    equity,
    invested,
    realized: closed.reduce((s, p) => s + p.pnl!, 0),
    unrealized: open.reduce((s, p) => s + (p.unrealized ?? 0), 0),
    returnPct: ((equity - account.initial_capital) / account.initial_capital) * 100,
    settings: {
      riskPerTradePct: account.risk_per_trade_pct,
      maxPositionPct: account.max_position_pct,
      maxOpenPositions: account.max_open_positions,
      commissionPct: account.commission_pct,
      commissionMin: account.commission_min,
      slippageBps: account.slippage_bps,
      allowShort: account.allow_short,
      autoTrade: account.auto_trade,
      minScore: account.min_score,
      breakeven: account.breakeven,
      patterns: account.patterns,
    },
    lastProcessedDay: account.last_processed_day ? dayKey(account.last_processed_day) : null,
    stats: {
      closed: closed.length,
      wins: wins.length,
      winRate: closed.length ? wins.length / closed.length : 0,
      avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : 0,
      profitFactor: gl > 0 ? gw / gl : null,
      bestTrade: closed.length ? Math.max(...closed.map((p) => p.pnl!)) : 0,
      worstTrade: closed.length ? Math.min(...closed.map((p) => p.pnl!)) : 0,
    },
  };
  return { account, summary, positions: views };
}

export async function accountDetail(workspaceId: string, agent = "") {
  const state = await accountState(workspaceId, agent);
  const [equity, transactions] = await Promise.all([
    prisma.trading_equity.findMany({ where: { account_id: state.account.id }, orderBy: { day: "asc" }, take: 2000 }),
    prisma.trading_transactions.findMany({ where: { account_id: state.account.id }, orderBy: { created_at: "desc" }, take: 200 }),
  ]);
  return {
    summary: state.summary,
    positions: state.positions,
    equity: equity.map((e) => ({ day: dayKey(e.day), equity: e.equity, cash: e.cash, invested: e.invested })),
    transactions: transactions.map((t) => ({
      id: t.id,
      kind: t.kind,
      amount: t.amount,
      description: t.description,
      day: t.day ? dayKey(t.day) : null,
      createdAt: t.created_at.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------
const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

export async function updateSettings(workspaceId: string, input: Record<string, unknown>) {
  const a = await ensureAccount(workspaceId);
  const patterns = Array.isArray(input.patterns)
    ? input.patterns.filter((p): p is string => typeof p === "string" && PATTERN_KEYS.has(p)).slice(0, 20)
    : a.patterns;
  await prisma.trading_accounts.update({
    where: { id: a.id },
    data: {
      name: typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 80) : a.name,
      risk_per_trade_pct: num(input.riskPerTradePct, 0.1, 5, a.risk_per_trade_pct),
      max_position_pct: num(input.maxPositionPct, 1, 100, a.max_position_pct),
      max_open_positions: Math.round(num(input.maxOpenPositions, 1, 40, a.max_open_positions)),
      commission_pct: num(input.commissionPct, 0, 2, a.commission_pct),
      commission_min: num(input.commissionMin, 0, 50, a.commission_min),
      slippage_bps: num(input.slippageBps, 0, 100, a.slippage_bps),
      allow_short: bool(input.allowShort, a.allow_short),
      auto_trade: bool(input.autoTrade, a.auto_trade),
      min_score: Math.round(num(input.minScore, 0, 100, a.min_score)),
      breakeven: bool(input.breakeven, a.breakeven),
      patterns,
      updated_at: new Date(),
    },
  });
}

/** Borra posiciones y movimientos y vuelve a empezar con el capital indicado. */
export async function resetAccount(workspaceId: string, capitalInput: unknown, agent = "") {
  const a = await ensureAccount(workspaceId, agent);
  const capital = Math.round(num(capitalInput, 500, 10_000_000, a.initial_capital));
  await prisma.$transaction([
    prisma.trading_positions.deleteMany({ where: { account_id: a.id } }),
    prisma.trading_transactions.deleteMany({ where: { account_id: a.id } }),
    prisma.trading_equity.deleteMany({ where: { account_id: a.id } }),
    prisma.trading_accounts.update({
      where: { id: a.id },
      data: { initial_capital: capital, cash: capital, last_processed_day: null, updated_at: new Date() },
    }),
    prisma.trading_transactions.create({
      data: { account_id: a.id, kind: "aportación", amount: capital, description: "Capital inicial (cartera reiniciada)", day: dayDate(madridDay()) },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Órdenes
// ---------------------------------------------------------------------------
export type OrderInput = {
  symbol: string;
  direction: Direction;
  quantity: number;
  stop: number;
  target: number;
  execution: "next_open" | "now";
  pattern?: PatternKey | null;
  signalKey?: string | null;
  score?: number | null;
  maxHoldDays?: number | null;
  notes?: string | null;
  source?: "manual" | "auto" | "comite" | "agente";
};

export function parseOrder(body: Record<string, unknown>): OrderInput {
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase().slice(0, 20) : "";
  if (!symbol) throw new Error("Falta el valor");
  const direction = body.direction === "short" ? "short" : "long";
  const quantity = Number(body.quantity);
  const stop = Number(body.stop);
  const target = Number(body.target);
  if (!(quantity > 0 && quantity < 10_000_000)) throw new Error("Cantidad no válida");
  if (!(stop > 0) || !(target > 0)) throw new Error("Stop y objetivo son obligatorios");
  return {
    symbol,
    direction,
    quantity,
    stop,
    target,
    execution: body.execution === "now" ? "now" : "next_open",
    pattern: typeof body.pattern === "string" ? (body.pattern as PatternKey) : null,
    signalKey: typeof body.signalKey === "string" ? body.signalKey.slice(0, 200) : null,
    score: Number.isFinite(Number(body.score)) ? Math.round(Number(body.score)) : null,
    maxHoldDays: Number.isFinite(Number(body.maxHoldDays)) ? Math.round(Number(body.maxHoldDays)) : null,
    notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null,
  };
}

export async function placeOrder(workspaceId: string, userId: string | null, order: OrderInput, agent = "") {
  let o = order;
  const a = await ensureAccount(workspaceId, agent);
  const cost = costOf(a);
  if (o.direction === "short" && !a.allow_short)
    throw new Error("Las posiciones cortas están desactivadas en los ajustes de la cartera");
  const inst = await prisma.market_instruments.findUnique({ where: { symbol: o.symbol } });
  if (!inst) throw new Error(`No sigo el valor ${o.symbol}`);
  // Acciones enteras en bolsa; fracciones en crypto.
  o = { ...o, quantity: roundQty(isCryptoMarket(inst.market) ? o.quantity : Math.floor(o.quantity), lotStepOf(inst.market)) };
  if (!(o.quantity > 0)) throw new Error("Cantidad no válida");
  const last = (await latestCloses([inst.id])).get(inst.id);
  if (!last) throw new Error("Todavía no hay cotizaciones de este valor");
  const long = o.direction === "long";
  const ref = last.close;
  if (long ? !(o.stop < ref && o.target > ref) : !(o.stop > ref && o.target < ref))
    throw new Error(
      long
        ? "Para comprar, el stop tiene que estar por debajo del precio y el objetivo por encima"
        : "Para vender en corto, el stop tiene que estar por encima del precio y el objetivo por debajo",
    );
  const openCount = await prisma.trading_positions.count({ where: { account_id: a.id, status: { in: [...OPEN_STATUSES] } } });
  if (openCount >= a.max_open_positions)
    throw new Error(`Ya tienes ${openCount} posiciones abiertas o pendientes (máximo ${a.max_open_positions})`);
  const notional = o.quantity * ref;
  if (notional + commission(notional, cost) > a.cash + 1e-6)
    throw new Error("No hay efectivo suficiente en la cartera virtual para esa cantidad");
  if (o.signalKey) {
    const dup = await prisma.trading_positions.findFirst({ where: { account_id: a.id, signal_key: o.signalKey, status: { not: "cancelada" } } });
    if (dup) throw new Error("Ya abriste una posición con esta señal");
  }
  const holdDays = o.maxHoldDays && o.maxHoldDays > 0 ? o.maxHoldDays : null;
  const today = madridDay();
  const base = {
    account_id: a.id,
    workspace_id: workspaceId,
    instrument_id: inst.id,
    symbol: inst.symbol,
    direction: o.direction,
    quantity: o.quantity,
    planned_entry: ref,
    stop: o.stop,
    initial_stop: o.stop,
    target: o.target,
    max_hold_until: holdDays ? new Date(last.day.getTime() + Math.round(holdDays * 1.45) * 86_400_000) : null,
    pattern: o.pattern ?? null,
    signal_key: o.signalKey ?? null,
    score: o.score ?? null,
    source: o.source ?? "manual",
    notes: o.notes ?? null,
    created_by: userId,
  };
  if (o.execution === "next_open") {
    const p = await prisma.trading_positions.create({ data: { ...base, status: "pendiente" } });
    return { id: p.id, status: "pendiente" as const };
  }
  // Ejecución inmediata al último cierre disponible.
  const price = slipped(ref, openSide(o.direction), cost);
  const fee = commission(price * o.quantity, cost);
  const delta = cashDelta(o.direction, "open", o.quantity, price, fee);
  const p = await prisma.$transaction(async (tx) => {
    const created = await tx.trading_positions.create({
      data: { ...base, status: "abierta", entry_price: price, entry_day: last.day, fees: fee, planned_entry: price },
    });
    await tx.trading_accounts.update({ where: { id: a.id }, data: { cash: { increment: delta }, updated_at: new Date() } });
    await tx.trading_transactions.create({
      data: {
        account_id: a.id,
        position_id: created.id,
        kind: long ? "compra" : "venta corto",
        amount: delta,
        description: `${long ? "Compra" : "Venta en corto"} de ${o.quantity} ${inst.symbol} a ${price.toFixed(3)} € (comisión ${fee.toFixed(2)} €)`,
        day: dayDate(today),
      },
    });
    return created;
  });
  return { id: p.id, status: "abierta" as const };
}

async function closeWith(
  a: trading_accounts,
  p: trading_positions,
  rawPrice: number,
  day: Date,
  reason: string,
  alreadySlipped = false,
) {
  const cost = costOf(a);
  const dir = p.direction as Direction;
  const price = alreadySlipped ? rawPrice : slipped(rawPrice, closeSide(dir), cost);
  const fee = commission(price * p.quantity, cost);
  const delta = cashDelta(dir, "close", p.quantity, price, fee);
  const fees = p.fees + fee;
  const pnl = realizedPnl(dir, p.quantity, p.entry_price!, price) - fees;
  const risk = Math.abs(p.entry_price! - p.initial_stop) * p.quantity;
  await prisma.$transaction([
    prisma.trading_positions.update({
      where: { id: p.id },
      data: {
        status: "cerrada",
        exit_price: price,
        exit_day: day,
        exit_reason: reason,
        fees,
        pnl,
        r_multiple: risk > 0 ? pnl / risk : null,
        updated_at: new Date(),
      },
    }),
    prisma.trading_accounts.update({ where: { id: a.id }, data: { cash: { increment: delta }, updated_at: new Date() } }),
    prisma.trading_transactions.create({
      data: {
        account_id: a.id,
        position_id: p.id,
        kind: dir === "long" ? "venta" : "recompra",
        amount: delta,
        description: `Cierre (${reason}) de ${p.quantity} ${p.symbol} a ${price.toFixed(3)} €: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} €`,
        day,
      },
    }),
  ]);
  a.cash += delta;
}

export async function closePosition(workspaceId: string, positionId: string, agent = "", reason = "manual") {
  if (!/^[0-9a-f-]{36}$/i.test(positionId)) throw new Error("Posición no válida");
  const a = await ensureAccount(workspaceId, agent);
  const p = await prisma.trading_positions.findFirst({ where: { id: positionId, account_id: a.id } });
  if (!p) throw new Error("La posición no existe");
  if (p.status === "pendiente") {
    await prisma.trading_positions.update({
      where: { id: p.id },
      data: { status: "cancelada", exit_reason: reason === "manual" ? "cancelada por el usuario" : reason, updated_at: new Date() },
    });
    return { status: "cancelada" };
  }
  if (p.status !== "abierta") throw new Error("La posición ya está cerrada");
  const last = (await latestCloses([p.instrument_id])).get(p.instrument_id);
  if (!last) throw new Error("No hay precio para cerrar");
  await closeWith(a, p, last.close, last.day, reason);
  return { status: "cerrada" };
}

export async function updateStops(workspaceId: string, positionId: string, input: Record<string, unknown>, agent = "") {
  const a = await ensureAccount(workspaceId, agent);
  const p = await prisma.trading_positions.findFirst({ where: { id: positionId, account_id: a.id, status: { in: [...OPEN_STATUSES] } } });
  if (!p) throw new Error("La posición no existe o ya está cerrada");
  const stop = Number(input.stop);
  const target = Number(input.target);
  const ref = p.entry_price ?? p.planned_entry;
  const long = p.direction === "long";
  if (!(stop > 0 && target > 0)) throw new Error("Valores no válidos");
  if (long ? target <= stop : target >= stop) throw new Error("El objetivo tiene que estar al otro lado del stop");
  await prisma.trading_positions.update({
    where: { id: p.id },
    data: { stop, target, ...(p.status === "pendiente" ? { initial_stop: stop } : {}), updated_at: new Date() },
  });
  return { ok: true, ref };
}

// ---------------------------------------------------------------------------
// Proceso diario: ejecutar pendientes, vigilar stops/objetivos y anotar el patrimonio.
// ---------------------------------------------------------------------------
export type ProcessSummary = { filled: number; cancelled: number; closed: number; processedUntil: string | null };

export async function processAccount(accountId: string): Promise<ProcessSummary> {
  const a = await prisma.trading_accounts.findUnique({ where: { id: accountId } });
  const out: ProcessSummary = { filled: 0, cancelled: 0, closed: 0, processedUntil: null };
  if (!a) return out;
  const cost = costOf(a);
  const positions = await prisma.trading_positions.findMany({
    where: { account_id: a.id, status: { in: [...OPEN_STATUSES] } },
    orderBy: { created_at: "asc" },
  });
  const watermark = a.last_processed_day ? a.last_processed_day.getTime() : -Infinity;
  const since = positions.reduce((m, p) => {
    const d = p.entry_day ? p.entry_day.getTime() : dayDate(madridDay(p.created_at)).getTime();
    return Math.min(m, d);
  }, Date.now());
  const series = await loadSeries([...new Set(positions.map((p) => p.instrument_id))], new Date(since - 86_400_000));
  let maxDay = watermark;

  for (const p of positions) {
    const candles = series.get(p.instrument_id) ?? [];
    let pos = p;
    let startAfter: number;
    let k = 0;
    if (pos.status === "pendiente") {
      const created = dayDate(madridDay(pos.created_at)).getTime();
      k = candles.findIndex((c) => c.t > created);
      if (k < 0) continue;
      const bar = candles[k];
      const fill = fillAtOpen(
        { direction: pos.direction as Direction, quantity: pos.quantity, stop: pos.stop, target: pos.target },
        bar,
        cost,
      );
      const day = new Date(bar.t);
      if (fill.kind === "cancelled") {
        await prisma.trading_positions.update({
          where: { id: pos.id },
          data: { status: "cancelada", exit_reason: fill.reason, exit_day: day, updated_at: new Date() },
        });
        out.cancelled++;
        continue;
      }
      const notional = fill.price * pos.quantity;
      if (notional + fill.commission > a.cash + 1e-6) {
        await prisma.trading_positions.update({
          where: { id: pos.id },
          data: { status: "cancelada", exit_reason: "Sin efectivo suficiente al ejecutar", exit_day: day, updated_at: new Date() },
        });
        out.cancelled++;
        continue;
      }
      const delta = cashDelta(pos.direction as Direction, "open", pos.quantity, fill.price, fill.commission);
      // El stop y el objetivo se mantienen en precio; la salida por tiempo cuenta desde la ejecución.
      const holdMs = pos.max_hold_until ? pos.max_hold_until.getTime() - pos.created_at.getTime() : null;
      const [updated] = await prisma.$transaction([
        prisma.trading_positions.update({
          where: { id: pos.id },
          data: {
            status: "abierta",
            entry_price: fill.price,
            entry_day: day,
            fees: fill.commission,
            ...(holdMs ? { max_hold_until: new Date(bar.t + holdMs) } : {}),
            updated_at: new Date(),
          },
        }),
        prisma.trading_accounts.update({ where: { id: a.id }, data: { cash: { increment: delta } } }),
        prisma.trading_transactions.create({
          data: {
            account_id: a.id,
            position_id: pos.id,
            kind: pos.direction === "long" ? "compra" : "venta corto",
            amount: delta,
            description: `${pos.direction === "long" ? "Compra" : "Venta en corto"} de ${pos.quantity} ${pos.symbol} a ${fill.price.toFixed(3)} € en la apertura (comisión ${fill.commission.toFixed(2)} €)`,
            day,
          },
        }),
      ]);
      a.cash += delta;
      out.filled++;
      pos = updated;
      startAfter = bar.t - 1; // La vela de la ejecución también se vigila.
    } else {
      startAfter = Math.max(watermark, pos.entry_day!.getTime());
    }

    let stop = pos.stop;
    for (const bar of candles) {
      if (bar.t <= startAfter) continue;
      maxDay = Math.max(maxDay, bar.t);
      const r = stepPosition(
        {
          direction: pos.direction as Direction,
          quantity: pos.quantity,
          entryPrice: pos.entry_price!,
          stop,
          initialStop: pos.initial_stop,
          target: pos.target,
          maxHoldUntil: pos.max_hold_until ? pos.max_hold_until.getTime() : null,
          breakeven: a.breakeven,
        },
        bar,
        cost,
      );
      if (r.kind === "exit") {
        await closeWith(a, { ...pos, stop }, r.price, new Date(bar.t), r.reason, true);
        out.closed++;
        stop = NaN;
        break;
      }
      stop = r.stop;
    }
    if (Number.isFinite(stop) && stop !== pos.stop)
      await prisma.trading_positions.update({ where: { id: pos.id }, data: { stop, updated_at: new Date() } });
  }

  // Día de referencia: la última sesión con datos del mercado.
  const lastMarket = await prisma.market_instruments.aggregate({ _max: { last_candle_at: true }, where: { active: true } });
  const refDay = lastMarket._max.last_candle_at ?? (Number.isFinite(maxDay) ? new Date(maxDay) : null);
  if (refDay) {
    const open = await prisma.trading_positions.findMany({ where: { account_id: a.id, status: "abierta" } });
    const closes = await latestCloses([...new Set(open.map((p) => p.instrument_id))]);
    let mv = 0;
    let invested = 0;
    for (const p of open) {
      const price = closes.get(p.instrument_id)?.close ?? p.entry_price ?? p.planned_entry;
      mv += marketValue(p.direction as Direction, p.quantity, price);
      invested += p.quantity * price;
    }
    const fresh = await prisma.trading_accounts.findUnique({ where: { id: a.id }, select: { cash: true } });
    const cash = fresh?.cash ?? a.cash;
    await prisma.trading_equity.upsert({
      where: { account_id_day: { account_id: a.id, day: refDay } },
      create: { account_id: a.id, day: refDay, equity: cash + mv, cash, invested },
      update: { equity: cash + mv, cash, invested },
    });
    await prisma.trading_accounts.update({ where: { id: a.id }, data: { last_processed_day: refDay } });
    out.processedUntil = dayKey(refDay);
  }
  return out;
}
