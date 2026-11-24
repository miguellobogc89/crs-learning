import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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

  // Hard quota: two interactive authorizations per user per 24h, 800 tickets
  // across all beta users per calendar month. Serialized across Vercel instances.
  const ticketData = issueYaxiTicket("Accounts");
  const allowed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72596821)`;
    const counts = await tx.$queryRaw<Array<{ daily: bigint; monthly: bigint }>>`
      SELECT
        (SELECT count(*) FROM yaxi_ticket_usage
          WHERE user_id = ${session.user.id}::uuid AND source = 'interactive' AND created_at >= now() - interval '24 hours') AS daily,
        (SELECT count(*) FROM yaxi_ticket_usage
          WHERE created_at >= date_trunc('month', now())) AS monthly
    `;
    if (Number(counts[0]?.daily ?? 0) >= 2 || Number(counts[0]?.monthly ?? 0) >= 800) return false;
    await tx.$executeRaw`
      INSERT INTO yaxi_ticket_usage (ticket_id, user_id)
      VALUES (${ticketData.ticketId}::uuid, ${session.user.id}::uuid)
    `;
    return true;
  });
  if (!allowed) {
    return NextResponse.json({ error: "Límite diario de conexiones alcanzado" }, { status: 429 });
  }
  const { ticketId, ticket } = ticketData;
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
    sameSite: "lax",
    path: "/api/finance/banks/yaxi/result",
    maxAge: 600,
  });
  return response;
}
