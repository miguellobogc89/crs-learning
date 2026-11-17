import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FinanceWorkspace } from "@/components/finance/workspace";
import { FINANCE_TABS, isFinanceTab } from "@/components/finance/tabs";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tab: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tab } = await params;
  const section = FINANCE_TABS.find((item) => item.key === tab);
  return section ? { title: `${section.label} · CRS Finance` } : {};
}

export default async function Page({ params }: PageProps) {
  const { tab } = await params;
  if (!isFinanceTab(tab)) notFound();
  return <FinanceWorkspace tab={tab} />;
}
