import type { Metadata } from "next";
import { categoryLabel } from "@/lib/finance/categories";
import { PlanCategoryPanel } from "@/components/finance/plan-category-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { key } = await params;
  return { title: `${categoryLabel(decodeURIComponent(key))} · CRS Finance` };
}

/** Hoja de una categoría (no es una sección): su evolución y sus movimientos, por ciclos. */
export default async function Page({ params }: PageProps) {
  const { key } = await params;
  return <PlanCategoryPanel categoryKey={decodeURIComponent(key)} />;
}
