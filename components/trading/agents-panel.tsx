"use client";
// Agentes: tres gestores de IA con la misma información, distinto carácter y su propia cartera virtual.
import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, ChevronDown, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import type { getAgents } from "@/lib/trading/agents/service";
import { api, dayFmt, errorText, eur, eur0, ghost, int, panel, pct, primary, th, tone } from "./format";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { Rich } from "./ui";

type Data = Awaited<ReturnType<typeof getAgents>> & { canManage: boolean };
type Agent = Data["agents"][number];

const PROFILE_TONE: Record<string, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
};
const BAR: Record<string, string> = { emerald: "bg-emerald-500", blue: "bg-blue-500", orange: "bg-orange-500" };

const ACTION: Record<string, string> = { comprar: "Compra", vender: "Venta", mantener: "Mantener", vigilar: "Vigilar" };
const STATUS: Record<string, { label: string; tone: string }> = {
  ejecutada: { label: "Ejecutada", tone: "text-emerald-700" },
  propuesta: { label: "Pendiente", tone: "text-slate-600" },
  descartada: { label: "No se ejecutó", tone: "text-amber-700" },
  rechazada: { label: "Frenada por las reglas", tone: "text-red-700" },
};

const when = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso))
    : "Nunca";

type RunState = Record<string, { state: "esperando" | "reunido" | "ok" | "error"; detail?: string }>;

export function AgentsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("nova");
  const [run, setRun] = useState<RunState | null>(null);
  const running = !!run && Object.values(run).some((r) => r.state === "esperando" || r.state === "reunido");

  const load = useCallback(async () => {
    try {
      setData(await api<Data>("agents"));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  // Una petición por agente (cada reunión tarda hasta un minuto).
  const meet = async (keys: string[]) => {
    const initial: RunState = Object.fromEntries(keys.map((k) => [k, { state: "esperando" as const }]));
    setRun(initial);
    for (const key of keys) {
      setRun((r) => ({ ...r, [key]: { state: "reunido" } }));
      try {
        const res = await api<{ auto: { symbol: string; ok: boolean; detail: string }[] }>("agents/run", { agent: key });
        const done = res.auto.filter((a) => a.ok).length;
        setRun((r) => ({ ...r, [key]: { state: "ok", detail: done ? `${done} ${done === 1 ? "orden" : "órdenes"}` : "sin operaciones" } }));
      } catch (e) {
        setRun((r) => ({ ...r, [key]: { state: "error", detail: errorText(e) } }));
      }
    }
    refreshTrading();
  };

  const reset = async (a: Agent) => {
    if (!window.confirm(`¿Reiniciar ${a.name}? Se borran sus operaciones y vuelve a empezar con ${eur0(a.summary.initialCapital)}.`)) return;
    try {
      await api("agents/reset", { agent: a.key });
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!data) return error ? <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;

  const ranked = [...data.agents].sort((a, b) => b.summary.returnPct - a.summary.returnPct);
  const agent = data.agents.find((a) => a.key === selected) ?? data.agents[0];
  const bench = data.agents[0]?.benchmark;

  return (
    <div className="space-y-6">
      <section className={`${panel} px-5 py-4`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="flex max-w-2xl items-start gap-2 text-sm text-slate-600">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <span>
              Todos ven <b>la misma información</b> (cotizaciones, figuras, fuerza relativa y noticias) y cada uno decide con{" "}
              <b>su carácter</b>, con {eur0(data.agents[0]?.summary.initialCapital)} virtuales. Se reúnen solos cada día laborable a las 19:15.
            </span>
          </p>
          <button type="button" className={primary} disabled={!data.canManage || running} onClick={() => void meet(data.agents.map((a) => a.key))}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Reunir a los agentes ahora
          </button>
        </div>
        {run && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-sm">
            {data.agents
              .filter((a) => run[a.key])
              .map((a) => {
                const r = run[a.key];
                return (
                  <li key={a.key} className="flex items-center gap-1.5">
                    {r.state === "ok" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : r.state === "error" ? (
                      <XCircle className="h-4 w-4 text-red-600" />
                    ) : r.state === "reunido" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    ) : (
                      <span className="h-4 w-4 border border-slate-300" />
                    )}
                    <b className="font-semibold text-slate-900">{a.name}</b>
                    <span className={r.state === "error" ? "text-red-700" : "text-slate-500"}>
                      {r.state === "reunido" ? "reunido…" : r.state === "esperando" ? "en espera" : r.detail}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {error && <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Clasificación */}
      <section className={panel}>
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Clasificación</h2>
          {bench && (
            <span className="text-xs text-slate-500">
              En el mismo periodo: IBEX 35 <b className={tone(bench.ibexPct)}>{pct(bench.ibexPct)}</b> · Bitcoin{" "}
              <b className={tone(bench.btcPct)}>{pct(bench.btcPct)}</b>
            </span>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Agente</th>
                <th className={`${th} text-right`}>Patrimonio</th>
                <th className={`${th} text-right`}>Rentabilidad</th>
                <th className={`${th} text-right`}>Invertido</th>
                <th className={`${th} text-right`}>Operaciones</th>
                <th className={th}>Última reunión</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((a, k) => {
                const investedPct = a.summary.equity > 0 ? (a.summary.invested / a.summary.equity) * 100 : 0;
                return (
                  <tr
                    key={a.key}
                    onClick={() => setSelected(a.key)}
                    className={`cursor-pointer border-t border-slate-100 ${a.key === agent.key ? "bg-blue-50/50" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-3 py-3 font-semibold tabular-nums text-slate-500">{k + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 ${BAR[a.color]}`} />
                        <span className="font-semibold text-slate-900">{a.name}</span>
                        <span className={`border px-1.5 py-0.5 text-xs font-medium ${PROFILE_TONE[a.color]}`}>{a.profile}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">{eur0(a.summary.equity)}</td>
                    <td className={`px-3 py-3 text-right font-semibold tabular-nums ${tone(a.summary.returnPct)}`}>{pct(a.summary.returnPct)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">{pct(investedPct, 0, false)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                      {[
                        `${a.positions.filter((p) => p.status === "abierta").length} abiertas`,
                        ...(a.positions.some((p) => p.status === "pendiente") ? [`${a.positions.filter((p) => p.status === "pendiente").length} pendientes`] : []),
                        `${a.summary.stats.closed} cerradas`,
                      ].join(" · ")}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {when(a.lastRun?.at)}
                      {a.lastRun?.status === "error" && <span className="ml-1 text-xs text-red-700">(falló)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ficha del agente */}
      <AgentDetail key={agent.key} agent={agent} canManage={data.canManage} busy={running} onMeet={() => void meet([agent.key])} onReset={() => void reset(agent)} />
    </div>
  );
}

function AgentDetail({ agent: a, canManage, busy, onMeet, onReset }: { agent: Agent; canManage: boolean; busy: boolean; onMeet: () => void; onReset: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const lastRunId = a.lastRun?.id;
  const latest = a.proposals.filter((p) => p.runId === lastRunId);
  const older = a.proposals.filter((p) => p.runId !== lastRunId && p.status !== "rechazada" && p.action !== "vigilar");
  const s = a.summary;
  const pendingIds = new Set(a.positions.filter((p) => p.status === "pendiente").map((p) => p.id));

  return (
    <section className={`${panel} border-t-4`} style={{ borderTopColor: a.color === "emerald" ? "#10b981" : a.color === "blue" ? "#3b82f6" : "#f97316" }}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            {a.name} <span className={`border px-1.5 py-0.5 text-xs font-medium ${PROFILE_TONE[a.color]}`}>{a.profile}</span>
          </h2>
          <p className="mt-1 text-sm text-slate-600">{a.tagline}</p>
          <p className="mt-2 text-xs text-slate-500">
            Arriesga {pct(a.settings.riskPerTradePct, 1, false)} del patrimonio por operación · como mucho {pct(a.settings.maxPositionPct, 0, false)} en un
            valor · hasta {a.settings.maxOpenPositions} posiciones · {a.rules.maxBuys} {a.rules.maxBuys === 1 ? "compra" : "compras"} por reunión ·
            convicción mínima {a.rules.minConviction} de 5 · {a.rules.buyInBearMarket ? "puede comprar con el mercado bajista" : "no compra con el mercado bajista"}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={ghost} disabled={!canManage || busy} onClick={onMeet}>
            <Play className="h-4 w-4" /> Reunir solo a {a.name}
          </button>
          <button type="button" className={ghost} disabled={!canManage || busy} onClick={onReset} title="Borrar sus operaciones y empezar de cero">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-100 sm:grid-cols-4">
        {[
          ["Patrimonio", eur0(s.equity), ""],
          ["Rentabilidad", pct(s.returnPct), tone(s.returnPct)],
          ["Efectivo", eur0(s.cash), ""],
          ["Acierto", s.stats.closed ? `${Math.round(s.stats.winRate * 100)} % de ${s.stats.closed}` : "—", ""],
        ].map(([label, value, cls]) => (
          <div key={label} className="bg-white px-4 py-3">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className={`text-lg font-semibold tabular-nums text-slate-900 ${cls}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {a.lastRun?.marketView && (
        <div className="border-b border-slate-100 px-5 py-3 text-sm leading-relaxed text-slate-700">
          <div className="mb-1 text-xs font-medium text-slate-500">Cómo ve el mercado ({when(a.lastRun.at)})</div>
          <Rich text={a.lastRun.marketView} />
        </div>
      )}
      {a.lastRun?.status === "error" && <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">La última reunión falló: {a.lastRun.error}</p>}

      {/* Cartera */}
      <div className="border-b border-slate-100">
        <h3 className="px-5 pt-4 text-sm font-semibold text-slate-900">Su cartera</h3>
        {a.positions.length === 0 ? (
          <p className="px-5 pb-4 pt-1 text-sm text-slate-500">Todo en efectivo.</p>
        ) : (
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Valor</th>
                  <th className={`${th} text-right`}>Cantidad</th>
                  <th className={`${th} text-right`}>Entrada</th>
                  <th className={`${th} text-right`}>Ahora</th>
                  <th className={`${th} text-right`}>Resultado</th>
                  <th className={`${th} text-right`}>Stop</th>
                  <th className={`${th} text-right`}>Objetivo</th>
                </tr>
              </thead>
              <tbody>
                {a.positions.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      {p.status === "pendiente" && <div className="text-xs text-amber-700">Se compra en la próxima apertura</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(p.quantity)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{eur(p.entryPrice ?? p.plannedEntry)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{eur(p.lastPrice)}</td>
                    <td className={`px-3 py-2 text-right font-medium tabular-nums ${tone(p.unrealized)}`}>{p.unrealized === null ? "—" : eur0(p.unrealized)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700">{eur(p.stop)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{eur(p.target)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decisiones */}
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900">Qué decidió en su última reunión</h3>
        {latest.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">{a.lastRun ? "No propuso nada: prefirió esperar." : "Todavía no se ha reunido. Pulsa «Reunir» para su primera reunión."}</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {latest.map((p) => (
              <Decision key={p.id} p={p} pending={!!p.positionId && pendingIds.has(p.positionId)} />
            ))}
          </ul>
        )}
        {older.length > 0 && (
          <>
            <button type="button" onClick={() => setShowAll(!showAll)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} /> Decisiones anteriores ({older.length})
            </button>
            {showAll && (
              <ul className="mt-2 divide-y divide-slate-100">
                {older.map((p) => (
                  <Decision key={p.id} p={p} pending={!!p.positionId && pendingIds.has(p.positionId)} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Cerradas */}
      {a.closed.length > 0 && (
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Operaciones cerradas</h3>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {a.closed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="text-slate-700">
                  {p.name} <span className="text-xs text-slate-500">· {dayFmt(p.exitDay)} · {p.exitReason}</span>
                </span>
                <span className={`font-medium tabular-nums ${tone(p.pnl)}`}>{eur0(p.pnl)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Decision({ p, pending }: { p: Agent["proposals"][number]; pending: boolean }) {
  const st = pending ? { label: "Orden puesta", tone: "text-amber-700" } : STATUS[p.status] ?? STATUS.propuesta;
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm">
          <b className="font-semibold text-slate-900">
            {ACTION[p.action] ?? p.action} {p.name}
          </b>
          {p.action === "comprar" && p.stop && p.target && (
            <span className="ml-2 text-xs text-slate-500">
              stop {eur(p.stop)} · objetivo {eur(p.target)}
              {p.quantity ? ` · ${int(p.quantity)} ${p.market === "crypto" ? p.symbol.replace(/-EUR$/, "") : "acciones"}` : ""}
            </span>
          )}
        </span>
        <span className={`text-xs font-medium ${st.tone}`}>
          {st.label} · convicción {p.conviction}/5
        </span>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        <Rich text={p.rationale} />
      </p>
      {p.rejection && <p className="mt-0.5 text-xs text-slate-500">{p.rejection}</p>}
    </li>
  );
}
