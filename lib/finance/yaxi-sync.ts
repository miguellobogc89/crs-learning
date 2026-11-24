import "server-only";

import { createHash } from "node:crypto";
import { AccountField, BalanceType, RoutexRefreshClient, TransactionStatus } from "routex-refresh-client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/connectors/crypto";
import { isYaxiConfigured, issueYaxiTicket, type YaxiService } from "@/lib/personal-finance/yaxi";
import { classifyPending } from "./classify";
import { ibanHash } from "./store";

const MONTHLY_TICKET_LIMIT = 800;
const OVERLAP_DAYS = 7;
const INITIAL_HISTORY_DAYS = 89;

type AccountRef = { iban: string; currency?: string };

function validAccounts(encrypted: string): AccountRef[] {
  const raw: unknown = JSON.parse(decrypt(encrypted));
  if (!Array.isArray(raw)) throw new Error("Cuentas YAXI no válidas");
  return raw.filter((a): a is AccountRef =>
    !!a && typeof a === "object" &&
    typeof a.iban === "string" && /^[A-Z]{2}[A-Z0-9]{13,32}$/.test(a.iban) &&
    (a.currency === undefined || typeof a.currency === "string"),
  ).slice(0, 20);
}

function decodeConnectionData(encrypted: string): Uint8Array {
  const raw: unknown = JSON.parse(decrypt(encrypted));
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 150_000 ||
    !raw.every(x => Number.isInteger(x) && x >= 0 && x <= 255)) {
    throw new Error("La conexión requiere nueva autorización");
  }
  return new Uint8Array(raw);
}

/**
 * Issue and count a chargeable YAXI call atomically across serverless workers.
 * The quota is below the free plan ceiling, leaving space for unexpected usage.
 */
async function budgetedTicket(userId: string, service: YaxiService, data: unknown = null) {
  const candidate = issueYaxiTicket(service, data);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72596821)`;
    const totals = await tx.$queryRaw<Array<{ monthly: bigint }>>`
      SELECT count(*) AS monthly FROM yaxi_ticket_usage
      WHERE created_at >= date_trunc('month', now())
    `;
    if (Number(totals[0]?.monthly ?? 0) >= MONTHLY_TICKET_LIMIT) return null;
    await tx.$executeRaw`
      INSERT INTO yaxi_ticket_usage (ticket_id, user_id, source, service)
      VALUES (${candidate.ticketId}::uuid, ${userId}::uuid, 'cron', ${service})
    `;
    return candidate.ticket;
  });
}

function yaxiUid(iban: string): string {
  return "yaxi:" + createHash("sha256").update(iban).digest("hex");
}
function earlierDate(date: Date, days: number): string {
  return new Date(date.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}
function currencyValue(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 48);
}

export async function syncYaxiConnections(opts: { userId?: string; bank?: string } = {}) {
  if (!isYaxiConfigured() || process.env.YAXI_CONNECT_ENABLED !== "true") {
    return { banks: 0, transactions: 0, errors: 0, disabled: true };
  }
  const connections = await prisma.personal_bank_connections.findMany({
    where: { bank: opts.bank ? opts.bank : { startsWith: "yaxi:" }, ...(opts.userId ? { user_id: opts.userId } : {}), consent_expires_at: { gt: new Date() } },
    orderBy: { created_at: "asc" },
  });
  const client = new RoutexRefreshClient();
  const users = new Set<string>();
  const result = { banks: 0, transactions: 0, errors: 0, skipped: 0, errorMessages: [] as string[] };
  for (const connection of connections) {
    const userId = connection.user_id;
    try {
      const accounts = validAccounts(connection.account_ids_enc);
      if (!accounts.length) continue;
      const existing = await prisma.finance_accounts.findMany({
        where: { user_id: userId, bank: connection.bank },
      });
      // Every YAXI connection is refreshed no more than once per local day.
      // Today's first refresh after onboarding is allowed.
      const localDay = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
      if (existing.length && existing.every(a => a.last_synced_at &&
        a.last_synced_at.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }) === localDay)) {
        result.skipped++;
        continue;
      }

      // The same IBAN can already exist through Enable Banking: keep the
      // YAXI import excluded so overlapping transactions never double-count.
      for (const account of existing) {
        if (!account.iban_hash) continue;
        const duplicate = await prisma.finance_accounts.findFirst({
          where: { user_id: userId, id: { not: account.id }, bank: { not: connection.bank }, iban_hash: account.iban_hash },
          select: { id: true },
        });
        if (duplicate && account.included) {
          await prisma.finance_accounts.update({ where: { id: account.id }, data: { included: false } });
        }
      }

      let opaque = decodeConnectionData(connection.session_id_enc);
      async function saveOpaque(update: Uint8Array | undefined) {
        if (!update?.length) return;
        opaque = update;
        await prisma.personal_bank_connections.update({
          where: { id: connection.id },
          data: { session_id_enc: encrypt(JSON.stringify(Array.from(update))), updated_at: new Date() },
        });
      }

      const balancesTicket = await budgetedTicket(userId, "Balances");
      if (!balancesTicket) break;
      const balances = await client.balances({
        ticket: balancesTicket,
        connectionData: opaque,
        accounts,
      });
      await saveOpaque(balances.connectionData);
      for (const item of balances.result.balances ?? []) {
        if (!("iban" in item.account) || !item.account.iban) continue;
        const matching = item.balances.find(b => b.balanceType === BalanceType.Booked) ??
          item.balances.find(b => b.balanceType === BalanceType.Available) ?? item.balances[0];
        const balance = currencyValue(matching?.amount);
        if (balance === null) continue;
        await prisma.finance_accounts.updateMany({
          where: { user_id: userId, external_uid: yaxiUid(item.account.iban) },
          data: { balance, balance_at: new Date() },
        });
      }

      for (const account of accounts) {
        const prior = existing.find(x => x.external_uid === yaxiUid(account.iban));
        const from = earlierDate(prior?.last_synced_at ?? new Date(), prior?.last_synced_at ? OVERLAP_DAYS : INITIAL_HISTORY_DAYS);
        const ticket = await budgetedTicket(userId, "Transactions", {
          account, range: { from },
        });
        if (!ticket) break;
        const resultTx = await client.transactions({ ticket, connectionData: opaque });
        await saveOpaque(resultTx.connectionData);
        const transactions = resultTx.result ?? [];
        const record = await prisma.finance_accounts.findUnique({
          where: { user_id_external_uid: { user_id: userId, external_uid: yaxiUid(account.iban) } },
        });
        if (!record) continue;
        const seen = new Map<string, number>();
        const rows = [];
        for (const tx of transactions) {
          if (tx.status !== TransactionStatus.Booked) continue;
          const date = tx.bookingDate ?? tx.valueDate;
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          const amount = currencyValue(tx.amount?.amount);
          if (amount === null) continue;
          const description = (tx.remittanceInformation?.filter(Boolean).join(" · ") ||
            tx.additionalInformation || tx.creditor?.name || tx.debtor?.name || "Movimiento bancario").slice(0, 500);
          const basis = tx.transactionId || tx.accountServicerReference || tx.entryReference ||
            fingerprint(`${date}|${amount}|${description}`);
          const occurrence = (seen.get(basis) ?? 0) + 1;
          seen.set(basis, occurrence);
          const externalId = `yaxi:${fingerprint(`${basis}|${occurrence}`)}`;
          const outgoing = amount < 0;
          rows.push({
            user_id: userId,
            account_id: record.id,
            external_id: externalId,
            source: "bank",
            booking_date: new Date(`${date}T00:00:00Z`),
            amount,
            currency: tx.amount.currency ?? account.currency ?? "EUR",
            description,
            counterparty: (outgoing ? tx.creditor?.name : tx.debtor?.name)?.slice(0, 200) ?? null,
            counterparty_iban_hash: ibanHash(outgoing ? tx.creditor?.iban : tx.debtor?.iban),
          });
        }
        for (let i = 0; i < rows.length; i += 300) {
          const output = await prisma.finance_transactions.createMany({ data: rows.slice(i, i + 300), skipDuplicates: true });
          result.transactions += output.count;
        }
        await prisma.finance_accounts.update({
          where: { id: record.id }, data: { last_synced_at: new Date() },
        });
      }
      result.banks++;
      users.add(userId);
    } catch (error) {
      result.errors++;
      // Show only a safe class of error to the user, never bank identifiers or payloads.
      const errorName = error instanceof Error ? error.name : "Error";
      result.errorMessages.push(
        /Ticket|AccessExceeded|Interrupt|NotFound|Provider|Connection|Unauthorized/.test(errorName)
          ? errorName : "No se pudo consultar el banco",
      );
      // Never log encrypted consent, bank account identifiers or raw provider responses.
      console.error("[finance] YAXI sync", {
        code: error instanceof Error ? error.name : "unknown",
        bank: connection.id.slice(0, 8),
      });
    }
  }
  for (const userId of users) {
    await classifyPending(userId, { useAi: false }).catch(() => undefined);
  }
  return result;
}

/** Initial sync for a newly authorized bank, or a bounded user retry. */
export async function syncYaxiConnection(userId: string, bank: string) {
  if (!/^yaxi:connection-[a-f0-9-]{36}$/i.test(bank)) throw new Error("Banco no válido");
  return syncYaxiConnections({ userId, bank });
}

export async function syncYaxiEveryone() {
  return syncYaxiConnections();
}
