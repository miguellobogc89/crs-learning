import type { Metadata } from "next";
import { GroupPanel } from "@/components/finance/plan-category-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Grupo · CRS Finance" };

type PageProps = { params: Promise<{ id: string }> };

/** Hoja de un grupo de Mi plan: su evolución y todos sus movimientos, con pills por categoría. */
export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <GroupPanel groupId={decodeURIComponent(id)} />;
}
