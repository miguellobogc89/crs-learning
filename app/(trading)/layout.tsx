// Trading con su propia estructura: sin la barra superior, el menú, el chat ni las colas de la app general,
// para usar toda la pantalla (sobre todo en móvil y tablet). Mismo login y misma base de datos.
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Instalable como app («Añadir a pantalla de inicio»): se abre a pantalla completa, sin la barra del navegador.
export const metadata: Metadata = {
  title: "CRS Trading",
  applicationName: "CRS Trading",
  manifest: "/trading-app/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Trading", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/trading-app/favicon.svg", sizes: "any", type: "image/svg+xml" }],
    apple: [{ url: "/trading-app/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function TradingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return children;
}
