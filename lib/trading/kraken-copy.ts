// lib/trading/kraken-copy.ts
// Copias de los agentes de cortos (ENJAMBRE, ENJAMBRE x2, ENJAMBRE x3) en Kraken Futures. Funcionan como las demás
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

const FRESH_MS = 30 * 60_000;
const FEE = 0.0005; // Kraken Futures: 0,05 % por orden a mercado.

/** ¿Es un agente de cortos (se copia en Kraken)? */
export const isShortSwarm = (agent: string) => kamikazeByKey(agent)?.engine === "enjambre-corto";

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
  const mirrors = (await prisma.trading_mirrors.findMany({ where: { active: true } })).filter((m) => isShortSwarm(m.agent));
  if (!mirrors.length) return actions;
  const needsReal = mirrors.some((m) => m.mode === "real");
  const s = needsReal && !(await krakenProblem()) ? await session().catch(() => null) : null;
  const kraken = createKrakenFuturesClient();
  const prec = s ? await precisions(s).catch(() => new Map<string, number>()) : new Map<string, number>();

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
      const exit = src?.exitPrice ?? src?.lastPrice ?? l.entry_price ?? 0;
      try {
        let closeId: string | null = null;
        if (l.mode === "real") {
          if (!s) throw new Error((await krakenProblem()) ?? "Kraken no disponible");
          closeId = await kraken.placeOrder(s, { symbol: l.pair!, side: "buy", type: "mkt", size: l.quantity ?? 0, reduceOnly: true });
        }
        const q = l.quantity ?? 0;
        const entry = l.entry_price ?? exit;
        const result = q * (entry - exit) - q * (entry + exit) * FEE;
        await prisma.trading_mirror_legs.update({
          where: { id: l.id },
          data: { status: "cerrada", exit_price: exit, result: Math.round(result * 100) / 100, buy_order_id: closeId, closed_at: new Date(), updated_at: new Date() },
        });
        say(`Kraken${l.mode === "real" ? "" : " (ensayo)"}: cierra ${l.symbol}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
        await prisma.trading_mirror_legs.update({ where: { id: l.id }, data: { note: `No se pudo cerrar: ${msg}`, sell_attempts: { increment: 1 }, updated_at: new Date() } });
        say(`Kraken: no pudo cerrar ${l.symbol} (${msg})`);
      }
    }

    // 2) Aperturas: cortos nuevos del agente que aún no están copiados (en pausa no se abre nada).
    if (m.paused) continue;
    const fresh = state.positions.filter((p) => p.status === "abierta" && p.direction === "short" && !done.has(p.id) && Date.now() - new Date(p.createdAt).getTime() < FRESH_MS);
    for (const p of fresh) {
      const base = p.symbol.replace(/-EUR$/, "");
      const pair = perp(base);
      const entry = p.entryPrice ?? p.plannedEntry;
      const margin = m.budget * ((def?.sizeOfEquityPct ?? 10) / 100);
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
        await prisma.trading_mirror_legs.create({
          data: { ...leg, status: "abierta", sell_order_id: openId, opened_at: new Date(), note: `Corto${lev > 1 ? ` x${lev}` : ""} en Kraken${real ? "" : " (ensayo: no se envía)"}` },
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
