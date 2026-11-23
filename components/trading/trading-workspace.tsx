"use client";
import { useRouter } from "next/navigation";
import type { getOverview } from "@/lib/trading/service";
import { CarteraPanel } from "./cartera-panel";
import { AgentsPanel } from "./agents-panel";
import { FaroPanel } from "./faro-panel";
import { HomePanel } from "./home-panel";
import { IntegrationsPanel } from "./integrations-panel";
import { MarketsPanel } from "./markets-panel";
import { PortfolioPanel } from "./portfolio-panel";
import { PushSettingsPanel } from "./push-settings";
import { ShellMeta } from "./shell";
import { VIRTUAL_PORTFOLIO_TITLE, isFittedTab, type TradingTab } from "./tabs";

export type Overview = Awaited<ReturnType<typeof getOverview>> & { canManage: boolean };

export function TradingWorkspace({ tab, virtual = false }: { tab: TradingTab; virtual?: boolean }) {
  const router = useRouter();
  let body: React.ReactNode = null;
  if (tab === "inicio") body = <HomePanel />;
  else if (tab === "oportunidades") body = <FaroPanel />;
  else if (tab === "cartera") {
    body = virtual ? (
      <>
        <ShellMeta title={VIRTUAL_PORTFOLIO_TITLE} />
        <PortfolioPanel onOpenChart={(symbol) => router.push(`/trading/mercados?${new URLSearchParams({ tab: "valores", symbol })}`)} />
      </>
    ) : <CarteraPanel />;
  }
  else if (tab === "agentes") body = <AgentsPanel />;
  else if (tab === "mercados") body = <MarketsPanel />;
  else if (tab === "integraciones") body = <IntegrationsPanel />;
  else if (tab === "notificaciones") body = <PushSettingsPanel />;

  const fitted = isFittedTab(tab);
  return (
    <div className={fitted ? "flex h-full min-h-0 flex-col gap-4" : "space-y-4"}>
      {fitted ? <div className="min-h-0 flex-1">{body}</div> : body}
    </div>
  );
}
