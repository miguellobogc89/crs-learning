import { notFound, redirect } from "next/navigation";
import { connectorContext } from "@/lib/connectors/context";
import { TradingShell } from "@/components/trading/shell";
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
  return (
    <TradingShell title={def.name} section={parent.key} back={{ href: `/trading/${parent.key}`, label: parent.label }} fitted>
      <AgentPage key={key} agentKey={key} />
    </TradingShell>
  );
}
