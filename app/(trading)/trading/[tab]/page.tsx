import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connectorContext } from "@/lib/connectors/context";
import { TradingWorkspace } from "@/components/trading/trading-workspace";
import { TRADING_TABS, VIRTUAL_PORTFOLIO_TITLE, isTradingTab } from "@/components/trading/tabs";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tab: string }>;
  searchParams: Promise<{ symbol?: string | string[]; modo?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { tab } = await params;
  if (tab === "cartera" && (await searchParams).modo === "virtual") {
    return { title: VIRTUAL_PORTFOLIO_TITLE };
  }
  const section = TRADING_TABS.find((item) => item.key === tab);
  return section ? { title: section.label } : {};
}

export default async function Page({ params, searchParams }: PageProps) {
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
  // La estructura (barra, menú) está en el layout: aquí solo el contenido de la sección.
  const virtual = tab === "cartera" && (await searchParams).modo === "virtual";
  return <TradingWorkspace key={`${ctx.workspaceId}:${tab}`} tab={tab} virtual={virtual} />;
}
