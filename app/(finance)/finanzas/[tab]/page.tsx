import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FinanceWorkspace } from "@/components/finance/workspace";
import { LEGACY_TABS, isFinanceTab, tabDefOf } from "@/components/finance/tabs";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tab: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tab } = await params;
  return isFinanceTab(tab) ? { title: `${tabDefOf(tab).label} · CRS Finance` } : {};
}

export default async function Page({ params }: PageProps) {
  const { tab } = await params;
  if (LEGACY_TABS[tab]) redirect(`/finanzas/${LEGACY_TABS[tab]}`);
  if (!isFinanceTab(tab)) notFound();
  return <FinanceWorkspace tab={tab} />;
}
