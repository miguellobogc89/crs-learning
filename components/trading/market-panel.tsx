"use client";
import { useEffect, useMemo, useState } from "react";
import { Info, Loader2, Search, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { ChartDetection, getInstrument } from "@/lib/trading/service";
import type { Overview } from "./trading-workspace";
import { CandleChart, type ChartLevel } from "./candle-chart";
import { PATTERN_SHORT, STATUS_LABEL, api, dayFmt, errorText, eur, field, ghost, int, num, panel, pct, primary, th, tone } from "./format";
import { ConfirmOrderModal, TradeInfoModal, ideaFromRecommendation } from "./trade-modals";
import { Rich } from "./ui";
import { useTradingRefresh } from "./navigation";
import { NewsItem } from "./news-panel";

type Instrument = Awaited<ReturnType<typeof getInstrument>>;

const TREND_ICON = {
  up: <TrendingUp className="h-4 w-4 text-emerald-600" aria-label="Tendencia alcista" />,
  down: <TrendingDown className="h-4 w-4 text-red-600" aria-label="Tendencia bajista" />,
  flat: <Minus className="h-4 w-4 text-slate-400" aria-label="Sin tendencia" />,
};

const STATUS_TONE: Record<string, string> = {
  forming: "text-slate-700",
  confirmed: "text-blue-700",
  invalidated: "text-slate-400",
  expired: "text-slate-400",
};

export function MarketPanel({
  data,
  symbol,
  onSymbol,
}: {
  data: Overview;
  symbol: string | null;
  onSymbol: (s: string) => void;
}) {
  const [q, setQ] = useState("");
  const [inst, setInst] = useState<Instrument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number>(0);
  const [confirm, setConfirm] = useState(false);
  const [info, setInfo] = useState(false);
  const [reload, setReload] = useState(0);
  useTradingRefresh(() => setReload((n) => n + 1));
  const current = symbol ?? data.market.find((m) => !m.isIndex)?.symbol ?? data.market[0]?.symbol ?? null;

  useEffect(() => {
    if (!current) return;
    let alive = true;
    setLoading(true);
    setError(null);
    api<Instrument>(`instrument?symbol=${encodeURIComponent(current)}`)
      .then((r) => {
        if (!alive) return;
        setInst(r);
        // Por defecto, la figura más reciente que siga viva.
        const k = r.detections.findIndex((d) => d.status === "forming" || d.status === "confirmed");
        setSelected(Math.max(0, k));
      })
      .catch((e) => alive && setError(errorText(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [current, reload]);

  const currentMarket = data.market.find((m) => m.symbol === current)?.market ?? "bolsa";
  const [listMarket, setListMarket] = useState<"bolsa" | "crypto">(currentMarket);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.market.filter(
      (m) => (s ? true : m.market === listMarket) && (!s || m.name.toLowerCase().includes(s) || m.symbol.toLowerCase().includes(s)),
    );
  }, [data.market, q, listMarket]);

  const det: ChartDetection | null = inst?.detections[selected] ?? null;
  const lastClose = inst?.candles[inst.candles.length - 1]?.c ?? null;
  const openPos = inst?.positions.filter((p) => p.status === "abierta" || p.status === "pendiente") ?? [];

  const levels: ChartLevel[] = [];
  if (openPos[0]) {
    const p = openPos[0];
    levels.push({ price: p.entryPrice ?? p.plannedEntry, label: "Tu entrada", kind: "entry" });
    levels.push({ price: p.stop, label: "Tu stop", kind: "stop" });
    levels.push({ price: p.target, label: "Tu objetivo", kind: "target" });
  } else if (det && (det.status === "forming" || det.status === "confirmed")) {
    levels.push({ price: det.entry, label: det.status === "forming" ? "Entrada si rompe" : "Entrada", kind: "entry" });
    levels.push({ price: det.stop, label: "Stop", kind: "stop" });
    levels.push({ price: det.target, label: "Objetivo", kind: "target" });
  }

  const names = useMemo(() => Object.fromEntries(data.market.map((m) => [m.symbol, m.name])), [data.market]);
  const rec = data.recommendations.find((r) => r.symbol === current && det && r.pattern === det.pattern);

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <aside className={`${panel} flex max-h-[860px] flex-col`}>
        <div className="space-y-2 border-b border-slate-200 p-2">
          <div className="grid grid-cols-2 border border-slate-200">
            {(["bolsa", "crypto"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setListMarket(m)}
                className={`py-1.5 text-sm ${listMarket === m ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
              >
                {m === "bolsa" ? "Bolsa" : "Crypto"}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input className={`${field} w-full pl-8`} placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className={th}>Valor</th>
                <th className={`${th} text-right`}>Cierre</th>
                <th className={`${th} text-right`}>Día</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr
                  key={m.symbol}
                  onClick={() => onSymbol(m.symbol)}
                  className={`cursor-pointer border-t border-slate-100 ${m.symbol === current ? "bg-blue-50/70" : "hover:bg-slate-50"}`}
                >
                  <td className="px-3 py-2">
                    <div className={`font-medium ${m.isIndex ? "text-slate-900" : "text-slate-800"}`}>{m.name}</div>
                    <div className="text-xs text-slate-500">
                      {m.symbol}
                      {m.signals > 0 && <span className="ml-1.5 bg-blue-600 px-1 text-[10px] font-semibold text-white">{m.signals}</span>}
                      {m.lastError && <span className="ml-1.5 text-red-600" title={m.lastError}>sin datos</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.close !== null ? num(m.close, m.close < 20 ? 3 : 2) : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${tone(m.change1d)}`}>{pct(m.change1d, 2)}</td>
                  <td className="px-2 py-2">{TREND_ICON[m.trend]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        {error && <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <section className={panel}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {inst?.name ?? current} <span className="text-sm font-normal text-slate-500">{inst?.symbol}</span>
              </h2>
              <p className="text-xs text-slate-500">
                {inst?.sector ?? ""} {lastClose !== null && `· último cierre ${eur(lastClose)}`}
              </p>
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </header>
          {inst ? (
            <CandleChart
              key={inst.symbol}
              candles={inst.candles}
              sma50={inst.sma50}
              sma200={inst.sma200}
              overlay={det ? { points: det.points, lines: det.lines, direction: det.direction, confirmDay: det.confirmDay } : null}
              levels={levels}
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          )}
        </section>

        {inst && inst.news.length > 0 && (
          <section className={panel}>
            <header className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Noticias recientes de {inst.name}</h3>
            </header>
            <ul className="divide-y divide-slate-100">
              {inst.news.map((n) => (
                <NewsItem key={n.id} n={n} names={names} />
              ))}
            </ul>
          </section>
        )}

        {inst && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <section className={panel}>
              <header className="border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Figuras detectadas</h3>
                <p className="text-xs text-slate-500">Pulsa una para dibujarla en el gráfico.</p>
              </header>
              {inst.detections.length === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-500">Ninguna figura reciente en este valor.</p>
              ) : (
                <ul className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto">
                  {inst.detections.map((d, k) => (
                    <li key={`${d.pattern}-${d.startDay}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(k)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${k === selected ? "bg-blue-50/70" : "hover:bg-slate-50"}`}
                      >
                        <span>
                          <span className="font-medium text-slate-900">{PATTERN_SHORT[d.pattern]}</span>
                          <span className={`ml-2 text-xs ${STATUS_TONE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                          <span className="block text-xs text-slate-500">
                            {dayFmt(d.startDay)} → {dayFmt(d.confirmDay ?? d.formedDay)}
                          </span>
                        </span>
                        <span className="text-right text-xs tabular-nums text-slate-600">
                          calidad {Math.round(d.quality)}
                          <span className="block">B/R {num(d.rr, 1)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={panel}>
              <header className="border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">{det ? PATTERN_SHORT[det.pattern] : "Detalle"}</h3>
                {det && <p className="text-xs text-slate-500">{STATUS_LABEL[det.status]}</p>}
              </header>
              {det ? (
                <div className="space-y-3 px-4 py-4 text-sm">
                  <dl className="grid grid-cols-3 gap-px border border-slate-200 bg-slate-200 text-center">
                    <div className="bg-white px-2 py-2">
                      <dt className="text-xs text-slate-500">{det.status === "forming" ? "Entrada si rompe" : "Entrada"}</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{eur(det.entry)}</dd>
                    </div>
                    <div className="bg-white px-2 py-2">
                      <dt className="text-xs text-slate-500">Stop</dt>
                      <dd className="font-semibold tabular-nums text-red-700">{eur(det.stop)}</dd>
                    </div>
                    <div className="bg-white px-2 py-2">
                      <dt className="text-xs text-slate-500">Objetivo</dt>
                      <dd className="font-semibold tabular-nums text-emerald-700">{eur(det.target)}</dd>
                    </div>
                  </dl>
                  {det.notes.length > 0 && (
                    <ul className="space-y-1 text-slate-700">
                      {det.notes.map((n) => (
                        <li key={n}>· {n}</li>
                      ))}
                      {det.volumeConfirmed && <li>· Ruptura con volumen alto</li>}
                    </ul>
                  )}
                  {inst.stats[det.pattern] && (
                    <p className="text-xs text-slate-500">
                      Esta figura en {inst.name}: {inst.stats[det.pattern]!.trades} operaciones históricas,{" "}
                      {num(inst.stats[det.pattern]!.winRate * 100, 0)} % de acierto, {num(inst.stats[det.pattern]!.avgR, 2)} R de media.
                    </p>
                  )}
                  {rec && (
                    <p className="border-l-2 border-blue-500 bg-blue-50/50 px-3 py-2 text-slate-700">
                      <Rich text={rec.plan} />
                    </p>
                  )}
                  {rec && (
                    <div className="flex gap-2">
                      <button type="button" className={ghost} onClick={() => setInfo(true)}>
                        <Info className="h-4 w-4" /> Más info
                      </button>
                      {(rec.action === "comprar" || rec.action === "vender_corto" || rec.action === "vigilar") && rec.sizing?.quantity ? (
                        <button type="button" className={primary} onClick={() => setConfirm(true)}>
                          Ejecutar orden
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : (
                <p className="px-4 py-5 text-sm text-slate-500">Elige una figura.</p>
              )}
              {openPos.length > 0 && (
                <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-700">
                  Tienes {openPos.length === 1 ? "una posición" : `${openPos.length} posiciones`} en este valor (
                  {openPos.map((p) => `${int(p.quantity)} ${p.status}`).join(", ")}).
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {info && rec && (
        <TradeInfoModal
          idea={ideaFromRecommendation(rec)}
          onClose={() => setInfo(false)}
          onExecute={
            rec.sizing?.quantity && (rec.action === "comprar" || rec.action === "vender_corto" || rec.action === "vigilar")
              ? () => {
                  setInfo(false);
                  setConfirm(true);
                }
              : undefined
          }
        />
      )}
      {confirm && rec && (
        <ConfirmOrderModal
          idea={{ ...ideaFromRecommendation(rec), action: rec.action === "vigilar" ? "comprar" : rec.action }}
          cash={data.account.cash}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
