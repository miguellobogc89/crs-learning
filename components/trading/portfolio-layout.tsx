import type { ReactNode } from "react";
import { Layers, RefreshCw, TrendingUp, Users, Wallet } from "lucide-react";
import { eur, flat, tone } from "./format";
import { card, ReturnPill } from "./ui";
import { EquityChart } from "./equity-chart";

type Period = { key: string; label: string };

export function PortfolioBalance<T extends string>({
  title, total, available, working, opportunities, earned, earnedParts, returnPct, points, initial, intraday,
  periods, period, onPeriodChange, refreshing, onRefresh, note, empty, setup, venues,
}: {
  /** Etiqueta pequeña sobre el saldo («Saldo total», «Dinero virtual»…). El título de la página ya dice dónde estás. */
  title: string;
  total: number;
  available: number;
  working: number;
  opportunities: number;
  earned: number;
  /** Desglose de la ganancia: agentes y tus operaciones (si se conoce). */
  earnedParts?: { agents: number; own: number };
  returnPct: number | null;
  points: { day: string; equity: number }[];
  initial: number;
  intraday?: boolean;
  periods: (Period & { key: T })[];
  period: T;
  onPeriodChange: (period: T) => void;
  refreshing: boolean;
  onRefresh: () => void;
  /** Aclaración de la gráfica: va en el «i» del periodo, no como texto suelto. */
  note: string;
  empty: string;
  setup?: ReactNode;
  /** Desglose por exchange (Mi cartera). */
  venues?: ReactNode;
}) {
  // Saldo = Disponible + Invertido; Invertido = agentes + tus operaciones. Tres cifras, cada una con su desglose.
  const agents = Math.max(0, working - opportunities);
  const parts = (a: number, o: number, signed = false) => {
    const f = (v: number) => `${signed && v >= 0 ? "+" : ""}${eur(v, 2)}`;
    return `Agentes ${f(a)} · Tus operaciones ${f(o)}`;
  };
  const kpis = [
    { icon: Wallet, label: "Disponible", value: available, tip: "Sin repartir: ni en agentes ni en operaciones tuyas", sub: "Sin repartir", result: false },
    { icon: Layers, label: "Invertido", value: working, tip: "Lo que tienen tus agentes más tus operaciones abiertas", sub: parts(agents, opportunities), result: false },
    { icon: TrendingUp, label: "Ganancia o pérdida", value: earned, tip: "Resultado de tus agentes y de tus operaciones, cerradas y abiertas", sub: earnedParts ? parts(earnedParts.agents, earnedParts.own, true) : "", result: true },
  ];

  return (
    <section className={`${card} ${flat} px-4 pb-4 pt-4 sm:px-6 sm:pt-5`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        {!setup && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Actualizar saldo, gráfica y oportunidades"
            aria-label="Actualizar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>
      {setup ?? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-4xl font-bold tracking-tight tabular-nums text-slate-900 sm:text-5xl">{eur(total, 2)}</span>
              {returnPct !== null && <ReturnPill value={returnPct} big />}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {kpis.map((kpi) => (
                <div key={kpi.label} className="rounded-xl bg-slate-50 px-3 py-2.5" title={kpi.tip}>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                    <kpi.icon className={`h-3.5 w-3.5 shrink-0 ${kpi.result ? "text-emerald-600" : "text-blue-600"}`} /> {kpi.label}
                  </div>
                  <div className={`mt-0.5 text-base font-bold tabular-nums sm:text-lg ${kpi.result ? tone(kpi.value) : "text-slate-900"}`}>
                    {kpi.result && kpi.value >= 0 ? "+" : ""}{eur(kpi.value, 2)}
                  </div>
                  {kpi.sub && <div className="mt-0.5 truncate text-[11px] text-slate-500">{kpi.sub}</div>}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Periodo del gráfico" title={note}>
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
          </div>
          <div className="mt-1">
            <EquityChart points={points} initial={initial} height={170} ranges={false} intraday={intraday} balanceOnly flush empty={empty} />
          </div>
          {venues && <div className="mt-4 border-t border-slate-100 pt-3">{venues}</div>}
        </>
      )}
    </section>
  );
}

export function PortfolioColumns({ opportunities, agents }: { opportunities: ReactNode; agents: ReactNode }) {
  // En móvil, tus agentes arriba (gestionar a mano) y la actividad debajo; en escritorio, actividad a la izquierda.
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
      <div className="order-2 flex min-w-0 flex-col lg:order-1">{opportunities}</div>
      <div className="order-1 min-w-0 lg:order-2 lg:self-start">{agents}</div>
    </div>
  );
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
