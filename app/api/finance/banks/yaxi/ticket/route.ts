import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { encrypt } from "@/lib/connectors/crypto";
import { isYaxiConfigured, issueYaxiTicket } from "@/lib/personal-finance/yaxi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First phase of YAXI banking integration: authenticated Accounts ticket.
 * This endpoint never receives or stores banking credentials.
 * Do not enable public beta before adding per-user usage limits.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Tickets are chargeable credentials. Reject cross-origin browser requests.
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.nextUrl.host ||
    new URL(origin).protocol !== request.nextUrl.protocol) {
    return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  }

  // Closed until bank selection, result verification and per-user quotas are ready.
  if (process.env.YAXI_CONNECT_ENABLED !== "true") {
    return NextResponse.json({ error: "Integración en preparación" }, { status: 503 });
  }

  if (!isYaxiConfigured()) {
    return NextResponse.json({ error: "YAXI no está configurado" }, { status: 503 });
  }

  const { ticketId, ticket } = issueYaxiTicket("Accounts");
  const response = NextResponse.json(
    { ticketId, ticket },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  // Bind the result to the authenticated requester. Never trust client-provided ticket IDs.
  response.cookies.set("crs_yaxi_accounts", encrypt(JSON.stringify({
    ticketId, userId: session.user.id, issuedAt: Date.now(),
  })), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "strict",
    path: "/api/finance/banks/yaxi/result",
    maxAge: 600,
  });
  return response;
}
