import type { Metadata } from "next";
import { ExtrasPanel } from "@/components/finance/plan-category-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Extraordinarios · CRS Finance" };

/** Hoja de los extraordinarios: lo que marcaste como extraordinario, por ciclos, con su evolución. */
export default function Page() {
  return <ExtrasPanel />;
}
