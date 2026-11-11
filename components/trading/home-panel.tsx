"use client";
// Inicio: tú contra los agentes, en una tabla con el estilo de Oportunidades. La actividad de los
// agentes vive en su propia sección («Actividad»).
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bot, User } from "lucide-react";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import type { TradingStatus } from "./navigation";
import type { getAgents } from "@/lib/trading/agents/service";
import { api, eur, errorText, pct } from "./format";
import { useTradingRefresh } from "./navigation";
import { OpenAccount } from "./open-account";
import { AVATAR, cap, ErrorNote, LoadingCard, PILL, ReturnPill } from "./ui";
import { Money, Segmented, sinceText, TablePanel, TD, TH } from "./table";
import { ActivityPanel } from "./activity-panel";

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

export const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `hace ${Math.max(1, mins)} min`;
  if (mins < 24 * 60) return `hace ${Math.round(mins / 60)} h`;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" }).format(new Date(iso));
};

type View = "operadores" | "actividad";

export function HomePanel() {
  const router = useRouter();
  const params = useSearchParams();
  const view: View = params.get("vista") === "actividad" ? "actividad" : "operadores";
  const setView = (v: View) => router.replace(v === "actividad" ? "/trading/inicio?vista=actividad" : "/trading/inicio", { scroll: false });
  const tabs = (
    <Segmented<View>
      value={view}
      onChange={setView}
      options={[
        { key: "operadores", label: "Operadores" },
        { key: "actividad", label: "Actividad" },
      ]}
    />
  );
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

  if (view === "actividad") return <ActivityPanel header={tabs} />;
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
            startedAt: account.openedAt,
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
      startedAt: a.startedAt as string | null,
    })),
  ].sort((x, y) => y.returnPct - x.returnPct);

  return (
    <div className="space-y-4">
      {!account.opened && <OpenAccount />}
      <TablePanel header={tabs}>
        <table className="w-full table-fixed text-sm">
          <colgroup>
            {[5, 21, 12, 13, 12, 10, 15, 12].map((w, n) => (
              <col key={n} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className={`${TH} text-center`}>#</th>
              <th className={TH}>Operador</th>
              <th className={`${TH} text-center`}>Inicio</th>
              <th className={`${TH} text-center`}>Patrimonio</th>
              <th className={`${TH} text-center`}>Rentabilidad</th>
              <th className={`${TH} text-center`}>Operaciones</th>
              <th className={`${TH} text-center`}>Invertido</th>
              <th className={`${TH} text-center`}>Posiciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => (
              <tr key={r.key} className="border-b border-slate-100 hover:bg-slate-50/60">
                <td className={`${TD} text-center`}>
                  <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-xs font-semibold text-slate-600">{k + 1}</span>
                </td>
                <td className={TD}>
                  {r.key === "tu" ? (
                    <span className="flex items-center gap-2">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${AVATAR.slate} text-white`}>
                        <User className="h-4 w-4" />
                      </span>
                      <b className="font-semibold text-slate-900">Tú</b>
                    </span>
                  ) : (
                    <Link href={`/trading/agentes?agent=${r.key}`} className="group flex min-w-0 items-center gap-2">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${AVATAR[r.color] ?? AVATAR.slate} text-white`}>
                        <Bot className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <b className="block truncate font-semibold text-slate-900 group-hover:underline">{r.name}</b>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL[r.color] ?? PILL.slate}`}>{cap(r.profile)}</span>
                      </span>
                    </Link>
                  )}
                </td>
                <td className={`${TD} text-center text-slate-600`}>{sinceText(r.startedAt)}</td>
                <td className={`${TD} text-center font-semibold text-slate-900`}>
                  <Money v={r.equity} digits={2} />
                </td>
                <td className={`${TD} text-center`}>
                  <span className="inline-flex justify-center">
                    <ReturnPill value={r.returnPct} />
                  </span>
                </td>
                <td className={`${TD} text-center tabular-nums text-slate-700`}>{r.open + r.closed}</td>
                <td className={TD}>
                  <div className="flex items-center justify-center gap-2">
                    <span className="shrink-0 tabular-nums text-slate-700">{pct(r.investedPct, 0, false)}</span>
                    <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, r.investedPct))}%` }} />
                    </span>
                  </div>
                </td>
                <td className={`${TD} text-center`}>
                  {r.pending > 0 ? (
                    <span className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-orange-700">
                      {r.open} + {r.pending} pend.
                    </span>
                  ) : (
                    <span className="tabular-nums text-slate-700">{r.open}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablePanel>
    </div>
  );
}
