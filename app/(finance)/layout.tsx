// CRS Finance con su propia estructura, como Trading: sin la barra superior, el menú ni el chat de la app
// general. Mismo login y misma base de datos; los datos son de la persona, nunca de un espacio de trabajo.
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Instalable como app («Añadir a pantalla de inicio»): se abre a pantalla completa.
export const metadata: Metadata = {
  title: "CRS Finance",
  applicationName: "CRS Finance",
  manifest: "/finance-app/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Finanzas", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/finance-app/favicon.svg", sizes: "any", type: "image/svg+xml" }],
    apple: [{ url: "/finance-app/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return children;
}
