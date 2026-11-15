import type { ReactNode } from "react";
import { Flame, Layers, RefreshCw, TrendingUp, Users, Wallet } from "lucide-react";
import { eur, flat, tone } from "./format";
import { card, ReturnPill } from "./ui";
import { EquityChart } from "./equity-chart";

type Period = { key: string; label: string };

export function PortfolioBalance<T extends string>({
  title, total, available, working, opportunities, earned, returnPct, points, initial, intraday,
  periods, period, onPeriodChange, refreshing, onRefresh, note, empty, setup,
}: {
  title: string;
  total: number;
  available: number;
  working: number;
  opportunities: number;
  earned: number;
  returnPct: number | null;
  points: { day: string; equity: number }[];
  initial: number;
  intraday?: boolean;
  periods: (Period & { key: T })[];
  period: T;
  onPeriodChange: (period: T) => void;
  refreshing: boolean;
  onRefresh: () => void;
  note: string;
  empty: string;
  setup?: ReactNode;
}) {
  const kpis = [
    { icon: Wallet, label: "Disponible", value: available, tip: "Capital libre para operar" },
    { icon: Layers, label: "Trabajando para ti", value: working, tip: "En oportunidades y en copias de agentes" },
    { icon: Flame, label: "En oportunidades", value: opportunities, tip: "Valor actual de tus oportunidades abiertas" },
    { icon: TrendingUp, label: "Ganado", value: earned, tip: "Resultado de oportunidades y copias", result: true },
  ];

  return (
    <section className={`${card} ${flat} px-4 pb-3 pt-4 sm:px-6 sm:pt-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[15px] font-medium text-slate-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Wallet className="h-5 w-5" />
          </span>
          {title}
        </div>
        {!setup && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Periodo del gráfico">
              {periods.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={period === key}
                  onClick={() => onPeriodChange(key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${period === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title="Actualizar saldo, gráfica y oportunidades"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Actualizar
            </button>
          </div>
        )}
      </div>
      {setup ?? (
        <>
          <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-4xl font-bold tracking-tight tabular-nums text-slate-900 sm:text-5xl">{eur(total, 2)}</span>
              {returnPct !== null && <ReturnPill value={returnPct} big />}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {kpis.map((kpi) => (
                <div key={kpi.label} className="rounded-xl bg-slate-50 px-3 py-2.5" title={kpi.tip}>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                    <kpi.icon className={`h-3.5 w-3.5 shrink-0 ${kpi.result ? "text-emerald-600" : "text-blue-600"}`} /> {kpi.label}
                  </div>
                  <div className={`mt-0.5 text-base font-bold tabular-nums sm:text-lg ${kpi.result ? tone(kpi.value) : "text-slate-900"}`}>
                    {kpi.result && kpi.value >= 0 ? "+" : ""}{eur(kpi.value, 2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <EquityChart points={points} initial={initial} height={145} ranges={false} intraday={intraday} balanceOnly empty={empty} />
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">{note}</p>
        </>
      )}
    </section>
  );
}

export function PortfolioColumns({ opportunities, agents }: { opportunities: ReactNode; agents: ReactNode }) {
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">{opportunities}{agents}</div>;
}

export function PortfolioAgents({ count, children }: { count?: string; children: ReactNode }) {
  return (
    <section className={`${card} ${flat} min-w-0 px-4 py-4 lg:self-start`}>
      <h2 className="flex items-center gap-2 px-1 pb-2 text-[15px] font-semibold text-slate-900">
        <Users className="h-4 w-4 text-slate-500" /> Tus agentes
        {count && <span className="font-normal text-slate-400">· {count}</span>}
      </h2>
      {children}
    </section>
  );
}

export function PortfolioOpportunities({ children }: { children: ReactNode }) {
  return <section className={`${card} ${flat} flex min-w-0 flex-col px-4 py-4`}>{children}</section>;
}
