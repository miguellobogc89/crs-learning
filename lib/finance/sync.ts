// lib/finance/sync.ts
// Sincronización con los bancos (Enable Banking, solo lectura): guarda cuentas, saldos y movimientos nuevos.
// La primera vez pide todo el historial que dé el banco; después, solo desde la última sincronización
// (con unos días de solape para recoger lo que el banco contabiliza tarde). Nunca duplica: cada movimiento
// tiene su identificador estable por cuenta.
import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/connectors/crypto";
import {
  bankingRequest, isBankingConfigured,
  type BankAccountDetails, type BankBalance, type BankTransaction, type BankTransactionsPage,
} from "@/lib/personal-finance/enable-banking";
import { addDays, merchantKey, todayIso } from "./logic";
import { ibanHash } from "./store";
import { classifyPending } from "./classify";

/** Los bancos limitan las consultas sin el usuario delante (PSD2: unas 4 al día por cuenta). */
export const AUTO_SYNC_HOURS = 6;
const FIRST_SYNC_DAYS = 730;
const OVERLAP_DAYS = 7;
const MAX_PAGES = 40;

function accountIds(encrypted: string): string[] {
  const data: unknown = JSON.parse(decrypt(encrypted));
  if (!Array.isArray(data)) return [];
  return data.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9-]{8,80}$/.test(id)).slice(0, 20);
}

const signed = (t: BankTransaction) => {
  const amount = Number(t.transaction_amount?.amount);
  if (!Number.isFinite(amount)) return null;
  if (t.credit_debit_indicator === "DBIT") return -Math.abs(amount);
  if (t.credit_debit_indicator === "CRDT") return Math.abs(amount);
  return amount;
};

const describe = (t: BankTransaction) =>
  (t.remittance_information?.filter(Boolean).join(" · ") || t.note || t.creditor?.name || t.debtor?.name || "Movimiento bancario").slice(0, 500);

async function fetchTransactions(uid: string, from: string) {
  const id = encodeURIComponent(uid);
  const all: BankTransaction[] = [];
  let key: string | null | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ date_from: from });
    if (key) qs.set("continuation_key", key);
    const res = await bankingRequest<BankTransactionsPage>(`/accounts/${id}/transactions?${qs}`);
    all.push(...(res.transactions ?? []));
    key = res.continuation_key;
    if (!key) break;
  }
  return all;
}

/** Pide el historial; si el banco rechaza la fecha de inicio (muchos limitan a 90 días), reintenta con menos. */
async function fetchWithFallback(uid: string, from: string) {
  try {
    return await fetchTransactions(uid, from);
  } catch (e) {
    const shorter = addDays(todayIso(), -89);
    if (from >= shorter) throw e;
    return fetchTransactions(uid, shorter);
  }
}

export type SyncResult = { accounts: number; inserted: number; errors: string[]; classified?: Awaited<ReturnType<typeof classifyPending>> };

export async function syncUser(userId: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const result: SyncResult = { accounts: 0, inserted: 0, errors: [] };
  if (!isBankingConfigured()) return result;
  const settings = await prisma.finance_settings.upsert({ where: { user_id: userId }, create: { user_id: userId }, update: {} });
  if (!opts.force && settings.last_sync_at && Date.now() - settings.last_sync_at.getTime() < AUTO_SYNC_HOURS * 3_600_000) return result;
  // Se marca antes de empezar: dos pestañas abiertas no lanzan dos sincronizaciones a la vez.
  await prisma.finance_settings.update({ where: { user_id: userId }, data: { last_sync_at: new Date() } });

  const connections = await prisma.personal_bank_connections.findMany({ where: { user_id: userId, consent_expires_at: { gt: new Date() } } });
  for (const conn of connections) {
    let uids: string[] = [];
    try {
      uids = accountIds(conn.account_ids_enc);
    } catch {
      result.errors.push(`${conn.institution_name}: no se pudieron leer las cuentas`);
      continue;
    }
    for (const uid of uids) {
      try {
        result.inserted += await syncAccount(userId, conn.bank, conn.institution_name, uid);
        result.accounts++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "error";
        result.errors.push(`${conn.institution_name}: ${msg.slice(0, 120)}`);
      }
    }
  }
  // Solo lo rápido aquí; la IA la va pidiendo la pantalla por tandas (classify) para no pasar del tiempo límite.
  result.classified = await classifyPending(userId, { useAi: false });
  return result;
}

async function syncAccount(userId: string, bank: string, institution: string, uid: string) {
  const id = encodeURIComponent(uid);
  const existing = await prisma.finance_accounts.findUnique({ where: { user_id_external_uid: { user_id: userId, external_uid: uid } } });
  const [details, balances] = await Promise.allSettled([
    bankingRequest<BankAccountDetails>(`/accounts/${id}/details`),
    bankingRequest<{ balances: BankBalance[] }>(`/accounts/${id}/balances`),
  ]);
  const info = details.status === "fulfilled" ? details.value : null;
  const list = balances.status === "fulfilled" ? balances.value.balances ?? [] : [];
  // Saldo disponible contable si lo hay; si no, el primero que dé el banco.
  const bal = list.find((b) => b.balance_type === "CLBD") ?? list.find((b) => b.balance_type === "ITAV") ?? list.find((b) => b.balance_type === "CLAV") ?? list[0] ?? null;
  const balance = bal && Number.isFinite(Number(bal.balance_amount.amount)) ? Number(bal.balance_amount.amount) : null;
  const iban = info?.account_id?.iban ?? null;
  const account = await prisma.finance_accounts.upsert({
    where: { user_id_external_uid: { user_id: userId, external_uid: uid } },
    create: {
      user_id: userId, source: "bank", bank, external_uid: uid,
      name: info?.name?.trim() || `${institution} ${iban ? `•••• ${iban.slice(-4)}` : ""}`.trim(),
      holder_name: info?.name?.trim() || null,
      iban_last4: iban ? iban.slice(-4) : null, iban_hash: ibanHash(iban),
      currency: bal?.balance_amount.currency ?? info?.currency ?? "EUR",
      balance, balance_at: balance === null ? null : new Date(),
    },
    update: {
      ...(iban ? { iban_last4: iban.slice(-4), iban_hash: ibanHash(iban) } : {}),
      ...(info?.name?.trim() ? { holder_name: info.name.trim() } : {}),
      ...(balance === null ? {} : { balance, balance_at: new Date() }),
    },
  });

  // Foto del saldo de hoy (la última del día): de aquí sale lo que tenías al empezar cada ciclo.
  if (balance !== null) {
    const day = new Date(`${todayIso()}T00:00:00Z`);
    await prisma.finance_balance_snapshots.upsert({
      where: { account_id_day: { account_id: account.id, day } },
      create: { user_id: userId, account_id: account.id, day, balance },
      update: { balance, taken_at: new Date() },
    }).catch((e) => console.error("[finance] foto de saldo", e instanceof Error ? e.message.slice(0, 200) : e));
  }

  const from = existing?.last_synced_at
    ? addDays(existing.last_synced_at.toISOString().slice(0, 10), -OVERLAP_DAYS)
    : addDays(todayIso(), -FIRST_SYNC_DAYS);
  // Contabilizados y retenidos (PDNG): los retenidos cuentan ya como gastado y se sustituyen al contabilizarse.
  const txs = (await fetchWithFallback(uid, from)).filter((t) => !t.status || t.status === "BOOK" || t.status === "PDNG");

  // Identificador estable: el del banco; si no lo da, una huella del contenido (con contador para repetidos).
  const seen = new Map<string, number>();
  const rows: Prisma.finance_transactionsCreateManyInput[] = [];
  for (const t of txs) {
    const amount = signed(t);
    const date = t.booking_date ?? t.value_date ?? (t as { transaction_date?: string }).transaction_date;
    if (amount === null || !date) continue;
    const description = describe(t);
    const pending = t.status === "PDNG";
    let externalId = t.transaction_id || t.entry_reference || null;
    if (!externalId) {
      const base = createHash("sha256").update(`${date}|${amount.toFixed(2)}|${description}`).digest("hex").slice(0, 24);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      externalId = `${pending ? "p" : "h"}:${base}:${n}`;
    }
    const outgoing = amount < 0;
    rows.push({
      user_id: userId,
      account_id: account.id,
      external_id: externalId.slice(0, 200),
      source: "bank",
      booking_date: new Date(`${date}T00:00:00Z`),
      amount,
      currency: t.transaction_amount?.currency ?? account.currency,
      description,
      counterparty: ((outgoing ? t.creditor?.name : t.debtor?.name) ?? null)?.slice(0, 200) ?? null,
      counterparty_iban_hash: ibanHash(outgoing ? t.creditor_account?.iban : t.debtor_account?.iban),
      pending,
    });
  }
  await settlePending(account.id, rows, from);
  // El mismo movimiento puede llegar con dos identificadores: un día sin el del banco (huella «h:…») y al siguiente
  // con él («2026-11-21.0»). Antes de guardar se cruza por cuenta, fecha, importe y concepto con lo que ya hay: si ya
  // está (con otro identificador), no se duplica y se le pone el identificador del banco. Respeta los repetidos reales
  // (dos cafés iguales el mismo día): solo se descartan tantos como ya había. (25/11/2026)
  if (rows.length) {
    const dates = rows.map((r) => r.booking_date as Date);
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const prev = await prisma.finance_transactions.findMany({
      where: { account_id: account.id, booking_date: { gte: minDate } },
      select: { id: true, external_id: true, booking_date: true, amount: true, description: true },
    });
    const keyOf = (d: Date, amount: number, desc: string) => `${d.toISOString().slice(0, 10)}|${amount.toFixed(2)}|${desc}`;
    const ids = new Set(prev.map((p) => p.external_id));
    const pool = new Map<string, { id: string; external_id: string }[]>();
    for (const p of prev) {
      const k = keyOf(p.booking_date, Number(p.amount), p.description);
      (pool.get(k) ?? pool.set(k, []).get(k)!).push({ id: p.id, external_id: p.external_id });
    }
    // Los que ya están con su mismo identificador no cuentan como hueco libre.
    for (const r of rows) {
      if (!ids.has(r.external_id)) continue;
      const list = pool.get(keyOf(r.booking_date as Date, Number(r.amount), r.description));
      const i = list?.findIndex((x) => x.external_id === r.external_id) ?? -1;
      if (list && i >= 0) list.splice(i, 1);
    }
    const keep: typeof rows = [];
    for (const r of rows) {
      if (ids.has(r.external_id)) { keep.push(r); continue; }
      const list = pool.get(keyOf(r.booking_date as Date, Number(r.amount), r.description));
      const twin = list?.shift();
      if (!twin) { keep.push(r); continue; }
      // Ya estaba con otra huella: si aquella era nuestra («h:…») y esta es la del banco, se queda la del banco.
      if (twin.external_id.startsWith("h:") && !r.external_id.startsWith("h:")) {
        await prisma.finance_transactions.update({ where: { id: twin.id }, data: { external_id: r.external_id } }).catch(() => undefined);
      }
    }
    rows.splice(0, rows.length, ...keep);
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const r = await prisma.finance_transactions.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
    inserted += r.count;
  }
  await prisma.finance_accounts.update({ where: { id: account.id }, data: { last_synced_at: new Date() } });
  return inserted;
}

/**
 * Retenidos (26/11/2026). Un cargo retenido se guarda como cualquier otro, marcado como pendiente. En cada
 * sincronización, los retenidos que ya tenemos:
 * - si vuelven a llegar retenidos, se quedan como están;
 * - si llegan contabilizados (con el mismo identificador o con otro: mismo signo, importe parecido, a pocos días y
 *   el mismo comercio), el retenido pasa a ser el movimiento definitivo (con su categoría y lo que hayas editado) y
 *   el contabilizado no se inserta aparte;
 * - si ya no llegan y su fecha cae dentro de lo consultado, se anuló: se borra.
 * Modifica «rows» (quita los que ya se han aplicado sobre un retenido).
 */
async function settlePending(accountId: string, rows: Prisma.finance_transactionsCreateManyInput[], from: string) {
  const held = await prisma.finance_transactions.findMany({
    where: { account_id: accountId, pending: true },
    select: { id: true, external_id: true, booking_date: true, amount: true, description: true, counterparty: true },
  });
  if (!held.length) return;
  const day = (d: Date | string) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
  const dayDiff = (a: string, b: string) => Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000;
  const firstWord = (desc: string, cp?: string | null) => merchantKey(desc, cp).split(" ")[0] ?? "";
  const used = new Set<Prisma.finance_transactionsCreateManyInput>();
  for (const h of held) {
    const amount = Number(h.amount);
    const same = rows.find((r) => r.external_id === h.external_id);
    if (same?.pending) { used.add(same); continue; } // sigue retenido
    const booked = same ?? rows.find((r) => !r.pending && !used.has(r)
      && Math.sign(Number(r.amount)) === Math.sign(amount)
      && Math.abs(Number(r.amount) - amount) <= Math.max(0.05, Math.abs(amount) * 0.15)
      && dayDiff(day(r.booking_date as Date), day(h.booking_date)) <= 7
      && firstWord(r.description, r.counterparty) === firstWord(h.description, h.counterparty));
    if (booked) {
      used.add(booked);
      await prisma.finance_transactions.update({
        where: { id: h.id },
        data: { pending: false, external_id: booked.external_id, amount: booked.amount, booking_date: booked.booking_date, description: booked.description, counterparty: booked.counterparty ?? null, updated_at: new Date() },
      }).catch(async () => {
        // El definitivo ya estaba guardado (lo trajo otra sincronización): sobra el retenido.
        await prisma.finance_transactions.delete({ where: { id: h.id } }).catch(() => undefined);
      });
      continue;
    }
    // Ya no llega: si estaba dentro de lo consultado (o lleva más de dos semanas retenido), se anuló.
    if (day(h.booking_date) >= from || dayDiff(day(h.booking_date), todayIso()) > 14) await prisma.finance_transactions.delete({ where: { id: h.id } }).catch(() => undefined);
  }
  const left = rows.filter((r) => !used.has(r));
  rows.splice(0, rows.length, ...left);
}

/** Para el cron diario: todas las personas con algún banco conectado y en vigor. */
export async function syncEveryone() {
  const users = await prisma.personal_bank_connections.findMany({ where: { consent_expires_at: { gt: new Date() } }, select: { user_id: true }, distinct: ["user_id"] });
  const out: { user: string; inserted: number; errors: number }[] = [];
  for (const u of users) {
    try {
      const r = await syncUser(u.user_id, { force: true });
      out.push({ user: u.user_id.slice(0, 8), inserted: r.inserted, errors: r.errors.length });
    } catch (e) {
      console.error("[finance] cron sync", e instanceof Error ? e.message.slice(0, 200) : e);
    }
  }
  return out;
}
