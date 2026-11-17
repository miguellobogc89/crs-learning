import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { BANK_CALLBACK_PATH, BANK_STATE_COOKIE, bankingRedirectUrl, issueConsentState } from "@/lib/personal-finance/consent";
import { bankingRequest, isPersonalBank, resolveAspsp } from "@/lib/personal-finance/enable-banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/", request.url));
  const bank = request.nextUrl.searchParams.get("bank");
  if (!isPersonalBank(bank)) return NextResponse.json({ error: "Banco no válido" }, { status: 400 });

  const back = (message: string) => NextResponse.redirect(new URL(`/mis-finanzas?error=${encodeURIComponent(message)}`, request.url));
  try {
    const state = issueConsentState(session.user.id, bank);
    const aspsp = await resolveAspsp(bank);
    const response = await bankingRequest<{ url: string }>("/auth", {
      method: "POST",
      body: {
        access: { valid_until: new Date(Date.now() + 30 * 86400000).toISOString() },
        aspsp,
        state: state.nonce,
        redirect_url: bankingRedirectUrl(),
        psu_type: "personal",
      },
    });
    const authorizationUrl = new URL(response.url);
    if (authorizationUrl.protocol !== "https:" || !authorizationUrl.hostname.endsWith(".enablebanking.com") && authorizationUrl.hostname !== "enablebanking.com") {
      throw new Error("La URL de autorización bancaria no es segura");
    }
    const redirect = NextResponse.redirect(authorizationUrl);
    redirect.cookies.set(BANK_STATE_COOKIE, state.cookie, {
      path: BANK_CALLBACK_PATH, httpOnly: true, sameSite: "lax", secure: authorizationUrl.protocol === "https:" && bankingRedirectUrl().startsWith("https:"), maxAge: 600,
    });
    return redirect;
  } catch {
    return back("No se pudo iniciar la autorización. Revisa la configuración bancaria.");
  }
}
