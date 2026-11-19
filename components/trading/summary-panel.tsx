"use client";
// Resumen (primera pestaña de Inicio, 17/11/2026): para verlo en un segundo, por ejemplo en el metro.
// Si todo funciona, tu dinero, el mercado en cuatro datos, cómo va cada familia de agentes y lo que gasta
// la IA. Los indicadores detallados (lo que antes era Panorama) quedan en un desplegable al final.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Bot, ChevronDown, Cpu, Gauge, Wallet } from "lucide-react";
import type { getSummary } from "@/lib/trading/summary";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import type { manualView } from "@/lib/trading/manual/service";
import type { mirrorView } from "@/lib/trading/mirror/service";
import Link from "next/link";
import { api, card, eur, errorText, flat } from "./format";
import { useTradingRefresh, useWarmStart } from "./navigation";
import { AGENT_DOT, ErrorNote, LoadingCard, ReturnPill } from "./ui";
import { PulsePanel } from "./pulse-panel";
import { AssetIcon } from "./asset-icon";

type Summary = Awaited<ReturnType<typeof getSummary>>;
type Virtual = Awaited<ReturnType<typeof getPortfolio>>;
type Manual = Awaited<ReturnType<typeof manualView>>;
type Mirrors = Awaited<ReturnType<typeof mirrorView>>;
type Mode = "real" | "virtual";
type Recent = { id: string; symbol: string; source: string; at: string; status: string; result: number | null };
const displayDate = (at: string) => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(at));

/** Abre el panel de notificaciones (lo escucha la estructura de Trading). */
export const openNotifications = () => window.dispatchEvent(new Event("trading:notifications"));

const nf = (v: number, d = 0) => v.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d });
const compact = (v: number) => (v >= 1_000_000 ? `${nf(v / 1_000_000, 1)} M` : v >= 1000 ? `${nf(v / 1000, 0)} k` : nf(v));
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${nf(v, 1)} %`;

function Section({ title, icon: Icon, right, children }: { title: string; icon: typeof Gauge; right?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${card} ${flat} px-4 py-4 sm:px-5`}>
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-slate-900">
        <Icon className="h-4 w-4 text-slate-400" /> {title}
        {right && <span className="ml-auto text-xs font-normal text-slate-400">{right}</span>}
      </h2>
      {children}
    </section>
  );
}

export function SummaryPanel({ tabs }: { tabs: ReactNode }) {
  const [data, setData] = useState<Summary | null>(null);
  useWarmStart<Summary>("summary", setData);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [mode, setMode] = useState<Mode>("real");
  const [virtual, setVirtual] = useState<Virtual | null>(null);
  const [manual, setManual] = useState<Manual | null>(null);
  const [mirrors, setMirrors] = useState<Mirrors | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Summary>("summary"));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);
  useEffect(() => {
    let live = true;
    const fetchMode = async () => {
      if (mode === "virtual") {
        const result = await api<Virtual>("portfolio").catch(() => null);
        if (live) setVirtual(result);
      } else {
        const [m, r] = await Promise.all([api<Manual>("manual").catch(() => null), api<Mirrors>("mirror").catch(() => null)]);
        if (live) { setManual(m); setMirrors(r); }
      }
    };
    void fetchMode();
    return () => { live = false; };
  }, [mode]);

  const recent: Recent[] = mode === "virtual"
    ? [
        ...(virtual?.main.positions ?? []).map(p => ({ id: `main:${p.id}`, symbol: p.symbol, source: "Manual virtual", at: p.createdAt, status: p.status, result: p.status === "cerrada" ? p.pnl : p.unrealized })),
        ...(virtual?.copies ?? []).flatMap(copy => [...copy.positions, ...copy.closed].map(p => ({ id: `copy:${copy.agent}:${p.id}`, symbol: p.symbol, source: copy.name, at: p.createdAt, status: p.status, result: p.status === "cerrada" ? p.pnl : p.unrealized }))),
      ]
    : [
        ...(manual?.trades ?? []).map(t => ({ id: `manual:${t.id}`, symbol: t.symbol, source: "Manual", at: t.closedAt ?? t.openedAt ?? "", status: t.status, result: t.result })),
        ...(mirrors?.mirrors ?? []).flatMap(m => m.legs.filter(l => l.mode === "real").map(l => ({ id: `mirror:${l.id}`, symbol: l.symbol, source: m.name, at: l.closedAt ?? l.openedAt ?? "", status: l.status, result: l.result }))),
      ];
  recent.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-4 pb-6 lg:h-full lg:overflow-y-auto lg:pr-1">
      <div className="flex flex-wrap items-center justify-between gap-3">{tabs}</div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data ? (
        !error && <LoadingCard height="h-96" />
      ) : (
        <>
          {data.health?.problems ? (
            <button type="button" onClick={openNotifications} className="flex w-full items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-left text-red-800">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <b className="block text-sm font-semibold">{data.health.problems} {data.health.problems === 1 ? "problema" : "problemas"}</b>
                <span className="block truncate text-xs opacity-80">{data.health.latest.join(" · ")}</span>
              </span>
            </button>
          ) : null}

          <section className={`${card} ${flat} px-4 py-4 sm:px-5`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Wallet className="h-3.5 w-3.5" /> Tu dinero {mode === "real" ? "real" : "virtual"}
              </div>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold" aria-label="Tipo de cartera">
                {(["real", "virtual"] as const).map(value => (
                  <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value}
                    className={`rounded-md px-3 py-1.5 transition-colors ${mode === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                    {value === "real" ? "Real" : "Virtual"}
                  </button>
                ))}
              </div>
            </div>
            {mode === "real" ? data.balance ? (
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <span className="text-4xl font-bold tracking-tight tabular-nums text-slate-900">{eur(data.balance.total, 2)}</span>
                {data.balance.ch24h !== null && <span className="mb-0.5"><ReturnPill value={data.balance.ch24h} big /></span>}
              </div>
            ) : <p className="mt-2 text-sm text-slate-500">Conecta un exchange en Conexiones para verlo aquí.</p>
            : virtual ? (
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <span className="text-4xl font-bold tracking-tight tabular-nums text-slate-900">{eur(virtual.total.equity, 2)}</span>
                {virtual.total.dailyChangePct !== null && (
                  <span className="mb-0.5"><ReturnPill value={virtual.total.dailyChangePct} big /></span>
                )}
              </div>
            ) : <p className="mt-2 text-sm text-slate-500">Cargando cartera virtual…</p>}
            <div className="mt-5 border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Actividad reciente</h3>
                <Link href="/trading/cartera" className="text-xs font-semibold text-blue-600 hover:underline">Ver mi cartera</Link>
              </div>
              {recent.length ? (
                <ul className="divide-y divide-slate-100">
                  {recent.slice(0, 3).map(item => (
                    <li key={item.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <AssetIcon symbol={item.symbol} size="md" />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate font-semibold text-slate-900">{item.symbol}</b>
                        <span className="block truncate text-xs text-slate-500">{item.source} · {item.status}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block text-sm font-semibold tabular-nums ${item.result === null ? "text-slate-400" : item.result >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {item.result === null ? "—" : `${item.result > 0 ? "+" : ""}${eur(item.result, 2)}`}
                        </span>
                        <span className="block text-[11px] text-slate-400">{item.at ? displayDate(item.at) : "—"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-slate-500">No hay operaciones registradas en esta cartera.</p>}
            </div>
          </section>


          <div className="grid gap-4 lg:grid-cols-2">
            {/* Familias de agentes (solo los que han operado) */}
            <Section title="Agentes" icon={Bot} right="solo los que han operado">
              {data.groups.length === 0 ? (
                <p className="text-sm text-slate-500">Ningún agente ha operado todavía.</p>
              ) : (
                <ul className="space-y-3">
                  {data.groups.map((g) => (
                    <li key={g.key}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-800">{g.label}</span>
                        <span className={`text-xl font-bold tabular-nums ${g.returnPct > 0.05 ? "text-emerald-600" : g.returnPct < -0.05 ? "text-red-600" : "text-slate-500"}`}>
                          {signedPct(g.returnPct)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {g.agents.map((a) => (
                          <span key={a.key} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                            <span className={`h-2 w-2 rounded-full ${AGENT_DOT[a.color] ?? AGENT_DOT.slate}`} />
                            {a.name}
                            <b className={`font-semibold tabular-nums ${a.returnPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>{signedPct(a.returnPct)}</b>
                          </span>
                        ))}
                        {g.idle > 0 && <span className="px-1 py-0.5 text-[11px] text-slate-400">+{g.idle} sin operar</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Lo que gasta la IA */}
            {data.ai && (
              <Section title="Consumo de IA" icon={Cpu} right={data.ai.month.costEur !== null ? `≈ ${eur(data.ai.month.costEur, 2)} en 30 días` : undefined}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <span className="text-3xl font-bold tabular-nums text-slate-900">{data.ai.today.calls}</span>
                    <span className="ml-1 text-sm text-slate-500">llamadas hoy</span>
                  </div>
                  <span className="text-xs tabular-nums text-slate-400">tope {data.ai.limit}</span>
                </div>
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={`block h-full rounded-full ${data.ai.today.calls / data.ai.limit > 0.8 ? "bg-red-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(100, (data.ai.today.calls / data.ai.limit) * 100)}%` }}
                  />
                </span>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Hoy", data.ai.today.tokens, data.ai.today.costEur],
                    ["7 días", data.ai.week.tokens, data.ai.week.costEur],
                    ["30 días", data.ai.month.tokens, data.ai.month.costEur],
                  ].map(([label, tokens, cost]) => (
                    <div key={label as string} className="rounded-xl bg-slate-50 px-2 py-2">
                      <span className="block text-[11px] text-slate-500">{label as string}</span>
                      <b className="block text-sm font-semibold tabular-nums text-slate-900">{compact(tokens as number)}</b>
                      <span className="block text-[11px] text-slate-400">{cost !== null ? `≈ ${eur(cost as number, 2)}` : "tokens"}</span>
                    </div>
                  ))}
                </div>
                {data.ai.days.length > 1 && (
                  <div className="mt-3 flex h-10 items-end gap-1" aria-label="Llamadas por día (últimos 14)">
                    {data.ai.days.map((d) => {
                      const max = Math.max(...data.ai!.days.map((x) => x.calls), 1);
                      return <span key={d.day} title={`${d.day}: ${d.calls} llamadas`} className="flex-1 rounded-t bg-blue-200" style={{ height: `${Math.max(6, (d.calls / max) * 100)}%` }} />;
                    })}
                  </div>
                )}
              </Section>
            )}
          </div>

          {/* Lo que antes era Panorama */}
          <section className={`${card} ${flat}`}>
            <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-sm font-semibold text-slate-700 sm:px-5">
              Más indicadores del mercado
              <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition-transform duration-300 ${more ? "rotate-180" : ""}`} />
            </button>
            {more && (
              <div className="border-t border-slate-100 px-2 pt-4 sm:px-4">
                <PulsePanel tabs={null} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
