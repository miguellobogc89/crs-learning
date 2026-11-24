import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { decrypt } from "@/lib/connectors/crypto";
import { verifyYaxiResult } from "@/lib/personal-finance/yaxi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First verify a signed Accounts result. Account persistence must be added
 * alongside provider-aware consent storage and the daily refresh scheduler.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  }

  try {
    const cookie = request.cookies.get("crs_yaxi_accounts")?.value;
    if (!cookie) return NextResponse.json({ error: "La autorización ha caducado" }, { status: 403 });
    const state: unknown = JSON.parse(decrypt(cookie));
    if (!state || typeof state !== "object" || !("userId" in state) ||
        state.userId !== session.user.id || !("ticketId" in state) ||
        typeof state.ticketId !== "string" || !("issuedAt" in state) ||
        typeof state.issuedAt !== "number" ||
        Date.now() - state.issuedAt > 10 * 60_000 || state.issuedAt > Date.now()) {
      return NextResponse.json({ error: "Sesión bancaria inválida" }, { status: 403 });
    }
    const body: unknown = await request.json();
    const jwt = body && typeof body === "object" && "jwt" in body ? body.jwt : null;
    if (typeof jwt !== "string") return NextResponse.json({ error: "Resultado inválido" }, { status: 400 });
    const raw = verifyYaxiResult(jwt, state.ticketId);
    if (!Array.isArray(raw)) return NextResponse.json({ error: "Resultado bancario inesperado" }, { status: 400 });
    // Return only minimal account identification; never print unmasked IBAN or bank credentials.
    const accounts = raw.slice(0, 30).map((item: unknown) => {
      const a = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        name: typeof a.displayName === "string" ? a.displayName.slice(0, 100)
          : typeof a.name === "string" ? a.name.slice(0, 100) : "Cuenta bancaria",
        currency: typeof a.currency === "string" ? a.currency : "EUR",
        ibanLast4: typeof a.iban === "string" ? a.iban.slice(-4) : null,
      };
    });
    const response = NextResponse.json({ verified: true, accounts }, {
      headers: { "Cache-Control": "private, no-store" },
    });
    response.cookies.set("crs_yaxi_accounts", "", {
      httpOnly: true, sameSite: "strict",
      path: "/api/finance/banks/yaxi/result", maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "No se pudo verificar el resultado bancario" }, { status: 400 });
  }
}
