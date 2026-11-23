import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MarketingLanding } from "@/components/marketing/landing-page";
import { moduleHomeForHost, moduleHref } from "@/lib/app/module-domains";

export const metadata: Metadata = {
  title: "Crussader | Tecnología inteligente para tu negocio y tu día a día",
  description:
    "Crussader reúne Business, Finance y Trading: información de negocio, finanzas personales y herramientas para seguir los mercados.",
};

export default async function HomePage() {
  const [session, requestHeaders] = await Promise.all([auth(), headers()]);
  const host = requestHeaders.get("host");
  const moduleHome = moduleHomeForHost(host);

  // Los subdominios siguen entrando directamente en su aplicación.
  if (moduleHome) {
    if (!session?.user) redirect("https://crussader.com/login");
    redirect(moduleHref(moduleHome, host));
  }

  // La web corporativa puede visitarse incluso con la sesión iniciada.
  return <MarketingLanding isAuthenticated={Boolean(session?.user)} />;
}
