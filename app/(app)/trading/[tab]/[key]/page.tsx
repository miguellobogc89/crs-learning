import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { connectorContext } from "@/lib/connectors/context";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { TradingNavigation } from "@/components/trading/navigation";
import { AgentPage } from "@/components/trading/agent-page";
import { TRADING_TABS } from "@/components/trading/tabs";
import { agentByKey } from "@/lib/trading/agents/roster";
import { kamikazeByKey } from "@/lib/trading/kamikaze/roster";
import { chipByKey } from "@/lib/trading/chip/roster";

export const dynamic = "force-dynamic";

/** Página de un agente: /trading/agentes/<clave>. La miga indica de dónde vienes (?from=inicio). */
export default async function Page({ params, searchParams }: { params: Promise<{ tab: string; key: string }>; searchParams: Promise<{ from?: string }> }) {
  const { tab, key } = await params;
  if (tab !== "agentes") notFound();
  const def = agentByKey(key) ?? kamikazeByKey(key) ?? chipByKey(key);
  if (!def) notFound();
  const ctx = await connectorContext();
  if (!ctx) redirect("/");
  const { from } = await searchParams;
  const parent = TRADING_TABS.find((t) => t.key === (from === "inicio" ? "inicio" : from === "cartera" ? "cartera" : "agentes"))!;
  const header = (
    <nav aria-label="Ruta" className="flex min-w-0 items-center gap-2 text-[22px] font-semibold leading-[1.2] tracking-tight sm:text-[26px]">
      <Link href={`/trading/${parent.key}`} className="flex shrink-0 items-center gap-3 text-slate-400 hover:text-slate-700">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <parent.icon className="h-5 w-5" />
        </span>
        {parent.label}
      </Link>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
      <span className="truncate text-slate-950">{def.name}</span>
    </nav>
  );
  return (
    <AppSectionShell sidebar={<TradingNavigation key={ctx.workspaceId} />}>
      <AppPageLayout header={header} contentClassName="!pb-6 !overflow-hidden flex flex-col">
        <AgentPage key={key} agentKey={key} />
      </AppPageLayout>
    </AppSectionShell>
  );
}
