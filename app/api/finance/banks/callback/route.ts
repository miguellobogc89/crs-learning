import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/connectors/crypto";
import { BANK_CALLBACK_PATH, BANK_STATE_COOKIE, verifyConsentState } from "@/lib/personal-finance/consent";
import { bankingRequest, type BankSession } from "@/lib/personal-finance/enable-banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const currentUser = await auth();
  if (!currentUser?.user?.id) return NextResponse.redirect(new URL("/", request.url));
  const state = verifyConsentState(
    request.cookies.get(BANK_STATE_COOKIE)?.value,
    request.nextUrl.searchParams.get("state"), currentUser.user.id,
  );
  const finish = (message: string) => {
    const response = NextResponse.redirect(new URL(`/finanzas/cuentas?${message}`, request.url));
    response.cookies.set(BANK_STATE_COOKIE, "", { path: BANK_CALLBACK_PATH, maxAge: 0 });
    return response;
  };
  if (!state) return finish("error=autorizacion_invalida");
  const code = request.nextUrl.searchParams.get("code");
  if (!code || request.nextUrl.searchParams.has("error")) return finish("error=autorizacion_cancelada");
  let phase = "exchange-code";
  try {
    const linked = await bankingRequest<BankSession>("/sessions", { method: "POST", body: { code } });
    phase = "validate-session";
    // POST /sessions returns account objects; only their opaque `uid` is needed for later queries.
    const accountIds = Array.isArray(linked.accounts)
      ? linked.accounts.map((account) => account?.uid).filter((uid): uid is string => typeof uid === "string" && uid.length > 0)
      : [];
    if (!linked.session_id || accountIds.length === 0) {
      throw new Error("Respuesta bancaria incompleta");
    }
    const expiry = new Date(linked.access?.valid_until);
    if (Number.isNaN(expiry.getTime())) throw new Error("Caducidad bancaria no válida");

    phase = "lookup-connection";
    const old = await prisma.personal_bank_connections.findUnique({ where: { user_id_bank: { user_id: currentUser.user.id, bank: state.bank } } });
    phase = "save-connection";
    await prisma.personal_bank_connections.upsert({
      where: { user_id_bank: { user_id: currentUser.user.id, bank: state.bank } },
      create: {
        user_id: currentUser.user.id, bank: state.bank, institution_name: linked.aspsp?.name ?? state.bank,
        session_id_enc: encrypt(linked.session_id), account_ids_enc: encrypt(JSON.stringify(accountIds)), consent_expires_at: expiry,
      },
      update: {
        institution_name: linked.aspsp?.name ?? state.bank,
        session_id_enc: encrypt(linked.session_id), account_ids_enc: encrypt(JSON.stringify(accountIds)),
        consent_expires_at: expiry, updated_at: new Date(),
      },
    });
    if (old) {
      // Revoke an earlier consent after the replacement has been saved; failure is non-blocking.
      const priorId = decrypt(old.session_id_enc);
      if (priorId !== linked.session_id) {
        try { await bankingRequest(`/sessions/${encodeURIComponent(priorId)}`, { method: "DELETE" }); }
        catch { /* Existing consent will expire at the bank; the replacement is already saved. */ }
      }
    }
    return finish("banco=conectado");
  } catch (error) {
    const reason = error instanceof Error
      ? /^(Enable Banking rechazó la consulta \(\d+\)|Respuesta bancaria incompleta|Caducidad bancaria no válida)$/.test(error.message)
        ? error.message
        : error.message.includes("CONNECTORS_ENCRYPTION_KEY") ? "Clave de cifrado no válida" : error.name
      : "Error desconocido";
    const prismaCode = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code : undefined;
    // Never log the authorization code, session/account IDs, raw provider response or encrypted values.
    console.error("[finance] bank callback failed", { bank: state.bank, phase, reason, prismaCode });
    return finish("error=no_se_pudo_guardar_la_conexion");
  }
}
