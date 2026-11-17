"use client";
// Resumen (primera pestaña de Inicio, 17/11/2026): para verlo en un segundo, por ejemplo en el metro.
// Si todo funciona, tu dinero, el mercado en cuatro datos, cómo va cada familia de agentes y lo que gasta
// la IA. Los indicadores detallados (lo que antes era Panorama) quedan en un desplegable al final.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Bot, ChevronDown, CircleCheck, Cpu, Gauge, Shield, Swords, Wallet } from "lucide-react";
import type { getSummary } from "@/lib/trading/summary";
import { api, card, eur, errorText, flat } from "./format";
import { useTradingRefresh, useWarmStart } from "./navigation";
import { AGENT_DOT, ErrorNote, LoadingCard, ReturnPill } from "./ui";
import { PulsePanel } from "./pulse-panel";

type Summary = Awaited<ReturnType<typeof getSummary>>;

/** Abre el panel de notificaciones (lo escucha la estructura de Trading). */
export const openNotifications = () => window.dispatchEvent(new Event("trading:notifications"));

const nf = (v: number, d = 0) => v.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d });
const compact = (v: number) => (v >= 1_000_000 ? `${nf(v / 1_000_000, 1)} M` : v >= 1000 ? `${nf(v / 1000, 0)} k` : nf(v));
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

  return (
    <div className="space-y-4 pb-6 lg:h-full lg:overflow-y-auto lg:pr-1">
      <div className="flex flex-wrap items-center justify-between gap-3">{tabs}</div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data ? (
        !error && <LoadingCard height="h-96" />
      ) : (
        <>
          {/* ¿Funciona todo? */}
          {data.health && (
            <button
              type="button"
              onClick={openNotifications}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ${data.health.problems ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
            >
              {data.health.problems ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CircleCheck className="h-5 w-5 shrink-0" />}
              <span className="min-w-0 flex-1">
                <b className="block text-sm font-semibold">
                  {data.health.problems ? `${data.health.problems} ${data.health.problems === 1 ? "problema" : "problemas"}` : "Todo funciona"}
                </b>
                <span className="block truncate text-xs opacity-80">
                  {data.health.problems ? data.health.latest.join(" · ") : "FARO analiza y los agentes se revisan cada 5 minutos"}
                </span>
              </span>
            </button>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Tu dinero */}
            <section className={`${card} ${flat} px-4 py-4 sm:px-5`}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Wallet className="h-3.5 w-3.5" /> Tu dinero real
              </div>
              {data.balance ? (
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span className="text-4xl font-bold tracking-tight tabular-nums text-slate-900">{eur(data.balance.total, 2)}</span>
                  {data.balance.ch24h !== null && (
                    <span className="flex items-center gap-1.5">
                      <ReturnPill value={data.balance.ch24h} big />
                      <span className="text-xs text-slate-400">24 h</span>
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-500">Conecta un exchange en Conexiones para verlo aquí.</p>
              )}
            </section>

            {/* Mercado en cuatro datos */}
            {data.market && (
              <div className="grid grid-cols-2 gap-2.5">
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
              </div>
            )}
          </div>

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
