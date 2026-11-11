import { notFound, redirect } from "next/navigation";
import { connectorContext } from "@/lib/connectors/context";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { TradingNavigation } from "@/components/trading/navigation";
import { TradingWorkspace } from "@/components/trading/trading-workspace";
import { TradingMobileTabs } from "@/components/trading/mobile-tabs";
import { TRADING_TABS, isFittedTab, isTradingTab } from "@/components/trading/tabs";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  // Nombres antiguos de secciones.
  if (tab === "hoy") redirect("/trading/oportunidades");
  if (tab === "simulador" || tab === "comite") redirect("/trading/agentes");
  if (!isTradingTab(tab)) notFound();
  const ctx = await connectorContext();
  if (!ctx) redirect("/");
  const meta = TRADING_TABS.find((t) => t.key === tab)!;
  const Icon = meta.icon;
  const fittedTable = isFittedTab(tab);
  // Cabecera de Trading: solo icono y título (sin migas ni subtítulo).
  const header = (
    <div className="min-w-0">
      <h1 className="flex min-w-0 items-center gap-3 text-[22px] font-semibold leading-[1.2] tracking-tight text-slate-950 sm:text-[26px]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon className="h-5 w-5" />
        </span>
        <span className="truncate">{meta.label}</span>
      </h1>
      <TradingMobileTabs />
    </div>
  );
  return (
    <AppSectionShell sidebar={<TradingNavigation key={ctx.workspaceId} />}>
      <AppPageLayout
        header={header}
        contentClassName={fittedTable ? "!pb-6 !overflow-hidden flex flex-col" : "!pb-6"}
      >
        <TradingWorkspace key={`${ctx.workspaceId}:${tab}`} tab={tab} />
      </AppPageLayout>
    </AppSectionShell>
  );
}
