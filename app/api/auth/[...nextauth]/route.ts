// app/api/auth/[...nextauth]/route.ts
import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

/**
 * Diagnosis of the Google login on Vercel: on each OAuth callback, logs which auth cookies arrived (NAMES only,
 * never values), the host and the protocol. Lets us tell "cookie missing" from "cookie unreadable".
 */
export async function GET(request: NextRequest) {
  if (request.nextUrl.pathname.includes("/callback/")) {
    const names = request.cookies.getAll().map(c => c.name).filter(n => n.includes("authjs") || n.includes("next-auth"));
    console.info("[auth] callback", JSON.stringify({ host: request.headers.get("host"), forwardedHost: request.headers.get("x-forwarded-host"),
      proto: request.headers.get("x-forwarded-proto"), url: request.nextUrl.origin, cookies: names }));
  }
  return handlers.GET(request);
}
export const POST = handlers.POST;
