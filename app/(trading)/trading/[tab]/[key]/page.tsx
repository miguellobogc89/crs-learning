import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connectorContext } from "@/lib/connectors/context";
import { ShellMeta } from "@/components/trading/shell";
import { AgentPage } from "@/components/trading/agent-page";
import { TRADING_TABS } from "@/components/trading/tabs";
import { agentByKey, ARCHIVED_AGENTS } from "@/lib/trading/agents/roster";
import { ARCHIVED_KAMIKAZES, kamikazeByKey } from "@/lib/trading/kamikaze/roster";
import { chipByKey } from "@/lib/trading/chip/roster";

export const dynamic = "force-dynamic";

// Los archivados ya no tienen página (los enlaces viejos dan «no encontrado»).
const findAgent = (key: string) =>
  ARCHIVED_AGENTS.has(key) || ARCHIVED_KAMIKAZES.has(key) ? null : agentByKey(key) ?? kamikazeByKey(key) ?? chipByKey(key);

export async function generateMetadata({ params }: { params: Promise<{ tab: string; key: string }> }): Promise<Metadata> {
  const { tab, key } = await params;
  const agent = tab === "agentes" ? findAgent(key) : null;
  return agent ? { title: agent.name } : {};
}

/** Página de un agente: /trading/agentes/<clave>. La miga indica de dónde vienes (?from=inicio). */
export default async function Page({ params, searchParams }: { params: Promise<{ tab: string; key: string }>; searchParams: Promise<{ from?: string }> }) {
  const { tab, key } = await params;
  if (tab !== "agentes") notFound();
  const def = findAgent(key);
  if (!def) notFound();
  const ctx = await connectorContext();
  if (!ctx) redirect("/");
  const { from } = await searchParams;
  const parent = TRADING_TABS.find((t) => t.key === (from === "inicio" ? "inicio" : from === "cartera" ? "cartera" : "agentes"))!;
  return (
    <>
      <ShellMeta title={def.name} back={{ href: parent.key === "inicio" ? "/trading/inicio?vista=operadores" : `/trading/${parent.key}`, label: parent.label }} />
      <AgentPage key={key} agentKey={key} />
    </>
  );
}
