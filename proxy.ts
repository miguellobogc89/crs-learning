import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { moduleHref } from "@/lib/app/module-domains";

/** URLs canónicas por módulo, sin afectar APIs, Auth.js, assets ni previews. */
export function proxy(request: NextRequest) {
  const destination = moduleHref(request.nextUrl.pathname, request.headers.get("host"));
  if (!destination.startsWith("https://")) return NextResponse.next();

  return NextResponse.redirect(new URL(destination + request.nextUrl.search), 307);
}

export const config = {
  matcher: [
    "/finanzas/:path*", "/mis-finanzas/:path*", "/trading/:path*",
    "/achievements/:path*", "/admin/:path*", "/analytics/:path*",
    "/assistant/:path*", "/connectors/:path*", "/courses/:path*",
    "/dashboard/:path*", "/engine/:path*", "/knowledge/:path*",
    "/my-space/:path*", "/notifications/:path*", "/search/:path*",
    "/settings/:path*", "/tenders/:path*", "/users/:path*",
    "/whatsapp/:path*",
  ],
};
