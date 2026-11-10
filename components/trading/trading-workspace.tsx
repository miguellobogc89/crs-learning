"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import type { getOverview } from "@/lib/trading/service";
import { api, errorText, eur0, ghost, pct, tone, dayFmt } from "./format";
import { RecommendationsPanel } from "./recommendations-panel";
import { MarketPanel } from "./market-panel";
import { LibraryPanel } from "./library-panel";
import { PortfolioPanel } from "./portfolio-panel";

export type Overview = Awaited<ReturnType<typeof getOverview>> & { canManage: boolean };

const TABS = [
  { key: "signals", label: "Qué hacer hoy" },
  { key: "market", label: "Mercado y gráficos" },
  { key: "portfolio", label: "Cartera virtual" },
  { key: "library", label: "Biblioteca de patrones" },
] as const;
type Tab = (typeof TABS)[number]["key"];

type SyncResult = {
  market: { updated: number; failed: { symbol: string; error: string }[]; pending: number; candles: number };
  backtest: { asOf: string; trades: number } | null;
  accounts: { processed: number; filled: number; closed: number; cancelled: number; autoOpened: number };
  pending: boolean;
};

const REGIME_TONE = {
  alcista: "bg-emerald-50 text-emerald-800 border-emerald-200",
  bajista: "bg-red-50 text-red-700 border-red-200",
  lateral: "bg-slate-50 text-slate-700 border-slate-200",
} as const;

export function TradingWorkspace() {
  const [tab, setTab] = useState<Tab>("signals");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const autoSynced = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api<Overview>("overview"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Varias pasadas hasta tener todo el histórico (la primera carga baja 6 años de 36 valores).
  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg("Descargando cotizaciones…");
    try {
      let updated = 0;
      const failed = new Map<string, string>();
      let last: SyncResult | null = null;
      for (let round = 0; round < 12; round++) {
        last = await api<SyncResult>("sync", {});
        updated += last.market.updated;
        for (const f of last.market.failed) failed.set(f.symbol, f.error);
        if (!last.pending) break;
        setSyncMsg(`Descargando cotizaciones… ${updated} valores actualizados, quedan ${last.market.pending}`);
      }
      const parts = [`${updated} valores actualizados`];
      if (last?.backtest) parts.push(`backtest recalculado (${last.backtest.trades} operaciones históricas)`);
      if (last?.accounts.filled) parts.push(`${last.accounts.filled} órdenes ejecutadas`);
      if (last?.accounts.closed) parts.push(`${last.accounts.closed} posiciones cerradas`);
      if (last?.accounts.autoOpened) parts.push(`${last.accounts.autoOpened} órdenes nuevas del modo automático`);
      if (failed.size) parts.push(`sin datos de ${[...failed.keys()].join(", ")}`);
      setSyncMsg(parts.join(" · "));
      await load();
    } catch (e) {
      setSyncMsg(errorText(e));
    } finally {
      setSyncing(false);
    }
  }, [load]);

  // Primera visita sin datos: si puede, arranca la descarga sola.
  useEffect(() => {
    if (!data || autoSynced.current) return;
    if (data.instrumentsWithData === 0 && data.canManage) {
      autoSynced.current = true;
      void sync();
    }
  }, [data, sync]);

  const openChart = (s: string) => {
    setSymbol(s);
    setTab("market");
  };

  const a = data?.account;
  return (
    <div className="space-y-4">
      <div className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Mercado (IBEX 35)">
          {data ? (
            <span className={`inline-block border px-2 py-0.5 text-sm font-semibold capitalize ${REGIME_TONE[data.regime]}`}>
              {data.regime}
            </span>
          ) : (
            "—"
          )}
        </Kpi>
        <Kpi label="Patrimonio virtual">
          <span className="text-lg font-semibold text-slate-900">{eur0(a?.equity)}</span>
          <span className={`ml-2 text-sm ${tone(a?.returnPct)}`}>{pct(a?.returnPct)}</span>
        </Kpi>
        <Kpi label="Efectivo disponible">
          <span className="text-lg font-semibold text-slate-900">{eur0(a?.cash)}</span>
        </Kpi>
        <Kpi label="Señales accionables">
          <span className="text-lg font-semibold text-slate-900">
            {data ? data.recommendations.filter((r) => r.strong && r.action !== "vigilar").length : "—"}
          </span>
          <span className="ml-2 text-sm text-slate-500">
            {data ? `${data.recommendations.filter((r) => r.action === "vigilar").length} en vigilancia` : ""}
          </span>
        </Kpi>
        <Kpi label="Datos al cierre de">
          <span className="text-sm font-medium text-slate-900">{dayFmt(data?.asOf)}</span>
          <span className="ml-2 text-xs text-slate-500">
            {data ? `${data.instrumentsWithData}/${data.instruments} valores` : ""}
          </span>
        </Kpi>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium ${
                tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {data?.canManage && (
          <button type="button" className={`${ghost} mb-1.5`} onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? "Actualizando…" : "Actualizar cotizaciones"}
          </button>
        )}
      </div>

      {syncMsg && (
        <p role="status" className="border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {syncMsg}
        </p>
      )}
      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading && !data ? (
        <div className="flex h-48 items-center justify-center border border-slate-200 bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : data && data.instrumentsWithData === 0 ? (
        <div className="border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Aún no hay cotizaciones guardadas.{" "}
          {data.canManage
            ? "Se está haciendo la primera descarga (6 años de histórico del IBEX 35); tarda uno o dos minutos."
            : "Pide a un administrador del espacio que pulse «Actualizar cotizaciones»."}
        </div>
      ) : data ? (
        <>
          {tab === "signals" && <RecommendationsPanel data={data} onChanged={load} onOpenChart={openChart} />}
          {tab === "market" && <MarketPanel data={data} symbol={symbol} onSymbol={setSymbol} onChanged={load} />}
          {tab === "portfolio" && <PortfolioPanel canManage={data.canManage} onChanged={load} onOpenChart={openChart} />}
          {tab === "library" && <LibraryPanel />}
        </>
      ) : null}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Herramienta de análisis y simulación con dinero ficticio. Las figuras chartistas no garantizan resultados y el
        historial pasado no asegura rentabilidades futuras. Cotizaciones de fin de día de un proveedor público, sin
        garantía de exactitud. No es asesoramiento financiero.
      </p>
    </div>
  );
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline">{children}</div>
    </div>
  );
}
