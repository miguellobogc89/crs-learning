import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/connectors/crypto";
import { verifyYaxiResult } from "@/lib/personal-finance/yaxi";
import { ibanHash } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The authenticated Accounts result is the sole source of persisted bank data. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (request.headers.get("origin") !== request.nextUrl.origin ||
      process.env.YAXI_CONNECT_ENABLED !== "true") {
    return NextResponse.json({ error: "Conexión no habilitada" }, { status: 403 });
  }
  try {
    const cookie = request.cookies.get("crs_yaxi_accounts")?.value;
    if (!cookie) return NextResponse.json({ error: "Autorización caducada" }, { status: 403 });
    const state: unknown = JSON.parse(decrypt(cookie));
    if (!state || typeof state !== "object" || !("userId" in state) ||
        state.userId !== session.user.id || !("ticketId" in state) ||
        typeof state.ticketId !== "string" || !("issuedAt" in state) ||
        typeof state.issuedAt !== "number" || Date.now() - state.issuedAt > 600000 ||
        state.issuedAt > Date.now()) {
      return NextResponse.json({ error: "Sesión inválida" }, { status: 403 });
    }
    const json: unknown = await request.json();
    if (!json || typeof json !== "object") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    const body = json as Record<string, unknown>;
    if (typeof body.jwt !== "string") return NextResponse.json({ error: "Respuesta inválida" }, { status: 400 });
    const result = verifyYaxiResult(body.jwt, state.ticketId);
    if (!Array.isArray(result) || result.length === 0 || result.length > 30) {
      return NextResponse.json({ error: "No se encontraron cuentas" }, { status: 400 });
    }
    if (typeof body.connectionId !== "string" || !/^connection-[a-f0-9-]{36}$/i.test(body.connectionId) ||
        typeof body.bankName !== "string" || body.bankName.length < 2 || body.bankName.length > 120) {
      return NextResponse.json({ error: "Banco inválido" }, { status: 400 });
    }
    const bank = "yaxi:" + body.connectionId;
    const accounts = result.map((value: unknown) => {
      if (!value || typeof value !== "object") throw new Error("Cuenta inválida");
      const a = value as Record<string, unknown>;
      const iban = typeof a.iban === "string" ? a.iban.replace(/\s/g, "").toUpperCase() : "";
      if (!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)) throw new Error("IBAN inválido");
      return {
        iban,
        externalUid: "yaxi:" + createHash("sha256").update(iban).digest("hex"),
        currency: typeof a.currency === "string" && /^[A-Z]{3}$/.test(a.currency) ? a.currency : "EUR",
        name: (typeof a.displayName === "string" ? a.displayName : typeof a.name === "string" ? a.name : body.bankName as string).slice(0, 120),
        holder: typeof a.ownerName === "string" ? a.ownerName.slice(0, 120) : null,
      };
    });
    // The SDK's opaque connection data is kept encrypted and never shown in the API response.
    const connectionData = body.connectionData ?? null;
    const serialized = JSON.stringify(connectionData);
    if (!serialized || serialized.length > 150000) return NextResponse.json({ error: "Datos de conexión excesivos" }, { status: 400 });
    const count = await prisma.personal_bank_connections.count({
      where: { user_id: session.user.id, bank: { startsWith: "yaxi:" } },
    });
    const old = await prisma.personal_bank_connections.findUnique({
      where: { user_id_bank: { user_id: session.user.id, bank } },
    });
    if (!old && count >= 5) return NextResponse.json({ error: "Límite de cinco bancos en la beta" }, { status: 429 });
    await prisma.$transaction(async (tx) => {
      await tx.personal_bank_connections.upsert({
        where: { user_id_bank: { user_id: session.user.id, bank } },
        create: {
          user_id: session.user.id, bank, institution_name: body.bankName as string,
          session_id_enc: encrypt(serialized),
          account_ids_enc: encrypt(JSON.stringify(accounts.map(a => ({ iban: a.iban, currency: a.currency })))),
          consent_expires_at: new Date(Date.now() + 90 * 86400000),
        },
        update: {
          institution_name: body.bankName as string,
          session_id_enc: encrypt(serialized),
          account_ids_enc: encrypt(JSON.stringify(accounts.map(a => ({ iban: a.iban, currency: a.currency })))),
          consent_expires_at: new Date(Date.now() + 90 * 86400000), updated_at: new Date(),
        },
      });
      for (const account of accounts) {
        await tx.finance_accounts.upsert({
          where: { user_id_external_uid: { user_id: session.user.id, external_uid: account.externalUid } },
          create: {
            user_id: session.user.id, source: "bank", bank, external_uid: account.externalUid,
            name: account.name, holder_name: account.holder, iban_last4: account.iban.slice(-4),
            iban_hash: ibanHash(account.iban), currency: account.currency,
          },
          update: { name: account.name, holder_name: account.holder, currency: account.currency },
        });
      }
    });
    const response = NextResponse.json({
      ok: true, accounts: accounts.map(a => ({ name: a.name, ibanLast4: a.iban.slice(-4) })),
    }, { headers: { "Cache-Control": "private, no-store" } });
    response.cookies.set("crs_yaxi_accounts", "", {
      httpOnly: true, sameSite: "lax", path: "/api/finance/banks/yaxi/result", maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "No se pudo verificar o guardar la conexión" }, { status: 400 });
  }
}
