import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncYaxiConnection } from "@/lib/finance/yaxi-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Sync only an owned YAXI bank after successful consent, never Enable Banking. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  }
  if (process.env.YAXI_CONNECT_ENABLED !== "true") {
    return NextResponse.json({ error: "YAXI no está habilitado" }, { status: 503 });
  }
  const payload: unknown = await request.json().catch(() => null);
  const bank = payload && typeof payload === "object" && "bank" in payload ? payload.bank : null;
  if (typeof bank !== "string" || !/^yaxi:connection-[a-f0-9-]{36}$/i.test(bank)) {
    return NextResponse.json({ error: "Banco no válido" }, { status: 400 });
  }
  try {
    const result = await syncYaxiConnection(session.user.id, bank);
    if (result.errors) {
      return NextResponse.json({
        error: "El banco se ha vinculado, pero no se han podido descargar los datos.",
        detail: result.errorMessages[0] ?? null,
      }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
    }
    if (result.banks === 0 && result.skipped === 0) {
      return NextResponse.json({ error: "No se encontró una conexión bancaria válida" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true, transactions: result.transactions, alreadySynced: result.skipped > 0,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo sincronizar la cuenta" }, { status: 502 });
  }
}
