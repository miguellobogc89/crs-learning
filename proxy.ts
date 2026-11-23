import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  internalHomePathForHost,
  moduleHref,
  PUBLIC_MODULE_HOME,
} from "@/lib/app/module-domains";

/**
 * Cada subdominio muestra su inicio en /home. La reescritura conserva los
 * layouts y rutas existentes; los enlaces antiguos redirigen a la URL pública.
 * No se alteran APIs, Auth.js, assets ni previews.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host");
  const destination = moduleHref(pathname, host);

  if (destination.startsWith("https://")) {
    return NextResponse.redirect(new URL(destination + search), 307);
  }

  if (destination !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = destination;
    return NextResponse.redirect(url, 307);
  }

  if (pathname === PUBLIC_MODULE_HOME) {
    const internalPath = internalHomePathForHost(host);
    if (internalPath) {
      const url = request.nextUrl.clone();
      url.pathname = internalPath;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/home",
    "/finanzas/:path*", "/mis-finanzas/:path*", "/trading/:path*",
    "/achievements/:path*", "/admin/:path*", "/analytics/:path*",
    "/assistant/:path*", "/connectors/:path*", "/courses/:path*",
    "/dashboard/:path*", "/engine/:path*", "/knowledge/:path*",
    "/my-space/:path*", "/notifications/:path*", "/search/:path*",
    "/settings/:path*", "/tenders/:path*", "/users/:path*",
    "/whatsapp/:path*",
  ],
};
