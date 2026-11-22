import type { Metadata } from "next";
import { LabCategoryPanel } from "@/components/finance/lab-category-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Laboratorio · CRS Finance" };

type PageProps = { params: Promise<{ key: string }> };

/** Laboratorio de Plan: detalle de una categoría (sus movimientos de este ciclo). */
export default async function Page({ params }: PageProps) {
  const { key } = await params;
  return <LabCategoryPanel categoryKey={decodeURIComponent(key)} />;
}
