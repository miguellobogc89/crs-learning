// lib/trading/kraken-copy.ts
// Copias de los agentes de cortos (ENJAMBRE, ENJAMBRE x2, ENJAMBRE x3, REBOTE) en Kraken Futures. Funcionan como las demás
// copias: se activan con «Copiar» en el agente (importe y modo ensayo o dinero real) y cada operación queda en
// trading_mirror_legs, que es lo que enseña la app. En cada revisión de los agentes:
//  - cada corto nuevo del agente (abierto hace menos de 30 min) se abre en Kraken: venta a mercado del perpetuo
//    PF_<moneda>USD con un 10 % del importe de la copia como garantía y el apalancamiento del agente;
//  - cada corto que el agente cierra se cierra en Kraken: compra a mercado, solo para reducir.
// En ensayo se calcula todo y se apunta, sin enviar nada. El dinero real exige la conexión de Kraken en entorno
// real y BROKERS_REAL_ENABLED=true (el mismo interruptor que las demás copias).
import "server-only";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/connectors/crypto";
import { realEnabledFromEnv } from "@/lib/brokers/policy";
import { createKrakenFuturesClient } from "@/lib/brokers/adapters/kraken";
import { createKrakenApi } from "@/lib/brokers/adapters/kraken/api";
import type { BrokerSession } from "@/lib/brokers/adapter";
import { accountState } from "./accounts";
import { AGENTS_WORKSPACE } from "./agents/roster";
import { kamikazeByKey } from "./kamikaze/roster";
import { eurUsd } from "./market-data";
import type { trading_mirror_legs } from "@prisma/client";

const FRESH_MS = 30 * 60_000;
/** Kraken Futures: 0,05 % por orden a mercado. */
export const KRAKEN_FEE_PCT = 0.05;
const FEE = KRAKEN_FEE_PCT / 100;

/** ¿Es un agente de cortos (se copia en Kraken)? */
export const isShortSwarm = (agent: string) => {
  const e = kamikazeByKey(agent)?.engine;
  return e === "enjambre-corto" || e === "avalancha" || e === "rebote";
};

async function krakenRow() {
  return prisma.broker_connections.findFirst({ where: { provider: "kraken", environment: "real" }, orderBy: { updated_at: "desc" } });
}

/** Qué falta para copiar con dinero real en Kraken (null = listo). */
export async function krakenProblem(): Promise<string | null> {
  const row = await krakenRow().catch(() => null);
  if (!row?.credentials_enc) return "Conecta Kraken (entorno real) en Trading → Integraciones";
  if (!realEnabledFromEnv()) return "El dinero real no está habilitado en el servidor (BROKERS_REAL_ENABLED=true)";
  return null;
}

async function session(): Promise<BrokerSession | null> {
  const row = await krakenRow();
  if (!row?.credentials_enc) return null;
  return { connectionId: row.id, environment: "real", credentials: JSON.parse(decrypt(row.credentials_enc)) as Record<string, string> };
}

const perp = (base: string) => `PF_${base === "BTC" ? "XBT" : base}USD`;


const kraken = createKrakenFuturesClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Dólares por euro: el de tu cuenta de Kraken (si tiene euros) o el del mercado. */
async function usdPerEur(accRate?: number | null): Promise<number | null> {
  if (accRate && accRate > 0) return accRate;
  const c = await eurUsd(1).catch(() => []);
  const last = c[c.length - 1]?.c;
  return last && last > 0 ? last : null;
}

/** Tu cartera Multi-Collateral (Flex) de Kraken en euros: total (con lo abierto) y margen libre. null si no se puede leer. */
export async function krakenFundsEur(): Promise<{ total: number; free: number } | null> {
  const s = await session().catch(() => null);
  if (!s) return null;
  const acc = await kraken.getAccount(s);
  if (acc.currency === "EUR") return { total: acc.balance, free: acc.availableMargin };
  const rate = await usdPerEur(acc.eurUsdRate);
  return rate ? { total: acc.balance / rate, free: acc.availableMargin / rate } : null;
}

/** Precio medio real de una orden ejecutada en Kraken, en euros (null si Kraken aún no da la ejecución). */
async function filledPriceEur(s: BrokerSession, orderId: string | null): Promise<number | null> {
  if (!orderId) return null;
  for (let i = 0; i < 3; i++) {
    const fills = (await kraken.getFills(s, new Date(Date.now() - 15 * 60_000).toISOString()).catch(() => [])).filter((f) => f.orderId === orderId);
    const q = fills.reduce((a, f) => a + f.size, 0);
    if (q > 0) {
      const usd = fills.reduce((a, f) => a + f.price * f.size, 0) / q;
      const rate = await usdPerEur((await kraken.getAccount(s).catch(() => null))?.eurUsdRate);
      return rate ? usd / rate : null;
    }
    await sleep(800);
  }
  return null;
}

const shortResult = (q: number, entry: number, exit: number) => Math.round((q * (entry - exit) - q * (entry + exit) * FEE) * 100) / 100;

/**
 * Cierra en Kraken un corto copiado: compra a mercado solo para reducir (nunca puede abrir un largo). Solo se marca
 * cerrado cuando Kraken lo confirma; si falla, vuelve a «abierta» y se reintenta en la siguiente revisión. Si en
 * Kraken ya no hay corto de esa moneda (lo cerraste tú allí), se apunta como cerrado fuera de la app.
 * Devuelve el error (texto) o null si quedó cerrado.
 */
export async function closeKrakenLeg(l: trading_mirror_legs, reason: string, fallbackExit?: number | null): Promise<string | null> {
  const claimed = await prisma.trading_mirror_legs.updateMany({ where: { id: l.id, status: "abierta" }, data: { status: "vendiendo", updated_at: new Date() } });
  if (claimed.count !== 1) return null;
  const entry = l.entry_price ?? 0;
  const q = l.quantity ?? 0;
  const done = (data: Partial<trading_mirror_legs>) =>
    prisma.trading_mirror_legs.update({ where: { id: l.id }, data: { status: "cerrada", closed_at: new Date(), updated_at: new Date(), ...data } });
  try {
    if (l.mode !== "real") {
      const exit = fallbackExit ?? (await markEur(l.pair!)) ?? entry;
      await done({ exit_price: exit, result: shortResult(q, entry, exit), note: `Ensayo: se habría cerrado en Kraken (${reason})` });
      return null;
    }
    const problem = await krakenProblem();
    const s = problem ? null : await session();
    if (!s) throw new Error(problem ?? "Kraken no disponible");
    const pos = (await kraken.getOpenPositions(s)).find((p) => p.symbol === l.pair && p.side === "short");
    if (!pos || !(pos.size > 0)) {
      await done({ note: `Ya no estaba abierto en Kraken (cerrado fuera de la app): ${reason}` });
      return null;
    }
    const size = Math.min(q, pos.size);
    const id = await kraken.placeOrder(s, { symbol: l.pair!, side: "buy", type: "mkt", size, reduceOnly: true });
    const exit = (await filledPriceEur(s, id)) ?? fallbackExit ?? (await markEur(l.pair!)) ?? entry;
    await done({ exit_price: exit, buy_order_id: id, result: shortResult(size, entry, exit), note: `Cerrado en Kraken: ${reason}` });
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
    await prisma.trading_mirror_legs.update({
      where: { id: l.id },
      data: { status: "abierta", note: `No se pudo cerrar en Kraken (se reintenta): ${msg}`, sell_attempts: { increment: 1 }, updated_at: new Date() },
    });
    return `${l.symbol}: ${msg}`;
  }
}

/** Precio de ahora del perpetuo, en euros. */
async function markEur(pair: string): Promise<number | null> {
  const s = await session().catch(() => null);
  if (!s) return null;
  const t = await kraken.getTicker(s, pair).catch(() => null);
  const usd = t?.markPrice ?? t?.last ?? null;
  const rate = await usdPerEur((await kraken.getAccount(s).catch(() => null))?.eurUsdRate);
  return usd && rate ? usd / rate : null;
}

/** Decimales de cantidad de cada perpetuo (contractValueTradePrecision). */
async function precisions(s: BrokerSession) {
  const raw = await createKrakenApi()(s, "instruments", { public: true });
  const out = new Map<string, number>();
  for (const i of (raw.instruments as { symbol?: string; contractValueTradePrecision?: number }[] | undefined) ?? []) {
    if (i.symbol) out.set(i.symbol.toUpperCase(), Number(i.contractValueTradePrecision ?? 0));
  }
  return out;
}

export async function krakenCopyTurn(): Promise<{ agent: string; text: string }[]> {
  const actions: { agent: string; text: string }[] = [];
  // Cortos que siguen abiertos en copias que ya no están activas (despediste al agente y el cierre falló):
  // se siguen intentando cerrar, nunca se quedan sueltos. Y lo que se quedó a medio cerrar, vuelve a intentarse.
  await prisma.trading_mirror_legs.updateMany({
    where: { status: "vendiendo", pair: { startsWith: "PF_" }, updated_at: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: "abierta", updated_at: new Date() },
  });
  const orphans = await prisma.trading_mirror_legs.findMany({ where: { status: "abierta", pair: { startsWith: "PF_" }, mirror: { active: false } } });
  for (const l of orphans) {
    const err = await closeKrakenLeg(l, "ya no copias a este agente");
    actions.push({ agent: "kraken", text: err ? `Kraken: no pudo cerrar ${err}` : `Kraken: cierra ${l.symbol} (copia desactivada)` });
  }
  const mirrors = (await prisma.trading_mirrors.findMany({ where: { active: true } })).filter((m) => isShortSwarm(m.agent));
  if (!mirrors.length) return actions;
  const needsReal = mirrors.some((m) => m.mode === "real");
  const s = needsReal && !(await krakenProblem()) ? await session().catch(() => null) : null;
  const prec = s ? await precisions(s).catch(() => new Map<string, number>()) : new Map<string, number>();
  // Margen libre de verdad en Kraken: ningún corto se abre con más garantía de la que hay.
  let freeMargin = s ? ((await krakenFundsEur().catch(() => null))?.free ?? null) : null;

  for (const m of mirrors) {
    const say = (text: string) => actions.push({ agent: m.agent, text });
    const def = kamikazeByKey(m.agent);
    // Apalancamiento: el que elegiste para tu copia o, si no, el del agente.
    const lev = m.leverage ?? def?.leverage ?? 1;
    const real = m.mode === "real";
    const state = await accountState(AGENTS_WORKSPACE, m.agent);
    const legs = await prisma.trading_mirror_legs.findMany({ where: { mirror_id: m.id } });
    const done = new Set(legs.map((l) => l.source_position_id));
    const byId = new Map(state.positions.map((p) => [p.id, p]));

    // 1) Cierres: el agente ya no tiene abierta la posición copiada.
    for (const l of legs.filter((l) => l.status === "abierta" && byId.get(l.source_position_id)?.status !== "abierta")) {
      const src = byId.get(l.source_position_id);
      const err = await closeKrakenLeg(l, "el agente cierra", src?.exitPrice ?? src?.lastPrice ?? null);
      say(err ? `Kraken: no pudo cerrar ${err}` : `Kraken${l.mode === "real" ? "" : " (ensayo)"}: cierra ${l.symbol}`);
    }

    // 2) Aperturas: cortos nuevos del agente que aún no están copiados (en pausa no se abre nada).
    if (m.paused) continue;
    const fresh = state.positions.filter((p) => p.status === "abierta" && p.direction === "short" && !done.has(p.id) && Date.now() - new Date(p.createdAt).getTime() < FRESH_MS);
    for (const p of fresh) {
      const base = p.symbol.replace(/-EUR$/, "");
      const pair = perp(base);
      const entry = p.entryPrice ?? p.plannedEntry;
      let margin = m.budget * ((def?.sizeOfEquityPct ?? 10) / 100);
      if (real) {
        if (freeMargin === null) {
          // Sin lectura del margen no se abre; se reintenta en la siguiente revisión mientras el corto sea reciente.
          say(`Kraken: ${base} esperando (no se pudo leer el margen)`);
          continue;
        }
        margin = Math.min(margin, freeMargin * 0.95);
        if (margin < 1) {
          await prisma.trading_mirror_legs.create({ data: { mirror_id: m.id, source_position_id: p.id, mode: m.mode, symbol: p.symbol, pair, status: "omitida", note: `Sin margen libre en Kraken (hay ${freeMargin.toFixed(2)} €)` } });
          say(`Kraken: ${base} omitido (sin margen libre)`);
          continue;
        }
      }
      const d = prec.get(pair) ?? 6;
      const size = Math.floor(((margin * lev) / entry) * 10 ** d) / 10 ** d;
      const leg = { mirror_id: m.id, source_position_id: p.id, mode: m.mode, symbol: p.symbol, pair, amount: Math.round(margin * 100) / 100, quantity: size, entry_price: entry, leverage: lev };
      if (!(size > 0)) {
        await prisma.trading_mirror_legs.create({ data: { ...leg, status: "omitida", note: "Por debajo del tamaño mínimo de Kraken" } });
        say(`Kraken: ${base} omitido (tamaño mínimo)`);
        continue;
      }
      try {
        let openId: string | null = null;
        if (real) {
          if (!s) throw new Error((await krakenProblem()) ?? "Kraken no disponible");
          openId = await kraken.placeOrder(s, { symbol: pair, side: "sell", type: "mkt", size });
        }
        const filled = real && s ? await filledPriceEur(s, openId) : null;
        if (real && freeMargin !== null) freeMargin -= margin;
        await prisma.trading_mirror_legs.create({
          data: { ...leg, ...(filled ? { entry_price: filled } : {}), status: "abierta", sell_order_id: openId, opened_at: new Date(), note: `Corto${lev > 1 ? ` x${lev}` : ""} en Kraken${real ? "" : " (ensayo: no se envía)"}` },
        });
        say(`Kraken${real ? "" : " (ensayo)"}: corto ${base} ${size}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
        await prisma.trading_mirror_legs.create({ data: { ...leg, status: "error", note: msg } });
        say(`Kraken: no pudo abrir ${base} (${msg})`);
      }
    }
  }
  return actions;
}
