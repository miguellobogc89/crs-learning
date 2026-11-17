// lib/finance/store.ts
// Lectura de los datos de una persona desde la base de datos, ya en el formato de logic.ts.
import "server-only";
import { createHmac } from "node:crypto";
import type { finance_transactions } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { connectorKey } from "@/lib/connectors/crypto";
import { isKind, type Kind } from "./categories";
import type { Budget, Rule, Tx } from "./logic";

/** Huella de un IBAN (no se guarda el IBAN): sirve para reconocer transferencias a cuentas propias. */
export function ibanHash(iban: string | null | undefined) {
  const clean = (iban ?? "").replace(/\s+/g, "").toUpperCase();
  if (clean.length < 10) return null;
  return createHmac("sha256", connectorKey()).update(`iban:${clean}`).digest("hex").slice(0, 32);
}

export type TxRow = finance_transactions;

export const toTx = (r: TxRow): Tx => ({
  id: r.id,
  accountId: r.account_id,
  date: r.booking_date.toISOString().slice(0, 10),
  amount: Number(r.amount),
  description: r.description,
  counterparty: r.counterparty,
  counterpartyIbanHash: r.counterparty_iban_hash,
  category: r.category,
  kind: (isKind(r.kind) ? r.kind : "gasto") as Kind,
  source: r.category_source,
  extraordinary: r.extraordinary,
  transferPairId: r.transfer_pair_id,
});

/** Movimientos de las cuentas incluidas (en EUR), del más reciente al más antiguo. */
export async function loadTxs(userId: string, opts: { since?: string; includeExcluded?: boolean } = {}) {
  const rows = await prisma.finance_transactions.findMany({
    where: {
      user_id: userId,
      ...(opts.since ? { booking_date: { gte: new Date(`${opts.since}T00:00:00Z`) } } : {}),
      ...(opts.includeExcluded ? {} : { finance_accounts: { included: true } }),
    },
    orderBy: [{ booking_date: "desc" }, { created_at: "desc" }],
  });
  return rows.map(toTx);
}

export async function getSettings(userId: string) {
  const s = await prisma.finance_settings.upsert({ where: { user_id: userId }, create: { user_id: userId }, update: {} });
  return {
    cycleStartDay: s.cycle_start_day,
    savingsGoal: s.savings_goal === null ? null : Number(s.savings_goal),
    lastSyncAt: s.last_sync_at?.toISOString() ?? null,
  };
}

export async function getRules(userId: string): Promise<Rule[]> {
  const rows = await prisma.finance_rules.findMany({ where: { user_id: userId }, orderBy: { created_at: "asc" } });
  return rows.map((r) => ({ id: r.id, pattern: r.pattern, category: r.category, kind: (isKind(r.kind) ? r.kind : "gasto") as Kind, extraordinary: r.extraordinary }));
}

export async function getBudgets(userId: string): Promise<Budget[]> {
  const rows = await prisma.finance_budgets.findMany({ where: { user_id: userId }, orderBy: { created_at: "asc" } });
  return rows.map((b) => ({ id: b.id, name: b.name, categories: b.categories, amount: Number(b.amount) }));
}

export async function getAccounts(userId: string) {
  const rows = await prisma.finance_accounts.findMany({ where: { user_id: userId }, orderBy: [{ bank: "asc" }, { created_at: "asc" }] });
  return rows.map((a) => ({
    id: a.id,
    source: a.source,
    bank: a.bank,
    name: a.name,
    ibanLast4: a.iban_last4,
    ibanHash: a.iban_hash,
    currency: a.currency,
    balance: a.balance === null ? null : Number(a.balance),
    balanceAt: a.balance_at?.toISOString() ?? null,
    included: a.included,
    lastSyncedAt: a.last_synced_at?.toISOString() ?? null,
  }));
}

/** Claves de avisos descartados y de recurrentes dados por cancelados («rec-cancel:<clave>»). */
export async function getDismissed(userId: string) {
  const rows = await prisma.finance_alert_dismissals.findMany({ where: { user_id: userId }, select: { key: true } });
  const dismissed = new Set<string>();
  const cancelled = new Set<string>();
  for (const r of rows) {
    if (r.key.startsWith("rec-cancel:")) cancelled.add(r.key.slice("rec-cancel:".length));
    else dismissed.add(r.key);
  }
  return { dismissed, cancelled };
}

export async function getMemory(userId: string) {
  const rows = await prisma.finance_memory.findMany({ where: { user_id: userId }, orderBy: { created_at: "asc" }, take: 100 });
  return rows.map((m) => ({ id: m.id, content: m.content, createdAt: m.created_at.toISOString() }));
}
