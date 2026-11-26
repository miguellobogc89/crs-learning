"use client";
// Resumen (primera pestaña de Inicio): ¿cómo va mi dinero? Con dinero real, las mismas cifras que Mi cartera,
// la rentabilidad sin contar ingresos (día, semana, mes, todo), lo que hay abierto y las últimas operaciones.
// Los indicadores detallados del mercado quedan en un desplegable al final.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, ChevronDown, Gauge, History, Layers, TrendingUp, Wallet } from "lucide-react";
import type { getSummary } from "@/lib/trading/summary";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import type { manualView } from "@/lib/trading/manual/service";
import type { mirrorView } from "@/lib/trading/mirror/service";
import Link from "next/link";
import { api, card, eur, errorText, flat } from "./format";
import { useTradingRefresh, useWarmStart } from "./navigation";
import { ErrorNote, LoadingCard, ReturnPill } from "./ui";
import { PulsePanel } from "./pulse-panel";
import { AssetIcon } from "./asset-icon";
import { EquityChart } from "./equity-chart";
import { pnlSeries, realFigures, type PnlView, type Wallets } from "./real-figures";

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
const signedEur = (v: number) => `${v >= 0 ? "+" : ""}${eur(v, 2)}`;
const tone = (v: number) => (v > 0.005 ? "text-emerald-600" : v < -0.005 ? "text-red-600" : "text-slate-500");
const PERIODS = [
  { key: "dia", label: "Día", ms: 86_400_000 },
  { key: "semana", label: "Semana", ms: 7 * 86_400_000 },
  { key: "mes", label: "Mes", ms: 30 * 86_400_000 },
  { key: "todo", label: "Todo", ms: 0 },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];
const STATUS: Record<string, string> = { abierta: "abierta", cerrada: "cerrada", abriendo: "abriendo", vendiendo: "cerrando" };

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

function RecentList({ items, bare = false }: { items: Recent[]; bare?: boolean }) {
  const list = items.slice(0, bare ? 6 : 3);
  return (
    <div className={bare ? "" : "mt-5 border-t border-slate-100 pt-3"}>
      {!bare && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Actividad reciente</h3>
          <Link href="/trading/cartera" className="text-xs font-semibold text-blue-600 hover:underline">Ver mi cartera</Link>
        </div>
      )}
      {list.length ? (
        <ul className="divide-y divide-slate-100">
          {list.map(item => (
            <li key={item.id} className="flex items-center gap-3 py-2.5 text-sm">
              <AssetIcon symbol={item.symbol} size="md" />
              <span className="min-w-0 flex-1">
                <b className="block truncate font-semibold text-slate-900">{item.symbol.replace(/-EUR$/, "")}</b>
                <span className="block truncate text-xs text-slate-500">{item.source} · {STATUS[item.status] ?? item.status}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block text-sm font-semibold tabular-nums ${item.result === null ? "text-slate-400" : tone(item.result)}`}>
                  {item.result === null ? "—" : signedEur(item.result)}
                </span>
                <span className="block text-[11px] text-slate-400">{item.at ? displayDate(item.at) : "—"}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-slate-500">No hay operaciones registradas en esta cartera.</p>}
    </div>
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
  const [wallets, setWallets] = useState<Wallets | null>(null);
  const [pnl, setPnl] = useState<PnlView | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("semana");
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
        const [m, r, w, p] = await Promise.all([
          api<Manual>("manual").catch(() => null),
          api<Mirrors>("mirror").catch(() => null),
          api<Wallets>("wallets").catch(() => null),
          api<PnlView>("pnl").catch(() => null),
        ]);
        if (live) { setManual(m); setMirrors(r); setWallets(w); setPnl(p); }
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
        ...(manual?.trades ?? []).filter(t => STATUS[t.status]).map(t => ({ id: `manual:${t.id}`, symbol: t.symbol, source: "Manual", at: t.closedAt ?? t.openedAt ?? "", status: t.status, result: t.result })),
        ...(mirrors?.mirrors ?? []).flatMap(m => m.legs.filter(l => l.mode === "real" && STATUS[l.status]).map(l => ({ id: `mirror:${l.id}`, symbol: l.symbol, source: m.name, at: l.closedAt ?? l.openedAt ?? "", status: l.status, result: l.result }))),
      ];
  recent.sort((a, b) => b.at.localeCompare(a.at));

  // Dinero real: las mismas cifras que Mi cartera y la rentabilidad sin ingresos del periodo elegido.
  const fig = realFigures({ wallets, mirrors, manual, pnl });
  const since = pnl?.since ? new Date(pnl.since).getTime() : 0;
  const firstEvent = pnl?.events[0] ? new Date(pnl.events[0].at).getTime() : Date.now() - 86_400_000;
  const per = PERIODS.find((p) => p.key === period)!;
  const from = per.ms ? Math.max(Date.now() - per.ms, since) : since || firstEvent;
  const series = pnlSeries(pnl?.events ?? [], fig.open, from);
  const periodPct = pnl && pnl.base > 0 ? (series.total / pnl.base) * 100 : null;
  const openItems = [
    ...(mirrors?.mirrors ?? []).filter(m => m.active && m.mode === "real").flatMap(m => m.legs.filter(l => l.mode === "real" && l.status === "abierta").map(l => ({ id: l.id, symbol: l.symbol, source: `${m.name}${l.short ? " · corto" : ""}${l.leverage && l.leverage > 1 ? ` x${l.leverage}` : ""}`, result: l.unrealized }))),
    ...(manual?.trades ?? []).filter(t => t.status === "abierta").map(t => ({ id: t.id, symbol: t.symbol, source: "Tuya", result: t.result })),
  ];
  const waiting = (mirrors?.mirrors ?? []).filter(m => m.active && m.mode === "real");
  const changeSince = async (value: string) => {
    const next = await api<PnlView>("pnl/since", { since: value ? new Date(`${value}T00:00:00`).toISOString() : null }).catch((e) => { setError(errorText(e)); return null; });
    if (next) setPnl(next);
  };

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
            {mode === "real" ? (
              !wallets ? <p className="mt-2 text-sm text-slate-500">Cargando tu dinero…</p>
              : fig.total <= 0 && !(wallets.items.length) ? <p className="mt-2 text-sm text-slate-500">Conecta un exchange en Conexiones para verlo aquí.</p>
              : (
                <>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <span className="text-4xl font-bold tracking-tight tabular-nums text-slate-900">{eur(fig.total, 2)}</span>
                    {fig.pct !== null && <span className="mb-0.5" title="Ganancia o pérdida sobre el dinero que ha trabajado (sin contar ingresos)"><ReturnPill value={fig.pct} big /></span>}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 sm:gap-2">
                    {[
                      { icon: Wallet, label: "Disponible", value: eur(fig.available, 2), sub: "Sin repartir", cls: "text-slate-900" },
                      { icon: Layers, label: "Invertido", value: eur(fig.invested, 2), sub: `Agentes ${eur(fig.agents, 2)} · Tus operaciones ${eur(fig.own, 2)}`, cls: "text-slate-900" },
                      {
                        icon: TrendingUp,
                        label: fig.since ? `Ganancia · desde ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" }).format(new Date(fig.since))}` : "Ganancia o pérdida",
                        value: signedEur(fig.earned),
                        sub: `Agentes ${signedEur(fig.earnedAgents)} · Tus operaciones ${signedEur(fig.earnedOwn)}`,
                        cls: tone(fig.earned),
                      },
                    ].map((k) => (
                      <div key={k.label} className="min-w-0 sm:rounded-xl sm:bg-slate-50 sm:px-3 sm:py-2.5">
                        <div className="flex items-center gap-1.5 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                          <k.icon className="hidden h-3.5 w-3.5 shrink-0 text-blue-600 sm:block" /> {k.label}
                        </div>
                        <div className={`mt-0.5 truncate text-sm font-bold tabular-nums sm:text-lg ${k.cls}`}>{k.value}</div>
                        <div className="mt-0.5 hidden truncate text-[11px] text-slate-500 sm:block">{k.sub}</div>
                      </div>
                    ))}
                  </div>
                </>
              )
            ) : virtual ? (
              <>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <span className="text-4xl font-bold tracking-tight tabular-nums text-slate-900">{eur(virtual.total.equity, 2)}</span>
                  {virtual.total.dailyChangePct !== null && (
                    <span className="mb-0.5"><ReturnPill value={virtual.total.dailyChangePct} big /></span>
                  )}
                </div>
                <RecentList items={recent} />
              </>
            ) : <p className="mt-2 text-sm text-slate-500">Cargando cartera virtual…</p>}
          </section>

          {mode === "real" && wallets && (
            <>
              <Section
                title="Rentabilidad"
                icon={TrendingUp}
                right={
                  <span className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold" role="group" aria-label="Periodo">
                    {PERIODS.map((p) => (
                      <button key={p.key} type="button" onClick={() => setPeriod(p.key)} aria-pressed={period === p.key}
                        className={`rounded-md px-2.5 py-1 ${period === p.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                        {p.label}
                      </button>
                    ))}
                  </span>
                }
              >
                <div className="flex flex-wrap items-end gap-3">
                  <span className={`text-3xl font-bold tabular-nums ${tone(series.total)}`}>{signedEur(series.total)}</span>
                  {periodPct !== null && <span className="mb-1"><ReturnPill value={periodPct} /></span>}
                </div>
                <div className="mt-2">
                  {series.points.length > 2 || Math.abs(series.total) > 0.005 ? (
                    <EquityChart points={series.points} initial={0} height={170} ranges={false} intraday balanceOnly flush empty="" />
                  ) : (
                    <p className="py-8 text-center text-sm text-slate-500">
                      Sin operaciones {per.ms && from > since ? "en este periodo" : "desde que empieza a contar"}: la gráfica se dibuja con la primera.
                    </p>
                  )}
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                  Solo lo que ganan o pierden las operaciones (cerradas y abiertas): ingresar o retirar dinero no la mueve.
                  <label className="inline-flex items-center gap-1">
                    Cuenta desde
                    <input type="date" className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-700"
                      value={pnl?.since ? new Date(pnl.since).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }) : ""}
                      max={new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" })}
                      onChange={(e) => void changeSince(e.target.value)} />
                  </label>
                </p>
              </Section>

              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Abierto ahora" icon={Activity} right={openItems.length ? `${openItems.length}` : undefined}>
                  {openItems.length ? (
                    <ul className="divide-y divide-slate-100">
                      {openItems.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 py-2.5 text-sm">
                          <AssetIcon symbol={item.symbol} size="md" />
                          <span className="min-w-0 flex-1">
                            <b className="block truncate font-semibold text-slate-900">{item.symbol.replace(/-EUR$/, "")}</b>
                            <span className="block truncate text-xs text-slate-500">{item.source}</span>
                          </span>
                          <span className={`shrink-0 text-sm font-semibold tabular-nums ${item.result === null ? "text-slate-400" : tone(item.result)}`}>
                            {item.result === null ? "—" : signedEur(item.result)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Nada abierto.{waiting.length ? ` ${waiting.map((m) => m.name).join(", ")} ${waiting.length === 1 ? "espera" : "esperan"} ${waiting.some((m) => m.paused) ? "(alguno en pausa)" : "su próxima señal"}.` : ""}
                    </p>
                  )}
                </Section>
                <Section title="Últimas operaciones" icon={History} right={<Link href="/trading/cartera" className="font-semibold text-blue-600 hover:underline">Ver mi cartera</Link>}>
                  <RecentList items={recent} bare />
                </Section>
              </div>
            </>
          )}

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
