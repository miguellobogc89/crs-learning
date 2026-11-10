import { notFound, redirect } from "next/navigation";
import { connectorContext } from "@/lib/connectors/context";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { TradingNavigation } from "@/components/trading/navigation";
import { TradingWorkspace } from "@/components/trading/trading-workspace";
import { TRADING_TABS, isTradingTab } from "@/components/trading/tabs";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  // Nombres antiguos de secciones.
  if (tab === "hoy") redirect("/trading/oportunidades");
  if (!isTradingTab(tab)) notFound();
  const ctx = await connectorContext();
  if (!ctx) redirect("/");
  const meta = TRADING_TABS.find((t) => t.key === tab)!;
  return (
    <AppSectionShell sidebar={<TradingNavigation key={ctx.workspaceId} />}>
      <AppPageLayout
        header={<AppPageHeader section={APP_SECTIONS.trading} items={[{ label: meta.label }]} title={meta.label} description={meta.description} />}
        contentClassName="!pb-6"
      >
        <TradingWorkspace key={`${ctx.workspaceId}:${tab}`} tab={tab} />
      </AppPageLayout>
    </AppSectionShell>
  );
}
