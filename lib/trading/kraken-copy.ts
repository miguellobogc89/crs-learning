// lib/trading/kraken-copy.ts
// Copia en Kraken Futures (dinero real) de un agente de cortos (ENJAMBRE x3). En cada revisión de los agentes:
//  - cada corto nuevo del agente (abierto hace menos de 30 min) se abre en Kraken: venta a mercado del perpetuo
//    PF_<moneda>USD por (valor de tu cuenta de futuros × 10 % × apalancamiento del agente);
//  - cada corto que el agente cierra (stop) se cierra en Kraken: compra a mercado, solo para reducir.
// Requiere la conexión de Kraken en entorno real y BROKERS_REAL_ENABLED=true (el mismo interruptor que las copias).
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

/** El agente que se copia con dinero real. */
export const KRAKEN_COPY_AGENT = "enjambre-x3";
const FRESH_MS = 30 * 60_000;

type CopyRow = { id: string; position_id: string; symbol: string; size: number; status: string };

async function session(): Promise<BrokerSession | null> {
  const row = await prisma.broker_connections.findFirst({ where: { provider: "kraken", environment: "real" }, orderBy: { updated_at: "desc" } });
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

export async function krakenCopyTurn(): Promise<string[]> {
  const actions: string[] = [];
  if (!realEnabledFromEnv()) return actions;
  const s = await session().catch(() => null);
  if (!s) return actions;
  const def = kamikazeByKey(KRAKEN_COPY_AGENT);
  const lev = def?.leverage ?? 1;
  const kraken = createKrakenFuturesClient();
  const state = await accountState(AGENTS_WORKSPACE, KRAKEN_COPY_AGENT);
  const copies = await prisma.$queryRaw<CopyRow[]>`SELECT id, position_id, symbol, size, status FROM trading_kraken_copies WHERE agent = ${KRAKEN_COPY_AGENT}`;
  const byPos = new Map(copies.map((c) => [c.position_id, c]));

  // 1) Cierres: el agente ya no tiene abierta la posición copiada.
  const openIds = new Set(state.positions.filter((p) => p.status === "abierta").map((p) => p.id));
  for (const c of copies.filter((c) => c.status === "abierta" && !openIds.has(c.position_id))) {
    try {
      const id = await kraken.placeOrder(s, { symbol: c.symbol, side: "buy", type: "mkt", size: c.size, reduceOnly: true });
      await prisma.$executeRaw`UPDATE trading_kraken_copies SET status = 'cerrada', close_order_id = ${id}, closed_at = now() WHERE id = ${c.id}::uuid`;
      actions.push(`Kraken: cierra ${c.symbol}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
      await prisma.$executeRaw`UPDATE trading_kraken_copies SET note = ${msg} WHERE id = ${c.id}::uuid`;
      actions.push(`Kraken: no pudo cerrar ${c.symbol} (${msg})`);
    }
  }

  // 2) Aperturas: cortos nuevos del agente que aún no están copiados.
  const fresh = state.positions.filter((p) => p.status === "abierta" && p.direction === "short" && !byPos.has(p.id) && Date.now() - new Date(p.createdAt).getTime() < FRESH_MS);
  if (!fresh.length) return actions;
  const account = await kraken.getAccount(s);
  const equityUsd = account.balance;
  const prec = await precisions(s);
  for (const p of fresh) {
    const base = p.symbol.replace(/-EUR$/, "");
    const symbol = perp(base);
    try {
      const t = await kraken.getTicker(s, symbol);
      const price = t.markPrice ?? t.last;
      if (!price) throw new Error("sin precio");
      const d = prec.get(symbol) ?? 0;
      const size = Math.floor(((equityUsd * ((def?.sizeOfEquityPct ?? 10) / 100) * lev) / price) * 10 ** d) / 10 ** d;
      if (!(size > 0)) {
        await prisma.$executeRaw`INSERT INTO trading_kraken_copies (position_id, agent, symbol, size, status, note) VALUES (${p.id}::uuid, ${KRAKEN_COPY_AGENT}, ${symbol}, 0, 'omitida', 'Por debajo del tamaño mínimo de orden') ON CONFLICT DO NOTHING`;
        actions.push(`Kraken: ${symbol} omitido (tamaño mínimo)`);
        continue;
      }
      const id = await kraken.placeOrder(s, { symbol, side: "sell", type: "mkt", size });
      await prisma.$executeRaw`INSERT INTO trading_kraken_copies (position_id, agent, symbol, size, open_order_id, status) VALUES (${p.id}::uuid, ${KRAKEN_COPY_AGENT}, ${symbol}, ${size}, ${id}, 'abierta') ON CONFLICT DO NOTHING`;
      actions.push(`Kraken: corto ${symbol} ${size}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
      await prisma.$executeRaw`INSERT INTO trading_kraken_copies (position_id, agent, symbol, size, status, note) VALUES (${p.id}::uuid, ${KRAKEN_COPY_AGENT}, ${symbol}, 0, 'error', ${msg}) ON CONFLICT DO NOTHING`;
      actions.push(`Kraken: no pudo abrir ${symbol} (${msg})`);
    }
  }
  return actions;
}
