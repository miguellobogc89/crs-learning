"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import type { getOverview } from "@/lib/trading/service";
import { api, errorText } from "./format";
import { useTradingRefresh } from "./navigation";
import { RecommendationsPanel } from "./recommendations-panel";
import { MarketPanel } from "./market-panel";
import { LibraryPanel } from "./library-panel";
import { PortfolioPanel, RulesPanel, UniversePanel } from "./portfolio-panel";
import { SimulatorPanel } from "./simulator-panel";
import type { TradingTab } from "./tabs";

export type Overview = Awaited<ReturnType<typeof getOverview>> & { canManage: boolean };

/** Paneles que necesitan el análisis completo del mercado. */
const NEEDS_OVERVIEW: TradingTab[] = ["hoy", "mercado"];

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
        <div className="flex h-48 items-center justify-center border border-slate-200 bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      );
    else if (data && data.instrumentsWithData === 0)
      body = (
        <div className="border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Aún no hay cotizaciones guardadas.{" "}
          {data.canManage
            ? "La primera descarga (6 años del IBEX 35) arranca sola desde el panel de la izquierda y tarda uno o dos minutos."
            : "Pide a un administrador del espacio que pulse «Actualizar cotizaciones» en el panel de la izquierda."}
        </div>
      );
    else if (data && tab === "hoy") body = <RecommendationsPanel data={data} onOpenChart={openChart} />;
    else if (data && tab === "mercado") body = <MarketPanel data={data} symbol={symbol} onSymbol={pickSymbol} />;
  } else if (tab === "cartera") body = <PortfolioPanel onOpenChart={openChart} />;
  else if (tab === "simulador") body = <SimulatorPanel onOpenChart={openChart} />;
  else if (tab === "patrones") body = <LibraryPanel />;
  else if (tab === "reglas") body = <RulesPanel />;
  else if (tab === "valores") body = <UniversePanel />;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
