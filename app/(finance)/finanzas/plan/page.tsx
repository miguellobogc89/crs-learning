import type { Metadata } from "next";
import { FinanceWorkspace } from "@/components/finance/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plan · CRS Finance" };

/** Plan. Tiene carpeta propia por el detalle de categoría que cuelga de ella. */
export default function Page() {
  return <FinanceWorkspace tab="plan" />;
}
