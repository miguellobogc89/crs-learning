"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { getOverview } from "@/lib/trading/service";
import { api, errorText } from "./format";
import { useTradingRefresh } from "./navigation";
import { MarketPanel } from "./market-panel";
import { LibraryPanel } from "./library-panel";
import { RulesPanel, UniversePanel } from "./portfolio-panel";
import { CarteraPanel } from "./cartera-panel";
import { AgentsPanel } from "./agents-panel";
import { NewsPanel } from "./news-panel";
import { FaroPanel } from "./faro-panel";
import { HomePanel } from "./home-panel";
import { IntegrationsPanel } from "./integrations-panel";
import { isFittedTab, type TradingTab } from "./tabs";
import { LoadingCard } from "./ui";

export type Overview = Awaited<ReturnType<typeof getOverview>> & { canManage: boolean };

/** Paneles que necesitan el análisis completo del mercado. */
const NEEDS_OVERVIEW: TradingTab[] = ["mercado"];

export function TradingWorkspace({ tab }: { tab: TradingTab }) {
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
  else if (tab === "oportunidades") body = <FaroPanel />;
  else if (tab === "noticias") body = <NewsPanel />;
  else if (tab === "cartera") body = <CarteraPanel />;
  else if (tab === "agentes") body = <AgentsPanel />;
  else if (tab === "patrones") body = <LibraryPanel />;
  else if (tab === "reglas") body = <RulesPanel />;
  else if (tab === "valores") body = <UniversePanel />;
  else if (tab === "integraciones") body = <IntegrationsPanel />;

  const fittedTable = isFittedTab(tab);
  return (
    <div className={fittedTable ? "flex h-full min-h-0 flex-col gap-4" : "space-y-4"}>
      {error && (
        <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {fittedTable ? <div className="min-h-0 flex-1">{body}</div> : body}
    </div>
  );
}
