import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/connectors/crypto";
import {
  bankingRequest, isBankingConfigured, isPersonalBank,
  type BankAccountDetails, type BankBalance, type BankTransaction,
} from "@/lib/personal-finance/enable-banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeAccountIds(encrypted: string): string[] {
  const data: unknown = JSON.parse(decrypt(encrypted));
  if (!Array.isArray(data)) throw new Error("Cuentas bancarias no válidas");
  return data.filter((id): id is string => typeof id === "string" && /^[a-f\d-]{36}$/i.test(id)).slice(0, 20);
}

async function loadAccount(uid: string) {
  const id = encodeURIComponent(uid);
  const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const [details, balances, movements] = await Promise.allSettled([
    bankingRequest<BankAccountDetails>(`/accounts/${id}/details`),
    bankingRequest<{ balances: BankBalance[] }>(`/accounts/${id}/balances`),
    bankingRequest<{ transactions: BankTransaction[] }>(`/accounts/${id}/transactions?date_from=${from}`),
  ]);
  const info = details.status === "fulfilled" ? details.value : null;
  const available = balances.status === "fulfilled" ? balances.value.balances ?? [] : [];
  const balance = available.find((item) => item.balance_type === "CLAV") ?? available[0] ?? null;
  const transactions = movements.status === "fulfilled" ? (movements.value.transactions ?? []) : [];
  return {
    id: uid,
    name: info?.name || "Cuenta bancaria",
    iban: info?.account_id?.iban ? `•••• ${info.account_id.iban.slice(-4)}` : null,
    currency: balance?.balance_amount.currency ?? info?.currency ?? "EUR",
    balance: balance && Number.isFinite(Number(balance.balance_amount.amount)) ? Number(balance.balance_amount.amount) : null,
    transactions: transactions.slice(0, 30).map((item, index) => {
      const amount = Number(item.transaction_amount?.amount);
      return {
        id: item.transaction_id ?? `${item.entry_reference ?? uid}-${index}`,
        date: item.booking_date ?? item.value_date ?? "",
        concept: item.remittance_information?.filter(Boolean).join(" · ") || item.note || item.creditor?.name || item.debtor?.name || "Movimiento bancario",
        amount: Number.isFinite(amount) ? (item.credit_debit_indicator === "DBIT" ? -Math.abs(amount) : item.credit_debit_indicator === "CRDT" ? Math.abs(amount) : amount) : null,
        currency: item.transaction_amount?.currency ?? "EUR",
      };
    }),
    warning: [details, balances, movements].some((result) => result.status === "rejected") ? "El banco no ha facilitado todos los datos de esta cuenta." : null,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!isBankingConfigured()) return NextResponse.json({ configured: false, connections: [] }, { headers: { "Cache-Control": "private, no-store" } });

  try {
    const records = await prisma.personal_bank_connections.findMany({ where: { user_id: session.user.id }, orderBy: { created_at: "asc" } });
    const connections = await Promise.all(records.map(async (connection) => {
      const expired = connection.consent_expires_at.getTime() <= Date.now();
      try {
        const accounts = expired ? [] : await Promise.all(safeAccountIds(connection.account_ids_enc).map(loadAccount));
        return {
          bank: connection.bank, institution: connection.institution_name,
          expiresAt: connection.consent_expires_at.toISOString(), expired, accounts, error: null,
        };
      } catch {
        return {
          bank: connection.bank, institution: connection.institution_name,
          expiresAt: connection.consent_expires_at.toISOString(), expired, accounts: [], error: "No se pudieron consultar las cuentas.",
        };
      }
    }));
    return NextResponse.json({ configured: true, connections }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudieron consultar las conexiones bancarias." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const payload = await request.json().catch(() => null) as { bank?: unknown } | null;
  const bank = typeof payload?.bank === "string" ? payload.bank : null;
  if (!isPersonalBank(bank)) return NextResponse.json({ error: "Banco no válido" }, { status: 400 });

  const record = await prisma.personal_bank_connections.findUnique({ where: { user_id_bank: { user_id: session.user.id, bank } } });
  if (!record) return NextResponse.json({ ok: true });
  try {
    const sessionId = decrypt(record.session_id_enc);
    await bankingRequest(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  } catch {
    // Do not claim to have revoked access if the provider did not confirm it.
    return NextResponse.json({ error: "No se pudo revocar el acceso en el banco. Inténtalo de nuevo." }, { status: 502 });
  }
  await prisma.personal_bank_connections.delete({ where: { user_id_bank: { user_id: session.user.id, bank } } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
