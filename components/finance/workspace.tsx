"use client";
import { Suspense } from "react";
import { TradingSkeleton } from "@/components/trading/skeletons";
import { AccountsPanel } from "./accounts-panel";
import { BudgetPanel } from "./budget-panel";
import { CopilotPanel } from "./copilot-panel";
import { ForecastPanel } from "./forecast-panel";
import { HomePanel } from "./home-panel";
import { MovementsPanel } from "./movements-panel";
import { SettingsPanel } from "./settings-panel";
import { isFittedTab, type FinanceTab } from "./tabs";

export function FinanceWorkspace({ tab }: { tab: FinanceTab }) {
  const body =
    tab === "inicio" ? <HomePanel />
    : tab === "movimientos" ? <MovementsPanel />
    : tab === "presupuesto" ? <BudgetPanel />
    : tab === "prevision" ? <ForecastPanel />
    : tab === "copiloto" ? <CopilotPanel />
    : tab === "cuentas" ? <AccountsPanel />
    : <SettingsPanel />;
  const fitted = isFittedTab(tab);
  return (
    <Suspense fallback={<TradingSkeleton />}>
      <div className={fitted ? "flex h-full min-h-0 flex-col" : "space-y-4"}>{fitted ? <div className="min-h-0 flex-1">{body}</div> : body}</div>
    </Suspense>
  );
}
