import { redirect } from "next/navigation";
import { connectorContext } from "@/lib/connectors/context";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { TradingWorkspace } from "@/components/trading/trading-workspace";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await connectorContext();
  if (!ctx) redirect("/");
  return (
    <AppPageLayout
      header={
        <AppPageHeader
          section={APP_SECTIONS.trading}
          title="Trading"
          description="Figuras chartistas detectadas en el IBEX 35 con su plan de entrada, stop, objetivo y tamaño, validadas con backtest y operadas en una cartera virtual. Simulación educativa: no es asesoramiento financiero."
        />
      }
      contentClassName="!pb-6"
    >
      <TradingWorkspace key={ctx.workspaceId} />
    </AppPageLayout>
  );
}
