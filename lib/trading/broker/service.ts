// lib/trading/broker/service.ts
// Puente entre la cartera de CRS y el bróker conectado: vincular valores, ejecutar compras protegidas
// (stop en el bróker + objetivo vigilado por la app) y revisar su estado. Habla SOLO con el gateway
// de lib/brokers: no sabe qué bróker hay detrás. Las decisiones (qué, cuánto) siguen siendo de CRS.
import "server-only";
import type { trading_broker_brackets } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import * as brokers from "@/lib/brokers/gateway";
import { BrokerError, type BrokerActor, type BrokerOrder, type BrokerPosition } from "@/lib/brokers/types";
import { ensureAccount, latestCloses } from "../accounts";
import { isCryptoMarket } from "../market-data";
import { brokerQuantity, decideBracket, type BracketStatus, type BrokerSnapshot } from "./logic";

export const BROKER_AUTONOMY = ["nada", "aprobacion", "automatico"] as const;
export type BrokerAutonomy = (typeof BROKER_AUTONOMY)[number];
export const ACTIVE_BRACKET: BracketStatus[] = ["esperando_entrada", "protegida", "vendiendo"];

/** La conexión de la cartera de este espacio (o null). El actor por defecto es el automatismo. */
async function link(workspaceId: string, label = "guardián") {
  return brokers.tradingConnection(workspaceId, label);
}

export async function brokerStatus(workspaceId: string) {
  const conn = await link(workspaceId);
  const account = await ensureAccount(workspaceId);
  const autonomy = (BROKER_AUTONOMY as readonly string[]).includes(account.broker_autonomy) ? (account.broker_autonomy as BrokerAutonomy) : "aprobacion";
  return {
    available: !!conn,
    autonomy,
    provider: conn?.providerName ?? null,
    environment: conn?.environment ?? null,
  };
}

export async function setBrokerAutonomy(workspaceId: string, value: unknown) {
  if (!(BROKER_AUTONOMY as readonly string[]).includes(String(value))) throw new Error("Nivel de autonomía no válido");
  const a = await ensureAccount(workspaceId);
  await prisma.trading_accounts.update({ where: { id: a.id }, data: { broker_autonomy: String(value), updated_at: new Date() } });
  return { autonomy: value as BrokerAutonomy };
}

const noBroker = () => new BrokerError("not_connected", "Esta cartera no tiene bróker conectado: elige uno en Trading → Integraciones");

// ---------------------------------------------------------------------------
// Vinculación de valores (informativa: las órdenes resuelven el símbolo en el momento)
// ---------------------------------------------------------------------------
export async function linkInstruments(workspaceId: string, requester?: BrokerActor) {
  const conn = await link(workspaceId);
  if (!conn) throw noBroker();
  const actor = requester ?? conn.actor;
  const instruments = await prisma.market_instruments.findMany({ where: { active: true, is_index: false } });
  const out: { symbol: string; name: string; status: string; ticker: string | null; detail: string | null }[] = [];
  for (const inst of instruments) {
    const r = await brokers.resolveSymbol(actor, conn.connectionId, { symbol: inst.symbol, market: isCryptoMarket(inst.market) ? "crypto" : "bolsa", isin: inst.isin });
    if (r.status === "unsupported") {
      out.push({ symbol: inst.symbol, name: inst.name, status: "no_disponible", ticker: null, detail: r.reason });
      continue;
    }
    const data =
      r.status === "ok"
        ? { broker_ticker: r.instrument.providerSymbol, isin: r.instrument.isin ?? inst.isin, broker_note: `${conn.providerName}: vinculado por ${r.how} (${r.instrument.name})` }
        : r.status === "ambiguous"
          ? { broker_ticker: null, broker_note: `${conn.providerName}: varios candidatos (${r.candidates.map((c) => c.providerSymbol).join(", ")})` }
          : { broker_ticker: null, broker_note: `${conn.providerName}: no encontrado` };
    await prisma.market_instruments.update({ where: { id: inst.id }, data: { ...data, broker_checked_at: new Date() } });
    out.push({ symbol: inst.symbol, name: inst.name, status: r.status === "ok" ? "ok" : r.status === "ambiguous" ? "ambiguo" : "no_encontrado", ticker: data.broker_ticker, detail: data.broker_note });
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

/**
 * Compra a mercado y deja la operación lista para que el guardián ponga el stop.
 * `requester`: el usuario que la pide (tiene que ser el dueño de la conexión); sin él, actúa el automatismo.
 */
export async function executeProtectedBuy(
  workspaceId: string,
  input: { symbol: string; stop: number; target: number; quantity?: number | null; source: "manual" | "comite" | "auto"; proposalId?: string | null },
  requester?: BrokerActor,
) {
  const conn = await link(workspaceId, input.source === "auto" ? "modo automático" : "guardián");
  if (!conn) throw noBroker();
  const actor = requester ?? conn.actor;
  const inst = await prisma.market_instruments.findUnique({ where: { symbol: input.symbol } });
  if (!inst) throw new BrokerError("instrument_not_found", "Valor desconocido");
  const market = isCryptoMarket(inst.market) ? "crypto" : "bolsa";
  const resolved = await brokers.resolveSymbol(actor, conn.connectionId, { symbol: inst.symbol, market, isin: inst.isin });
  if (resolved.status !== "ok") {
    throw new BrokerError(resolved.status === "unsupported" ? "unsupported" : "instrument_not_found", resolved.status === "unsupported" ? resolved.reason : `${inst.name} no está vinculado con ${conn.providerName}`);
  }
  const ticker = resolved.instrument.providerSymbol;
  const last = (await latestCloses([inst.id])).get(inst.id);
  if (!last) throw new BrokerError("conflict", "No hay precio de referencia para este valor");
  const price = last.close;
  if (!(input.stop < price && input.target > price)) throw new BrokerError("invalid_request", "El stop tiene que estar por debajo del precio y el objetivo por encima");

  const active = await prisma.trading_broker_brackets.findFirst({ where: { workspace_id: workspaceId, ticker, status: { in: ACTIVE_BRACKET } } });
  if (active) throw new BrokerError("conflict", "Ya hay una operación protegida en curso para este valor");
  if (Date.now() - (recentBuys.get(ticker) ?? 0) < 90_000) throw new BrokerError("rate_limited", "Se envió una compra de este valor hace un momento; revisa la cartera antes de repetir");

  const [positions, orders, accounts] = await Promise.all([
    brokers.getPositions(actor, conn.connectionId),
    brokers.getOrders(actor, conn.connectionId),
    brokers.getAccounts(actor, conn.connectionId),
  ]);
  if (positions.some((p) => p.providerSymbol === ticker && p.quantity > 0)) throw new BrokerError("conflict", `Ya tienes este valor en ${conn.providerName}`);
  if (orders.some((o) => o.providerSymbol === ticker)) throw new BrokerError("conflict", `Hay órdenes pendientes de este valor en ${conn.providerName}`);
  const summary = accounts[0];
  if (!summary || summary.currency !== "EUR") throw new BrokerError("conflict", "La cuenta del bróker no está en euros");

  const account = await ensureAccount(workspaceId);
  const quantity =
    input.quantity && input.quantity > 0
      ? Math.floor(input.quantity)
      : brokerQuantity({
          equity: summary.totalValue,
          cash: summary.cashAvailable,
          riskPct: account.risk_per_trade_pct,
          maxPositionPct: Math.min(account.max_position_pct, 20),
          price,
          stop: input.stop,
        });
  if (quantity < 1) throw new BrokerError("insufficient_funds", "Con el saldo y las reglas de riesgo no llega ni a una acción");
  if (quantity * price > Math.min(summary.cashAvailable, summary.totalValue * 0.2) + 1e-6)
    throw new BrokerError("invalid_request", "La compra supera el efectivo o el 20 % del patrimonio de la cuenta");

  // La operación se registra antes de comprar: su id es la clave de idempotencia de la orden.
  const bracket = await prisma.trading_broker_brackets.create({
    data: {
      workspace_id: workspaceId,
      broker: conn.providerName,
      connection_id: conn.connectionId,
      symbol: inst.symbol,
      ticker,
      name: inst.name,
      quantity,
      stop: input.stop,
      target: input.target,
      planned_price: price,
      source: input.source,
      proposal_id: input.proposalId ?? null,
      note: "Enviando la compra…",
    },
  });
  recentBuys.set(ticker, Date.now());
  try {
    const order = await brokers.placeOrder(actor, {
      connectionId: conn.connectionId,
      environment: conn.environment,
      instrument: { symbol: inst.symbol, market },
      providerSymbol: ticker,
      side: "buy",
      type: "market",
      quantity,
      currency: "EUR",
      idempotencyKey: `bracket:${bracket.id}:entrada`,
      reference: input.proposalId ? `propuesta:${input.proposalId}` : `operación protegida ${inst.symbol}`,
    });
    await prisma.trading_broker_brackets.update({
      where: { id: bracket.id },
      data: { entry_order_id: order.orderId, note: `Compra enviada (orden ${order.orderId}, ${order.providerStatus ?? order.status}). El stop se pondrá en cuanto el bróker registre las acciones.`, updated_at: new Date() },
    });
    return { bracketId: bracket.id, orderId: order.orderId, status: order.providerStatus ?? order.status, quantity, ticker, price };
  } catch (e) {
    if (e instanceof BrokerError && e.code === "unknown_outcome") {
      // Pudo comprarse: el guardián lo verá en la cartera del bróker. No se repite.
      await prisma.trading_broker_brackets.update({ where: { id: bracket.id }, data: { note: `Resultado de la compra desconocido: ${e.message}`, updated_at: new Date() } });
    } else {
      await prisma.trading_broker_brackets.delete({ where: { id: bracket.id } });
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Vigilancia
// ---------------------------------------------------------------------------
function snapshotFor(ticker: string, positions: BrokerPosition[], orders: BrokerOrder[]): BrokerSnapshot {
  const p = positions.find((x) => x.providerSymbol === ticker);
  return {
    position: p && p.quantity > 0 ? { quantity: p.quantity, available: p.quantityAvailable, price: p.currentPrice ?? p.averagePrice } : null,
    orders: orders.filter((o) => o.providerSymbol === ticker).map((o) => ({ id: o.orderId, side: o.side === "sell" ? "SELL" : "BUY", type: o.type })),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let guardianRunning = false;

/** Revisa todas las operaciones protegidas activas de un espacio y actúa si toca. */
export async function runBrokerGuardian(workspaceId: string) {
  const conn = await link(workspaceId);
  if (!conn) return { checked: 0, actions: [] as string[], skipped: "Sin bróker conectado" };
  if (guardianRunning) return { checked: 0, actions: [] as string[], skipped: "Ya hay una revisión en curso" };
  guardianRunning = true;
  try {
    const brackets = await prisma.trading_broker_brackets.findMany({
      where: { workspace_id: workspaceId, status: { in: ACTIVE_BRACKET } },
      orderBy: { created_at: "asc" },
    });
    if (!brackets.length) return { checked: 0, actions: [] as string[] };
    // Cada operación se vigila con la conexión con la que se abrió (si sigue siendo la de la cartera).
    const usable = brackets.filter((b) => !b.connection_id || b.connection_id === conn.connectionId);
    const others = brackets.length - usable.length;
    const actions: string[] = others ? [`${others} operaciones abiertas con otra conexión no se revisan`] : [];
    if (!usable.length) return { checked: 0, actions };
    const [positions, orders] = await Promise.all([brokers.getPositions(conn.actor, conn.connectionId), brokers.getOrders(conn.actor, conn.connectionId)]);
    for (const b of usable) {
      const s = snapshotFor(b.ticker, positions, orders);
      const action = decideBracket(
        { status: b.status as BracketStatus, quantity: b.quantity, stop: b.stop, target: b.target, stopOrderId: b.stop_order_id, exitReason: b.exit_reason, createdAt: b.created_at.getTime() },
        s,
      );
      const update = async (data: Partial<trading_broker_brackets>) =>
        prisma.trading_broker_brackets.update({ where: { id: b.id }, data: { ...data, last_checked_at: new Date(), updated_at: new Date() } });
      const order = async (side: "buy" | "sell", type: "market" | "stop", quantity: number, key: string, stopPrice?: number) => {
        const r = await brokers.placeOrder(conn.actor, {
          connectionId: conn.connectionId,
          environment: conn.environment,
          instrument: { symbol: b.symbol, market: "bolsa" },
          providerSymbol: b.ticker,
          side,
          type,
          quantity,
          stopPrice: stopPrice ?? null,
          idempotencyKey: key,
          reference: `operación protegida ${b.symbol}`,
        });
        // Una orden ya registrada y rechazada (o sin confirmar) no se repite sola: lo revisa una persona.
        if (r.status === "rejected" || !r.orderId) {
          throw new BrokerError("conflict", r.status === "rejected" ? "El bróker rechazó la orden: revísala antes de seguir" : "Orden sin confirmar: revisa la cuenta del bróker");
        }
        return r;
      };
      try {
        if (action.type === "esperar") {
          await update({});
          continue;
        }
        if (action.type === "poner_stop") {
          // Clave determinista: un stop por cada «hueco» (el anterior desaparecido), nunca dos a la vez.
          const r = await order("sell", "stop", b.quantity, `bracket:${b.id}:stop:${b.stop_order_id ?? "0"}`, b.stop);
          await update({
            status: "protegida",
            stop_order_id: r.orderId,
            entry_price: b.entry_price ?? s.position?.price ?? null,
            note: `Protegida: stop en el bróker a ${b.stop.toFixed(3)} € (orden ${r.orderId}); objetivo vigilado a ${b.target.toFixed(3)} €.`,
          });
          actions.push(`${b.name}: stop puesto`);
        } else if (action.type === "cancelar_stop_y_vender") {
          if (b.stop_order_id) await brokers.cancelOrder(conn.actor, conn.connectionId, b.stop_order_id);
          await update({ status: "vendiendo", exit_reason: action.reason, note: "Objetivo alcanzado: stop cancelado, se vende en la siguiente revisión." });
          actions.push(`${b.name}: objetivo alcanzado, stop cancelado`);
        } else if (action.type === "vender") {
          const r = await order("sell", "market", b.quantity, `bracket:${b.id}:salida`);
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
    return { checked: usable.length, actions };
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
