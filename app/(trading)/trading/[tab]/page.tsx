import { notFound, redirect } from "next/navigation";
import { connectorContext } from "@/lib/connectors/context";
import { TradingShell } from "@/components/trading/shell";
import { TradingWorkspace } from "@/components/trading/trading-workspace";
import { TRADING_TABS, isFittedTab, isTradingTab } from "@/components/trading/tabs";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ tab: string }>;
  searchParams: Promise<{ symbol?: string | string[] }>;
}) {
  const { tab } = await params;
  // Mantener los enlaces existentes: todas las pantallas antiguas aterrizan en su nueva ubicación.
  if (tab === "hoy") redirect("/trading/oportunidades");
  if (tab === "simulador" || tab === "comite") redirect("/trading/agentes");
  if (tab === "reglas") redirect("/trading/cartera");
  if (tab === "noticias") redirect("/trading/mercados?tab=noticias");
  if (tab === "patrones") redirect("/trading/mercados?tab=aprende");
  if (tab === "valores" || tab === "mercado") {
    const query = new URLSearchParams({ tab: "valores" });
    if (tab === "mercado") {
      const { symbol } = await searchParams;
      const selected = Array.isArray(symbol) ? symbol[0] : symbol;
      if (selected) query.set("symbol", selected);
    }
    redirect(`/trading/mercados?${query.toString()}`);
  }
  if (!isTradingTab(tab)) notFound();
  const ctx = await connectorContext();
  if (!ctx) redirect("/");
  const meta = TRADING_TABS.find((t) => t.key === tab)!;
  return (
    <TradingShell title={meta.label} section={meta.key} fitted={isFittedTab(tab)}>
      <TradingWorkspace key={`${ctx.workspaceId}:${tab}`} tab={tab} />
    </TradingShell>
  );
}
