"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bot, Gauge, Shield, Swords } from "lucide-react";
import type { getSummary } from "@/lib/trading/summary";
import { api, eur, errorText } from "./format";
import { useTradingRefresh, useWarmStart } from "./navigation";
import { ErrorNote, LoadingCard } from "./ui";
type Summary = Awaited<ReturnType<typeof getSummary>>;
const nf = (v: number, d = 0) => v.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d });
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${nf(v, 1)} %`;
function fgTone(v: number) {
  if (v < 25) return { bar: "bg-red-500", text: "text-red-600" };
  if (v < 45) return { bar: "bg-orange-500", text: "text-orange-600" };
  if (v <= 55) return { bar: "bg-slate-400", text: "text-slate-600" };
  if (v <= 75) return { bar: "bg-emerald-500", text: "text-emerald-600" };
  return { bar: "bg-emerald-600", text: "text-emerald-700" };
}
const FG_LABEL: Record<string, string> = {
  "Extreme Fear": "Miedo extremo",
  Fear: "Miedo",
  Neutral: "Neutral",
  Greed: "Codicia",
  "Extreme Greed": "Codicia extrema",
};

function Tile({ label, icon: Icon, children }: { label: string; icon: typeof Gauge; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}


export function MarketOverviewPanel({ tabs }: { tabs: ReactNode }) {
 const [data,setData]=useState<Summary|null>(null);
 useWarmStart<Summary>("summary",setData);
 const [error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{try{setData(await api<Summary>("summary"));setError(null)}catch(e){setError(errorText(e))}},[]);
 useEffect(()=>{void load()},[load]);
 useTradingRefresh(load);
 return <div className="space-y-4 pb-6 lg:h-full lg:overflow-y-auto lg:pr-1">
  <div className="flex flex-wrap items-center justify-between gap-3">{tabs}</div>
  {error && <ErrorNote>{error}</ErrorNote>}
  {!data ? (!error && <LoadingCard height="h-96"/>) : <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {data.market && (
              <>
                <Tile label="Miedo y codicia" icon={Gauge}>
                  {data.market.fearGreed ? (
                    <>
                      <span className={`text-2xl font-bold tabular-nums ${fgTone(data.market.fearGreed.value).text}`}>{data.market.fearGreed.value}</span>
                      <span className="ml-1.5 text-xs text-slate-500">{FG_LABEL[data.market.fearGreed.label] ?? data.market.fearGreed.label}</span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <span className={`block h-full rounded-full ${fgTone(data.market.fearGreed.value).bar}`} style={{ width: `${data.market.fearGreed.value}%` }} />
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Tile>
                <Tile label="Bitcoin" icon={Bot}>
                  {data.market.btc ? (
                    <>
                      <span className="block text-lg font-bold tabular-nums text-slate-900">{eur(data.market.btc.price, 0)}</span>
                      {data.market.btc.ch24h !== null && (
                        <span className={`text-xs font-semibold tabular-nums ${data.market.btc.ch24h >= 0 ? "text-emerald-600" : "text-red-600"}`}>{signedPct(data.market.btc.ch24h)} en 24 h</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Tile>
                <Tile label="Mercado" icon={data.market.phase?.mode === "ataque" ? Swords : Shield}>
                  {data.market.phase ? (
                    <>
                      <span className={`block text-lg font-bold ${data.market.phase.mode === "ataque" ? "text-emerald-600" : "text-red-600"}`}>
                        {data.market.phase.mode === "ataque" ? "Ataque" : "Defensa"}
                      </span>
                      <span className="text-xs text-slate-500">desde hace {data.market.phase.days} {data.market.phase.days === 1 ? "día" : "días"}</span>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Tile>
                <Tile label="Peso de Bitcoin" icon={Gauge}>
                  {data.market.btcDominance !== null ? (
                    <>
                      <span className="block text-lg font-bold tabular-nums text-slate-900">{nf(data.market.btcDominance, 1)} %</span>
                      <span className="text-xs text-slate-500">del mercado cripto</span>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Tile>
              </>
            )}
  </div>}
 </div>;
}
