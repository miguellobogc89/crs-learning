"use client";
// Inicio: tu cartera y su evolución, tú contra los agentes y lo último que han hecho.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Info, User, Users } from "lucide-react";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import type { TradingStatus } from "./navigation";
import type { getAgents } from "@/lib/trading/agents/service";
import { api, eur, eur0, errorText, pct, tone, MEETINGS_TEXT } from "./format";
import { useTradingRefresh } from "./navigation";
import { OpenAccount } from "./open-account";
import { AVATAR, cap, card, ErrorNote, LoadingCard, PILL, plainText, ReturnPill } from "./ui";
import { AssetIcon } from "./asset-icon";

type Portfolio = Awaited<ReturnType<typeof getPortfolio>>;
type Agents = Awaited<ReturnType<typeof getAgents>>;

export { AGENT_DOT } from "./ui";

/** Patrimonio en la cabecera de Inicio, consultado desde el estado ligero del módulo. */
export function HomeBalance() {
  const [status, setStatus] = useState<TradingStatus | null>(null);
  const load = useCallback(() => {
    api<TradingStatus>("status").then(setStatus).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);
  useTradingRefresh(load);

  if (!status?.opened) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-3" aria-label="Mi patrimonio virtual">
      <span className="whitespace-nowrap text-2xl font-bold tracking-tight tabular-nums text-slate-950 sm:text-3xl">
        {eur(status.equity, 2)}
      </span>
      <ReturnPill value={status.returnPct} big />
    </div>
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, g] = await Promise.all([api<Portfolio>("portfolio"), api<Agents>("agents")]);
      setAccount(a);
      setAgents(g);
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
  const bench = agents.agents[0]?.benchmark;

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
        {!account.opened && <OpenAccount />}

        {/* Operadores */}
        <section className={`${card} px-6 py-5`}>
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-900">
              <Users className="h-5 w-5 text-blue-600" /> Operadores
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
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[23%]" />
                <col className="w-[19%]" />
                <col className="w-[17%]" />
                <col className="w-[22%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 text-center">#</th>
                  <th className="px-2 py-2 text-left">Quién</th>
                  <th className="px-2 py-2 text-right">Patrimonio</th>
                  <th className="px-2 py-2 text-center">Rentabilidad</th>
                  <th className="px-2 py-2 text-center">Invertido</th>
                  <th className="py-2 text-center">Posiciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, k) => (
                  <tr key={r.key} className="border-t border-slate-100">
                    <td className="py-3 text-center">
                      <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-xs font-semibold text-slate-600">{k + 1}</span>
                    </td>
                    <td className="px-2 py-3">
                      {r.key === "tu" ? (
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${AVATAR.slate} text-white`}>
                            <User className="h-4 w-4" />
                          </span>
                          <b className="text-[15px] font-semibold text-slate-900">Tú</b>
                        </span>
                      ) : (
                        <Link href={`/trading/agentes?agent=${r.key}`} className="group flex min-w-0 items-center gap-2 whitespace-nowrap">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${AVATAR[r.color] ?? AVATAR.slate} text-white`}>
                            <Bot className="h-4 w-4" />
                          </span>
                          <b className="truncate text-[15px] font-semibold text-slate-900 group-hover:underline">{r.name}</b>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PILL[r.color] ?? PILL.slate}`}>{cap(r.profile)}</span>
                        </Link>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right text-[15px] font-semibold tabular-nums text-slate-900">{eur(r.equity, 2)}</td>
                    <td className="px-2 py-3 text-center">
                      <ReturnPill value={r.returnPct} />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <span className="shrink-0 whitespace-nowrap tabular-nums text-slate-700">{pct(r.investedPct, 0, false)}</span>
                        <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100 lg:w-20">
                          <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, r.investedPct))}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-center">
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
