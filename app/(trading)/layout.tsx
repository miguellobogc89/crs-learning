// Trading mantiene su navegación interna, pero comparte identidad e instalación PWA con CRS.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAccessAppModule } from "@/lib/platform/access";

export const metadata: Metadata = { title: "CRS Trading" };

export default async function TradingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  if (!(await canAccessAppModule(session.user.id, "trading"))) redirect("/apps");
  return children;
}
