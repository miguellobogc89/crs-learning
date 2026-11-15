// Estructura de Trading (barra, menú, Mi dinero): se queda montada al cambiar de sección; solo cambia el
// contenido, y mientras carga se ve su esqueleto (loading.tsx).
import type { ReactNode } from "react";
import { TradingShell } from "@/components/trading/shell";

export default function TradingSectionLayout({ children }: { children: ReactNode }) {
  return <TradingShell>{children}</TradingShell>;
}
