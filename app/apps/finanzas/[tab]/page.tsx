import { notFound } from "next/navigation";

import { FinancePlatformEntry } from "@/components/finance/platform-entry";
import { isFinanceTab } from "@/components/finance/tabs";

export default async function FinanceAppSectionPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!isFinanceTab(tab)) notFound();

  return <FinancePlatformEntry tab={tab} />;
}
