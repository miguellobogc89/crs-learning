"use client";
// Inicio: tú contra los agentes, en una tabla con el estilo de Oportunidades. La actividad de los
// agentes vive en su propia sección («Actividad»).
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import { DataTable, Money, Segmented, sinceText, type Col } from "./table";
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

  if (!account || !agents)
    return error ? (
      <ErrorNote>{error}</ErrorNote>
    ) : (
      <LoadingCard />
    );

  const s = account.total;
  // Indicadores de la cabecera: tu patrimonio, los agentes en conjunto, el líder y el mercado.
  const agentEq = agents.agents.reduce((t, a) => t + a.summary.equity, 0);
  const agentIni = agents.agents.reduce((t, a) => t + a.summary.initialCapital, 0);
  const agentsRet = agentIni > 0 ? ((agentEq - agentIni) / agentIni) * 100 : 0;
  const leader = [...agents.agents].sort((x, y) => y.summary.returnPct - x.summary.returnPct)[0];
  const bench = agents.agents[0]?.benchmark;
  const kpis = (
    <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-6">
      {account.opened && (
        <Kpi label="Tu patrimonio">
          <Money v={s.equity} digits={2} className="font-semibold text-slate-900" />
          <ReturnPill value={s.returnPct} />
        </Kpi>
      )}
      <Kpi label={`Agentes (${agents.agents.length}) en conjunto`}>
        <Money v={agentEq} digits={2} className="font-semibold text-slate-900" />
        <ReturnPill value={agentsRet} />
      </Kpi>
      {leader && (
        <Kpi label="Va en cabeza">
          <b className="max-w-[9rem] truncate font-semibold text-slate-900">{leader.name}</b>
          <ReturnPill value={leader.summary.returnPct} />
        </Kpi>
      )}
      {bench && bench.btcPct !== null && (
        <Kpi label="Bitcoin desde el inicio">
          <ReturnPill value={bench.btcPct} />
        </Kpi>
      )}
    </div>
  );
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {tabs}
      {kpis}
    </div>
  );
  if (view === "actividad") return <ActivityPanel header={header} />;
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
  ]
    .sort((x, y) => y.returnPct - x.returnPct)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  type Row = (typeof rows)[number];
  const columns: Col<Row>[] = [
    {
      key: "rank",
      label: "#",
      width: 5,
      sort: (r) => r.rank,
      cell: (r) => <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-xs font-semibold text-slate-600">{r.rank}</span>,
    },
    {
      key: "name",
      label: "Operador",
      width: 21,
      align: "left",
      sort: (r) => r.name,
      cell: (r) =>
        r.key === "tu" ? (
          <span className="flex items-center gap-2">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${AVATAR.slate} text-white`}>
              <User className="h-4 w-4" />
            </span>
            <b className="font-semibold text-slate-900">Tú</b>
          </span>
        ) : (
          <Link href={`/trading/agentes/${r.key}?from=inicio`} className="group flex min-w-0 items-center gap-2">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${AVATAR[r.color] ?? AVATAR.slate} text-white`}>
              <Bot className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <b className="block truncate font-semibold text-slate-900 group-hover:underline">{r.name}</b>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL[r.color] ?? PILL.slate}`}>{cap(r.profile)}</span>
            </span>
          </Link>
        ),
    },
    { key: "since", label: "Inicio", width: 12, sort: (r) => (r.startedAt ? new Date(r.startedAt).getTime() : null), cell: (r) => <span className="text-slate-600">{sinceText(r.startedAt)}</span> },
    { key: "equity", label: "Patrimonio", width: 13, sort: (r) => r.equity, cell: (r) => <Money v={r.equity} digits={2} className="font-semibold text-slate-900" /> },
    { key: "ret", label: "Rentabilidad", width: 12, sort: (r) => r.returnPct, cell: (r) => <span className="inline-flex justify-center"><ReturnPill value={r.returnPct} /></span> },
    { key: "ops", label: "Operaciones", width: 10, sort: (r) => r.open + r.closed, cell: (r) => <span className="tabular-nums text-slate-700">{r.open + r.closed}</span> },
    {
      key: "inv",
      label: "Invertido",
      width: 15,
      sort: (r) => r.investedPct,
      cell: (r) => (
        <div className="flex items-center justify-center gap-2">
          <span className="shrink-0 tabular-nums text-slate-700">{pct(r.investedPct, 0, false)}</span>
          <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, r.investedPct))}%` }} />
          </span>
        </div>
      ),
    },
    {
      key: "pos",
      label: "Posiciones",
      width: 12,
      sort: (r) => r.open + r.pending,
      cell: (r) =>
        r.pending > 0 ? (
          <span className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-orange-700">
            {r.open} + {r.pending} pend.
          </span>
        ) : (
          <span className="tabular-nums text-slate-700">{r.open}</span>
        ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {!account.opened && <OpenAccount />}
      <DataTable
        id="inicio-operadores"
        height="min-h-0 flex-1"
        header={header}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        onRowClick={(r) => router.push(r.key === "tu" ? "/trading/cartera" : `/trading/agentes/${r.key}?from=inicio`)}
        paginate
        label="operadores"
      />
    </div>
  );
}

function Kpi({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 flex items-center gap-2 text-sm">{children}</div>
    </div>
  );
}
