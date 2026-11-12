"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api, errorText } from "./format";
import { useTradingRefresh } from "./navigation";
import { UniversePanel } from "./portfolio-panel";
import { MarketPanel } from "./market-panel";
import { NewsPanel } from "./news-panel";
import { LibraryPanel } from "./library-panel";
import { ErrorNote, LoadingCard } from "./ui";
import type { Overview } from "./trading-workspace";

type MarketTab = "valores" | "noticias" | "aprende";
const TABS: { key: MarketTab; label: string }[] = [
  { key: "valores", label: "Valores" },
  { key: "noticias", label: "Noticias" },
  { key: "aprende", label: "Aprende" },
];

export function MarketsPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab");
  const active: MarketTab = TABS.some((t) => t.key === requested) ? (requested as MarketTab) : "valores";
  const symbol = active === "valores" ? params.get("symbol") : null;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El análisis completo solo se consulta al abrir el gráfico. Noticias y Aprende no dependen de él.
  const loadOverview = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      setOverview(await api<Overview>("overview"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [symbol]);
  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  useTradingRefresh(loadOverview);

  const openChart = (selected: string) => {
    router.push(`/trading/mercados?tab=valores&symbol=${encodeURIComponent(selected)}`);
  };
  const backToValues = () => router.push("/trading/mercados?tab=valores");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <nav
        aria-label="Vistas de Mercados"
        className="shrink-0 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max min-w-full gap-6">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/trading/mercados?tab=${t.key}`}
              aria-current={active === t.key ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 px-2 pb-3 pt-1 text-sm font-semibold transition-colors ${
                active === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
        {active === "noticias" ? (
          <NewsPanel />
        ) : active === "aprende" ? (
          <LibraryPanel />
        ) : symbol ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={backToValues}
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"
            >
              <ArrowLeft className="h-4 w-4" /> Volver a valores
            </button>
            {error && <ErrorNote>{error}</ErrorNote>}
            {loading && !overview ? (
              <LoadingCard />
            ) : overview && overview.instrumentsWithData === 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-600">
                Aún no hay cotizaciones guardadas para mostrar gráficos y figuras.
              </div>
            ) : overview ? (
              <MarketPanel data={overview} symbol={symbol} onSymbol={openChart} />
            ) : !error ? (
              <LoadingCard />
            ) : null}
          </div>
        ) : (
          <UniversePanel onSelect={openChart} />
        )}
      </div>
    </div>
  );
}
