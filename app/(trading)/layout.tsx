// Trading con su propia estructura: sin la barra superior, el menú, el chat ni las colas de la app general,
// para usar toda la pantalla (sobre todo en móvil y tablet). Mismo login y misma base de datos.
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "CRS Trading",
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
