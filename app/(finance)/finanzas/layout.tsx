// Estructura de CRS Finance (menú, Mi dinero): se queda montada al cambiar de sección.
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { hasBusinessAccess } from "@/lib/auth/business-access";
import { FinanceShell } from "@/components/finance/shell";

export default async function FinanceSectionLayout({ children }: { children: ReactNode }) {
  const user = (await auth())?.user;
  const canAccessBusiness = user?.id ? await hasBusinessAccess(user.id) : false;
  return <FinanceShell user={{ name: user?.name, email: user?.email, image: user?.image, canAccessBusiness }}>{children}</FinanceShell>;
}
