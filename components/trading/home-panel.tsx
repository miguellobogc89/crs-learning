"use client";
// Inicio: tu cartera y su evolución, tú contra los agentes y lo último que han hecho.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Bot, Briefcase, Flame, Info, User, Users, Wallet } from "lucide-react";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import type { getAgents } from "@/lib/trading/agents/service";
import type { getOpportunities } from "@/lib/trading/agents/opportunities";
import { api, eur0, errorText, pct, tone, MEETINGS_TEXT } from "./format";
import { useTradingRefresh } from "./navigation";
import { OpenAccount } from "./open-account";
import { withLivePoint } from "./equity-chart";
import { AVATAR, cap, card, ErrorNote, LoadingCard, PILL, plainText, ReturnPill, Rich } from "./ui";
import { AssetIcon } from "./asset-icon";

type Portfolio = Awaited<ReturnType<typeof getPortfolio>>;
type Agents = Awaited<ReturnType<typeof getAgents>>;
type Opps = Awaited<ReturnType<typeof getOpportunities>>;

export { AGENT_DOT } from "./ui";

/** Línea de patrimonio pequeña, con degradado. */
function Sparkline({ points }: { points: { day: string; equity: number }[] }) {
  const w = 240;
  const h = 72;
  const vals = points.map((p) => p.equity);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || Math.abs(hi) * 0.01 || 1;
  const x = (i: number) => 4 + (i / (points.length - 1)) * (w - 8);
  const y = (v: number) => 6 + ((hi - v) / span) * (h - 12);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join("");
  const up = vals[vals.length - 1] >= vals[0];
  const col = up ? "#22c55e" : "#ef4444";
  const id = up ? "spark-up" : "spark-down";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full max-w-[240px]" role="img" aria-label="Evolución de tu patrimonio">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.25" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${x(points.length - 1)},${h}L${x(0)},${h}Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(vals[vals.length - 1])} r={3.5} fill={col} />
    </svg>
  );
}

const MOVE: Record<string, (asset: string) => string> = {
  compra: (a) => `compra ${a}`,
  venta: (a) => `vende ${a}`,
  protege: (a) => `sube el stop de ${a}`,
  stop: (a) => `sale de ${a} por el stop`,
  objetivo: (a) => `cobra el objetivo en ${a}`,
  tiempo: (a) => `cierra ${a} por tiempo`,
};

export const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `hace ${Math.max(1, mins)} min`;
  if (mins < 24 * 60) return `hace ${Math.round(mins / 60)} h`;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" }).format(new Date(iso));
};

const short = (s: string | null, n = 150) => {
  const t = plainText(s);
  return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, "")}…` : t;
};

export function HomePanel() {
  const [account, setAccount] = useState<Portfolio | null>(null);
  const [agents, setAgents] = useState<Agents | null>(null);
  const [opps, setOpps] = useState<Opps | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, g, o] = await Promise.all([api<Portfolio>("portfolio"), api<Agents>("agents"), api<Opps>("opportunities")]);
      setAccount(a);
      setAgents(g);
      setOpps(o);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  if (!account || !agents)
    return error ? (
      <ErrorNote>{error}</ErrorNote>
    ) : (
      <LoadingCard />
    );

  const s = account.total;
  const allPositions = [...account.main.positions, ...account.copies.flatMap((c) => c.positions)];
  const open = allPositions.filter((p) => p.status === "abierta").length;
  const pending = allPositions.filter((p) => p.status === "pendiente").length;
  const newOpps = opps?.buys.filter((b) => b.status === "ok").length ?? 0;
  const bench = agents.agents[0]?.benchmark;
  const view = agents.agents.find((a) => a.key === "nova")?.lastRun?.marketView ?? agents.agents.find((a) => a.lastRun?.marketView)?.lastRun?.marketView;

  const rows = [
    ...(account.opened
      ? [
          {
            key: "tu",
            name: "Tú",
            profile: "tu cartera",
            color: "slate",
            equity: s.equity,
            returnPct: s.returnPct,
            investedPct: s.equity > 0 ? (s.invested / s.equity) * 100 : 0,
            open,
            pending,
            closed: s.closed,
          },
        ]
      : []),
    ...agents.agents.map((a) => ({
      key: a.key,
      name: a.name,
      profile: a.profile,
      color: a.color,
      equity: a.summary.equity,
      returnPct: a.summary.returnPct,
      investedPct: a.summary.equity > 0 ? (a.summary.invested / a.summary.equity) * 100 : 0,
      open: a.positions.filter((p) => p.status === "abierta").length,
      pending: a.positions.filter((p) => p.status === "pendiente").length,
      closed: a.summary.stats.closed,
    })),
  ].sort((x, y) => y.returnPct - x.returnPct);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        {/* Tu cartera */}
        {!account.opened ? (
          <OpenAccount />
        ) : (
          <section className={`${card} px-6 py-5`}>
            <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Wallet className="h-5 w-5" />
              </span>
              Tu cartera
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-4xl font-bold tracking-tight tabular-nums text-slate-900 sm:text-5xl">{eur0(s.equity)}</span>
                  <ReturnPill value={s.returnPct} big />
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {account.copies.length > 0 && `${account.copies.map((c) => `${c.weightPct} % ${c.name}`).join(" · ")} · `}
                  {eur0(s.available)} libres{s.reserved > 0.5 ? ` (+${eur0(s.reserved)} reservados para órdenes pendientes)` : ""} · {open === 1 ? "1 posición abierta" : `${open} posiciones abiertas`}
                  {pending > 0 && ` · ${pending === 1 ? "1 orden pendiente" : `${pending} órdenes pendientes`}`}
                </div>
              </div>
              <div className="flex min-w-[160px] flex-1 justify-center">{withLivePoint(account.equity, s.equity).length >= 2 && <Sparkline points={withLivePoint(account.equity, s.equity)} />}</div>
              <div className="flex w-full flex-col gap-2 sm:w-auto">
                <Link
                  href="/trading/oportunidades"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700"
                >
                  <Flame className="h-4 w-4" /> {newOpps ? `${newOpps} ${newOpps === 1 ? "oportunidad" : "oportunidades"}` : "Oportunidades"}
                </Link>
                <Link
                  href="/trading/cartera"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Briefcase className="h-4 w-4" /> Ver mi cartera
                </Link>
              </div>
            </div>
            {withLivePoint(account.equity, s.equity).length < 2 && (
              <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <BarChart3 className="h-4 w-4 text-slate-400" /> Tu gráfico se dibuja con el cierre de cada sesión. Ejecuta tu primera oportunidad y mañana
                verás la línea.
              </p>
            )}
          </section>
        )}

        {/* Tú y los agentes */}
        <section className={`${card} px-6 py-5`}>
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-900">
              <Users className="h-5 w-5 text-blue-600" /> Tú y los agentes
            </h2>
            {bench && (
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                Desde que empezaron los agentes: IBEX 35 <b className={tone(bench.ibexPct)}>{pct(bench.ibexPct)}</b> · Bitcoin{" "}
                <b className={tone(bench.btcPct)}>{pct(bench.btcPct)}</b>
                <span title="Lo que ha hecho el mercado en el mismo periodo, para comparar.">
                  <Info className="h-3.5 w-3.5 text-slate-400" />
                </span>
              </span>
            )}
          </header>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Quién</th>
                  <th className="px-2 py-2 text-right">Patrimonio</th>
                  <th className="px-2 py-2 text-center">Rentabilidad</th>
                  <th className="px-2 py-2 text-left">Invertido</th>
                  <th className="py-2 pl-2 text-right">Posiciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, k) => (
                  <tr key={r.key} className="border-t border-slate-100">
                    <td className="py-3 pr-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-xs font-semibold text-slate-600">{k + 1}</span>
                    </td>
                    <td className="px-2 py-3">
                      {r.key === "tu" ? (
                        <span className="flex items-center gap-3">
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${AVATAR.slate} text-white`}>
                            <User className="h-4 w-4" />
                          </span>
                          <b className="text-[15px] font-semibold text-slate-900">Tú</b>
                        </span>
                      ) : (
                        <Link href={`/trading/agentes?agent=${r.key}`} className="group flex items-center gap-3">
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${AVATAR[r.color] ?? AVATAR.slate} text-white`}>
                            <Bot className="h-4 w-4" />
                          </span>
                          <b className="text-[15px] font-semibold text-slate-900 group-hover:underline">{r.name}</b>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[r.color] ?? PILL.slate}`}>{cap(r.profile)}</span>
                        </Link>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right text-[15px] font-semibold tabular-nums text-slate-900">{eur0(r.equity)}</td>
                    <td className="px-2 py-3 text-center">
                      <ReturnPill value={r.returnPct} />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-10 text-right tabular-nums text-slate-700">{pct(r.investedPct, 0, false)}</span>
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, r.investedPct))}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pl-2 text-right">
                      {r.pending > 0 ? (
                        <span className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-orange-700">
                          {r.open} + {r.pending} pend.
                        </span>
                      ) : (
                        <span className="tabular-nums text-slate-700">{r.open}</span>
                      )}
                      {r.closed > 0 && <div className="mt-0.5 text-[11px] text-slate-400">{r.closed} cerradas</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view && (
            <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
              <div className="mb-1 text-xs font-semibold text-slate-500">Cómo ven el mercado</div>
              <Rich text={view} />
            </div>
          )}
        </section>
      </div>

      {/* Últimos movimientos */}
      <aside className="min-w-0">
        <section className={card}>
          <header className="flex items-center justify-between px-5 pb-2 pt-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Bot className="h-5 w-5 text-blue-600" /> Últimos movimientos
            </h2>
            <Link href="/trading/agentes" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
              Agentes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>
          {agents.moves.length === 0 ? (
            <p className="px-5 pb-5 pt-2 text-sm text-slate-500">Los agentes aún no han operado. {MEETINGS_TEXT}</p>
          ) : (
            <ul className="px-2 pb-3">
              {agents.moves.map((m) => (
                <li key={`${m.kind}-${m.id}`} className="flex gap-3 rounded-xl px-3 py-3 hover:bg-slate-50">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${AVATAR[m.color] ?? AVATAR.slate} text-white`}>
                    <Bot className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <b className="font-semibold text-slate-900">{m.name}</b> <span className="text-slate-700">{MOVE[m.kind](m.asset)}</span>{" "}
                        <AssetIcon symbol={m.symbol} name={m.asset} size="xs" className="ml-0.5 align-[-5px]" />
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{ago(m.at)}</span>
                    </div>
                    {m.pnl !== null && (
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${m.pnl >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        {m.pnl >= 0 ? "+" : ""}
                        {eur0(m.pnl)}
                      </span>
                    )}
                    {m.text && <p className="mt-1 text-xs leading-relaxed text-slate-500">{short(m.text)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
