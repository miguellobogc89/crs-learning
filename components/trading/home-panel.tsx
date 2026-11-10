"use client";
// Inicio: tu cartera y su evolución, tú contra los agentes y lo último que han hecho.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Flame, Loader2 } from "lucide-react";
import type { accountDetail } from "@/lib/trading/accounts";
import type { getAgents } from "@/lib/trading/agents/service";
import type { getOpportunities } from "@/lib/trading/agents/opportunities";
import { api, eur0, errorText, ghost, panel, pct, primary, th, tone } from "./format";
import { useTradingRefresh } from "./navigation";
import { EquityCurve } from "./portfolio-panel";
import { plainText, Rich } from "./ui";

type Account = Awaited<ReturnType<typeof accountDetail>>;
type Agents = Awaited<ReturnType<typeof getAgents>>;
type Opps = Awaited<ReturnType<typeof getOpportunities>>;

export const AGENT_DOT: Record<string, string> = { emerald: "bg-emerald-500", blue: "bg-blue-500", orange: "bg-orange-500", slate: "bg-slate-800" };

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
  const [account, setAccount] = useState<Account | null>(null);
  const [agents, setAgents] = useState<Agents | null>(null);
  const [opps, setOpps] = useState<Opps | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, g, o] = await Promise.all([api<Account>("account"), api<Agents>("agents"), api<Opps>("opportunities")]);
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
      <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
    ) : (
      <div className="flex h-48 items-center justify-center border border-slate-200 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );

  const s = account.summary;
  const open = account.positions.filter((p) => p.status === "abierta").length;
  const pending = account.positions.filter((p) => p.status === "pendiente").length;
  const newOpps = opps?.buys.filter((b) => b.status === "ok").length ?? 0;
  const bench = agents.agents[0]?.benchmark;
  const view = agents.agents.find((a) => a.key === "nova")?.lastRun?.marketView ?? agents.agents.find((a) => a.lastRun?.marketView)?.lastRun?.marketView;

  const rows = [
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
      closed: s.stats.closed,
    },
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        {/* Tu cartera */}
        <section className={panel}>
          <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-5">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Tu cartera</div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-3xl font-semibold tabular-nums text-slate-900">{eur0(s.equity)}</span>
                <span className={`text-sm font-medium ${tone(s.returnPct)}`}>{pct(s.returnPct)}</span>
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {eur0(s.cash)} en efectivo · {open === 1 ? "1 posición abierta" : `${open} posiciones abiertas`}
                {pending > 0 && ` · ${pending === 1 ? "1 orden pendiente" : `${pending} órdenes pendientes`}`}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/trading/oportunidades" className={primary}>
                <Flame className="h-4 w-4" /> {newOpps ? `${newOpps} ${newOpps === 1 ? "oportunidad" : "oportunidades"}` : "Oportunidades"}
              </Link>
              <Link href="/trading/cartera" className={ghost}>
                Ver mi cartera
              </Link>
            </div>
          </div>
          <div className="px-2 pb-2 pt-3">
            <EquityCurve
              points={account.equity}
              initial={s.initialCapital}
              height={200}
              empty="Tu gráfico se dibuja con el cierre de cada sesión. Ejecuta tu primera oportunidad y mañana verás la línea."
            />
          </div>
        </section>

        {/* Tú contra los agentes */}
        <section className={panel}>
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Tú y los agentes</h2>
            {bench && (
              <span className="text-xs text-slate-500">
                Desde que empezaron los agentes: IBEX 35 <b className={tone(bench.ibexPct)}>{pct(bench.ibexPct)}</b> · Bitcoin{" "}
                <b className={tone(bench.btcPct)}>{pct(bench.btcPct)}</b>
              </span>
            )}
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>Quién</th>
                  <th className={`${th} text-right`}>Patrimonio</th>
                  <th className={`${th} text-right`}>Rentabilidad</th>
                  <th className={`${th} text-right`}>Invertido</th>
                  <th className={`${th} text-right`}>Posiciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, k) => (
                  <tr key={r.key} className={`border-t border-slate-100 ${r.key === "tu" ? "bg-slate-50/70" : ""}`}>
                    <td className="px-3 py-2.5 font-semibold tabular-nums text-slate-500">{k + 1}</td>
                    <td className="px-3 py-2.5">
                      {r.key === "tu" ? (
                        <span className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 ${AGENT_DOT.slate}`} />
                          <b className="font-semibold text-slate-900">Tú</b>
                        </span>
                      ) : (
                        <Link href={`/trading/agentes?agent=${r.key}`} className="flex items-center gap-2 hover:underline">
                          <span className={`h-2.5 w-2.5 ${AGENT_DOT[r.color]}`} />
                          <b className="font-semibold text-slate-900">{r.name}</b>
                          <span className="text-xs text-slate-500">{r.profile}</span>
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{eur0(r.equity)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${tone(r.returnPct)}`}>{pct(r.returnPct)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{pct(r.investedPct, 0, false)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {r.open}
                      {r.pending > 0 && <span className="text-amber-700"> + {r.pending} pend.</span>}
                      {r.closed > 0 && <span className="text-slate-400"> · {r.closed} cerradas</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view && (
            <div className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
              <div className="mb-1 text-xs font-medium text-slate-500">Cómo ven el mercado</div>
              <Rich text={view} />
            </div>
          )}
        </section>
      </div>

      {/* Últimos movimientos */}
      <aside className="min-w-0">
        <section className={panel}>
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Bot className="h-4 w-4 text-slate-500" /> Últimos movimientos
            </h2>
            <Link href="/trading/agentes" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
              Agentes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>
          {agents.moves.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Los agentes aún no han operado. Se reúnen cada día laborable a las 19:15.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {agents.moves.map((m) => (
                <li key={`${m.kind}-${m.id}`} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className={`h-2 w-2 shrink-0 self-center ${AGENT_DOT[m.color]}`} />
                      <span className="min-w-0">
                        <b className="font-semibold text-slate-900">{m.name}</b> <span className="text-slate-700">{MOVE[m.kind](m.asset)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{ago(m.at)}</span>
                  </div>
                  {m.pnl !== null && <div className={`mt-0.5 pl-3.5 text-xs font-medium tabular-nums ${tone(m.pnl)}`}>{m.pnl >= 0 ? "+" : ""}{eur0(m.pnl)}</div>}
                  {m.text && <p className="mt-1 pl-3.5 text-xs leading-relaxed text-slate-500">{short(m.text)}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
