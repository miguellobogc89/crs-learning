// Finances mantiene su navegación interna, pero comparte identidad e instalación PWA con CRS.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAccessAppModule } from "@/lib/platform/access";

export const metadata: Metadata = { title: "CRS Finance" };

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  if (!(await canAccessAppModule(session.user.id, "finanzas"))) redirect("/apps");
  return children;
}
