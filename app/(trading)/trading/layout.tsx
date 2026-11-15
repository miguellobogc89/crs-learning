// Estructura de Trading (barra, menú, Mi dinero): se queda montada al cambiar de sección; solo cambia el
// contenido, y mientras carga se ve su esqueleto (loading.tsx).
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { hasBusinessAccess } from "@/lib/auth/business-access";
import { TradingShell } from "@/components/trading/shell";

export default async function TradingSectionLayout({ children }: { children: ReactNode }) {
  const user = (await auth())?.user;
  const canAccessBusiness = user?.id ? await hasBusinessAccess(user.id) : false;
  return (
    <TradingShell user={{ name: user?.name, email: user?.email, image: user?.image, canAccessBusiness }}>
      {children}
    </TradingShell>
  );
}
