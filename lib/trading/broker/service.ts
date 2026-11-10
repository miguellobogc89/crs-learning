// lib/trading/broker/service.ts
// Puente entre CRS y Trading 212 Demo: vincular valores, ejecutar compras protegidas
// (stop en el bróker + objetivo vigilado por la app) y revisar su estado.
import "server-only";
import type { trading_broker_brackets } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureAccount, latestCloses } from "../accounts";
import { isCryptoMarket } from "../market-data";
import {
  getTrading212DemoSummary,
  trading212CancelApiOrder,
  trading212Catalog,
  trading212DemoAvailable,
  trading212MarketOrder,
  trading212Snapshot,
  trading212StopSell,
  Trading212Error,
} from "../trading212";
import { brokerQuantity, decideBracket, matchInstrument, type BracketStatus, type BrokerSnapshot } from "./logic";

export const BROKER_AUTONOMY = ["nada", "aprobacion", "automatico"] as const;
export type BrokerAutonomy = (typeof BROKER_AUTONOMY)[number];
export const ACTIVE_BRACKET: BracketStatus[] = ["esperando_entrada", "protegida", "vendiendo"];

export function brokerAvailable() {
  return trading212DemoAvailable();
}

export async function brokerStatus(workspaceId: string) {
  const available = brokerAvailable();
  const account = await ensureAccount(workspaceId);
  const autonomy = (BROKER_AUTONOMY as readonly string[]).includes(account.broker_autonomy) ? (account.broker_autonomy as BrokerAutonomy) : "aprobacion";
  return { available, autonomy };
}

export async function setBrokerAutonomy(workspaceId: string, value: unknown) {
  if (!(BROKER_AUTONOMY as readonly string[]).includes(String(value))) throw new Error("Nivel de autonomía no válido");
  const a = await ensureAccount(workspaceId);
  await prisma.trading_accounts.update({ where: { id: a.id }, data: { broker_autonomy: String(value), updated_at: new Date() } });
  return { autonomy: value as BrokerAutonomy };
}

// ---------------------------------------------------------------------------
// Vinculación de valores
// ---------------------------------------------------------------------------
export async function linkInstruments(force = false) {
  if (!brokerAvailable()) throw new Trading212Error("Trading 212 Demo no está configurado en este servidor", 503);
  const catalog = await trading212Catalog();
  const instruments = await prisma.market_instruments.findMany({ where: { active: true, is_index: false } });
  const out: { symbol: string; name: string; status: string; ticker: string | null; detail: string | null }[] = [];
  for (const inst of instruments) {
    if (isCryptoMarket(inst.market)) {
      out.push({ symbol: inst.symbol, name: inst.name, status: "no_disponible", ticker: null, detail: "Trading 212 no opera criptomonedas en esta cuenta" });
      continue;
    }
    if (inst.broker_ticker && !force) {
      out.push({ symbol: inst.symbol, name: inst.name, status: "ok", ticker: inst.broker_ticker, detail: inst.broker_note });
      continue;
    }
    const m = matchInstrument(inst.symbol, catalog, inst.isin);
    const data =
      m.status === "ok"
        ? { broker_ticker: m.item.ticker, isin: m.item.isin ?? inst.isin, broker_note: `Vinculado por ${m.how}: ${m.item.name}` }
        : m.status === "ambiguo"
          ? { broker_ticker: null, broker_note: `Varios candidatos: ${m.candidates.map((c) => c.ticker).join(", ")}` }
          : { broker_ticker: null, broker_note: "No encontrado en el catálogo de Trading 212" };
    await prisma.market_instruments.update({ where: { id: inst.id }, data: { ...data, broker_checked_at: new Date() } });
    out.push({ symbol: inst.symbol, name: inst.name, status: m.status, ticker: data.broker_ticker, detail: data.broker_note });
  }
  return {
    linked: out.filter((o) => o.status === "ok").length,
    pending: out.filter((o) => o.status === "ambiguo" || o.status === "no_encontrado").length,
    items: out,
  };
}

// ---------------------------------------------------------------------------
// Compra protegida
// ---------------------------------------------------------------------------
const recentBuys = new Map<string, number>();

export async function executeProtectedBuy(
  workspaceId: string,
  input: { symbol: string; stop: number; target: number; quantity?: number | null; source: "manual" | "comite" | "auto"; proposalId?: string | null },
) {
  if (!brokerAvailable()) throw new Trading212Error("Trading 212 Demo no está configurado en este servidor", 503);
  const inst = await prisma.market_instruments.findUnique({ where: { symbol: input.symbol } });
  if (!inst || isCryptoMarket(inst.market)) throw new Trading212Error("Este activo no se puede operar en Trading 212", 400);
  if (!inst.broker_ticker) {
    await linkInstruments(false).catch(() => null);
    const again = await prisma.market_instruments.findUnique({ where: { id: inst.id } });
    if (!again?.broker_ticker) throw new Trading212Error(`${inst.name} no está vinculado con Trading 212 (${again?.broker_note ?? "sin datos"})`, 409);
    inst.broker_ticker = again.broker_ticker;
  }
  const ticker = inst.broker_ticker;
  const last = (await latestCloses([inst.id])).get(inst.id);
  if (!last) throw new Trading212Error("No hay precio de referencia para este valor", 409);
  const price = last.close;
  if (!(input.stop < price && input.target > price)) throw new Trading212Error("El stop tiene que estar por debajo del precio y el objetivo por encima", 400);

  const active = await prisma.trading_broker_brackets.findFirst({ where: { workspace_id: workspaceId, ticker, status: { in: ACTIVE_BRACKET } } });
  if (active) throw new Trading212Error("Ya hay una operación protegida en curso para este valor", 409);
  if (Date.now() - (recentBuys.get(ticker) ?? 0) < 90_000) throw new Trading212Error("Se envió una compra de este valor hace un momento; revisa la cartera antes de repetir", 429);

  const snap = await trading212Snapshot();
  if (snap.positions.some((p) => p.ticker === ticker && p.quantity > 0)) throw new Trading212Error("Ya tienes este valor en Trading 212", 409);
  if (snap.orders.some((o) => o.ticker === ticker)) throw new Trading212Error("Hay órdenes pendientes de este valor en Trading 212", 409);

  const account = await ensureAccount(workspaceId);
  const summary = await getTrading212DemoSummary();
  if (summary.currency !== "EUR") throw new Trading212Error("La cuenta Demo no está en euros", 409);
  const quantity =
    input.quantity && input.quantity > 0
      ? Math.floor(input.quantity)
      : brokerQuantity({
          equity: summary.totalValue,
          cash: summary.availableToTrade,
          riskPct: account.risk_per_trade_pct,
          maxPositionPct: Math.min(account.max_position_pct, 20),
          price,
          stop: input.stop,
        });
  if (quantity < 1) throw new Trading212Error("Con el saldo y las reglas de riesgo no llega ni a una acción", 409);
  if (quantity * price > Math.min(summary.availableToTrade, summary.totalValue * 0.2) + 1e-6)
    throw new Trading212Error("La compra supera el efectivo o el 20 % del patrimonio de la Demo", 400);

  recentBuys.set(ticker, Date.now());
  const order = await trading212MarketOrder(ticker, quantity);
  const bracket = await prisma.trading_broker_brackets.create({
    data: {
      workspace_id: workspaceId,
      symbol: inst.symbol,
      ticker,
      name: inst.name,
      quantity,
      stop: input.stop,
      target: input.target,
      planned_price: price,
      entry_order_id: order.orderId,
      source: input.source,
      proposal_id: input.proposalId ?? null,
      note: `Compra enviada (orden ${order.orderId}, ${order.status}). El stop se pondrá en cuanto el bróker registre las acciones.`,
    },
  });
  return { bracketId: bracket.id, orderId: order.orderId, status: order.status, quantity, ticker, price };
}

// ---------------------------------------------------------------------------
// Vigilancia
// ---------------------------------------------------------------------------
function snapshotFor(ticker: string, snap: Awaited<ReturnType<typeof trading212Snapshot>>): BrokerSnapshot {
  const p = snap.positions.find((x) => x.ticker === ticker);
  return {
    position: p && p.quantity > 0 ? { quantity: p.quantity, available: p.quantityAvailableForTrading, price: p.currentPrice } : null,
    orders: snap.orders.filter((o) => o.ticker === ticker).map((o) => ({ id: String(o.id), side: o.side, type: o.type })),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let guardianRunning = false;

/** Revisa todas las operaciones protegidas activas de un espacio y actúa si toca. */
export async function runBrokerGuardian(workspaceId: string) {
  if (!brokerAvailable()) return { checked: 0, actions: [] as string[], skipped: "Trading 212 Demo no configurado" };
  if (guardianRunning) return { checked: 0, actions: [] as string[], skipped: "Ya hay una revisión en curso" };
  guardianRunning = true;
  try {
    const brackets = await prisma.trading_broker_brackets.findMany({
      where: { workspace_id: workspaceId, status: { in: ACTIVE_BRACKET } },
      orderBy: { created_at: "asc" },
    });
    if (!brackets.length) return { checked: 0, actions: [] as string[] };
    const snap = await trading212Snapshot();
    const actions: string[] = [];
    for (const b of brackets) {
      const s = snapshotFor(b.ticker, snap);
      const action = decideBracket(
        { status: b.status as BracketStatus, quantity: b.quantity, stop: b.stop, target: b.target, stopOrderId: b.stop_order_id, exitReason: b.exit_reason, createdAt: b.created_at.getTime() },
        s,
      );
      const update = async (data: Partial<trading_broker_brackets>) =>
        prisma.trading_broker_brackets.update({ where: { id: b.id }, data: { ...data, last_checked_at: new Date(), updated_at: new Date() } });
      try {
        if (action.type === "esperar") {
          await update({});
          continue;
        }
        if (action.type === "poner_stop") {
          const r = await trading212StopSell(b.ticker, b.quantity, b.stop);
          await update({
            status: "protegida",
            stop_order_id: r.orderId,
            entry_price: b.entry_price ?? s.position?.price ?? null,
            note: `Protegida: stop en el bróker a ${b.stop.toFixed(3)} € (orden ${r.orderId}); objetivo vigilado a ${b.target.toFixed(3)} €.`,
          });
          actions.push(`${b.name}: stop puesto`);
        } else if (action.type === "cancelar_stop_y_vender") {
          if (b.stop_order_id) await trading212CancelApiOrder(b.stop_order_id);
          await update({ status: "vendiendo", exit_reason: action.reason, note: "Objetivo alcanzado: stop cancelado, se vende en la siguiente revisión." });
          actions.push(`${b.name}: objetivo alcanzado, stop cancelado`);
        } else if (action.type === "vender") {
          const r = await trading212MarketOrder(b.ticker, -b.quantity);
          await update({
            status: "vendiendo",
            exit_reason: action.reason,
            exit_order_id: r.orderId,
            exit_price: s.position?.price ?? null,
            note: `Venta enviada (orden ${r.orderId}) por ${action.reason}.`,
          });
          actions.push(`${b.name}: venta enviada (${action.reason})`);
        } else if (action.type === "cerrar") {
          await update({ status: "cerrada", exit_reason: b.exit_reason ?? action.reason, note: `Cerrada (${b.exit_reason ?? action.reason}).` });
          actions.push(`${b.name}: cerrada (${action.reason})`);
        } else if (action.type === "error") {
          await update({ status: "error", note: action.reason });
          actions.push(`${b.name}: ${action.reason}`);
        }
        // Las órdenes del bróker tienen límites por segundo: pausa entre acciones.
        await sleep(1_200);
      } catch (e) {
        await update({ note: `Última revisión con error: ${e instanceof Error ? e.message.slice(0, 200) : "desconocido"}` });
        actions.push(`${b.name}: error (${e instanceof Error ? e.message : "desconocido"})`);
      }
    }
    return { checked: brackets.length, actions };
  } finally {
    guardianRunning = false;
  }
}

export async function listBrackets(workspaceId: string) {
  const rows = await prisma.trading_broker_brackets.findMany({ where: { workspace_id: workspaceId }, orderBy: { created_at: "desc" }, take: 50 });
  return rows.map((b) => ({
    id: b.id,
    symbol: b.symbol,
    ticker: b.ticker,
    name: b.name,
    quantity: b.quantity,
    stop: b.stop,
    target: b.target,
    plannedPrice: b.planned_price,
    status: b.status as BracketStatus,
    entryPrice: b.entry_price,
    exitReason: b.exit_reason,
    note: b.note,
    source: b.source,
    lastCheckedAt: b.last_checked_at?.toISOString() ?? null,
    createdAt: b.created_at.toISOString(),
  }));
}

/** Instrumentos vinculados (para la pantalla de control). */
export async function brokerLinks() {
  const rows = await prisma.market_instruments.findMany({
    where: { active: true, is_index: false },
    select: { symbol: true, name: true, market: true, broker_ticker: true, broker_note: true, broker_checked_at: true },
    orderBy: { name: "asc" },
  });
  return rows
    .filter((r) => !isCryptoMarket(r.market))
    .map((r) => ({ symbol: r.symbol, name: r.name, ticker: r.broker_ticker, note: r.broker_note, checked: !!r.broker_checked_at }));
}
