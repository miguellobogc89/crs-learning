"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import type { getOverview } from "@/lib/trading/service";
import { api, errorText } from "./format";
import { useTradingRefresh } from "./navigation";
import { MarketPanel } from "./market-panel";
import { LibraryPanel } from "./library-panel";
import { PortfolioPanel, RulesPanel, UniversePanel } from "./portfolio-panel";
import { AgentsPanel } from "./agents-panel";
import { NewsPanel } from "./news-panel";
import { OpportunitiesPanel } from "./opportunities-panel";
import { HomePanel } from "./home-panel";
import type { TradingTab } from "./tabs";
import { LoadingCard } from "./ui";

export type Overview = Awaited<ReturnType<typeof getOverview>> & { canManage: boolean };

/** Paneles que necesitan el análisis completo del mercado. */
const NEEDS_OVERVIEW: TradingTab[] = ["mercado"];

export function TradingWorkspace({ tab }: { tab: TradingTab }) {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(NEEDS_OVERVIEW.includes(tab));
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<string | null>(params.get("symbol"));

  const load = useCallback(async () => {
    if (!NEEDS_OVERVIEW.includes(tab)) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api<Overview>("overview"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  const openChart = (s: string) => router.push(`/trading/mercado?symbol=${encodeURIComponent(s)}`);
  const pickSymbol = (s: string) => {
    setSymbol(s);
    window.history.replaceState(null, "", `/trading/mercado?symbol=${encodeURIComponent(s)}`);
  };

  let body: React.ReactNode = null;
  if (NEEDS_OVERVIEW.includes(tab)) {
    if (loading && !data)
      body = (
        <LoadingCard />
      );
    else if (data && data.instrumentsWithData === 0)
      body = (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)] p-6 text-sm text-slate-600">
          Aún no hay cotizaciones guardadas.{" "}
          {data.canManage
            ? "La primera descarga (6 años del IBEX 35) arranca sola desde el panel de la izquierda y tarda uno o dos minutos."
            : "Pide a un administrador del espacio que pulse «Actualizar cotizaciones» en el panel de la izquierda."}
        </div>
      );
    else if (data && tab === "mercado") body = <MarketPanel data={data} symbol={symbol} onSymbol={pickSymbol} />;
  } else if (tab === "inicio") body = <HomePanel />;
  else if (tab === "oportunidades") body = <OpportunitiesPanel />;
  else if (tab === "noticias") body = <NewsPanel />;
  else if (tab === "cartera") body = <PortfolioPanel onOpenChart={openChart} />;
  else if (tab === "agentes") body = <AgentsPanel />;
  else if (tab === "patrones") body = <LibraryPanel />;
  else if (tab === "reglas") body = <RulesPanel />;
  else if (tab === "valores") body = <UniversePanel />;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {body}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Simulación con dinero ficticio. Las figuras chartistas no garantizan resultados y lo que pasó antes no asegura lo que
        pasará. Cotizaciones de cierre de un proveedor público, sin garantía de exactitud. No es asesoramiento financiero.
      </p>
    </div>
  );
}
