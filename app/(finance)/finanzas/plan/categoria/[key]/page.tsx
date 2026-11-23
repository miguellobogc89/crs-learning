import type { Metadata } from "next";
import { PlanCategoryPanel } from "@/components/finance/plan-category-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plan · CRS Finance" };

type PageProps = { params: Promise<{ key: string }> };

/** Plan: detalle de una categoría (sus movimientos, por ciclos). */
export default async function Page({ params }: PageProps) {
  const { key } = await params;
  return <PlanCategoryPanel categoryKey={decodeURIComponent(key)} />;
}
