"use client";
// Agentes: tres gestores de IA con la misma información, distinto carácter y su propia cartera virtual.
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, CheckCircle2, ChevronDown, Copy, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import type { getAgents } from "@/lib/trading/agents/service";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import { api, dayFmt, errorText, eur, eur0, field, ghost, int, panel, pct, primary, th, tone } from "./format";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { EquityCurve } from "./portfolio-panel";
import { Modal, Rich } from "./ui";

type Data = Awaited<ReturnType<typeof getAgents>> & { canManage: boolean; canCopy: boolean };
type Portfolio = Awaited<ReturnType<typeof getPortfolio>>;
type Agent = Data["agents"][number];

const PROFILE_TONE: Record<string, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
};
const HEX: Record<string, string> = { emerald: "#10b981", blue: "#3b82f6", orange: "#f97316" };

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
  const params = useSearchParams();
  const [selected, setSelected] = useState<string>(params.get("agent") ?? "nova");
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
          {data.canManage && (
            <button type="button" className={ghost} disabled={running} onClick={() => void meet(data.agents.map((a) => a.key))}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Reunir a los agentes ahora
            </button>
          )}
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

      {/* Una tarjeta por agente */}
      {bench && (
        <p className="-mb-3 text-xs text-slate-500">
          Desde que empezaron: IBEX 35 <b className={tone(bench.ibexPct)}>{pct(bench.ibexPct)}</b> · Bitcoin <b className={tone(bench.btcPct)}>{pct(bench.btcPct)}</b>
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {ranked.map((a, k) => {
          const open = a.positions.filter((p) => p.status === "abierta").length;
          const pending = a.positions.filter((p) => p.status === "pendiente").length;
          const lastMove = a.proposals.find((p) => p.status === "ejecutada" && p.action !== "vigilar");
          const sel = a.key === agent.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => {
                setSelected(a.key);
                window.history.replaceState(null, "", `/trading/agentes?agent=${a.key}`);
              }}
              className={`${panel} flex flex-col border-t-4 text-left transition-shadow hover:shadow-sm ${sel ? "ring-2 ring-blue-500" : ""}`}
              style={{ borderTopColor: HEX[a.color] }}
            >
              <div className="flex items-start justify-between gap-2 px-4 pt-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-slate-900">{a.name}</span>
                    <span className={`border px-1.5 py-0.5 text-[11px] font-medium ${PROFILE_TONE[a.color]}`}>{a.profile}</span>
                  </div>
                  <p className="mt-1 text-xs leading-snug text-slate-500">{a.tagline}</p>
                </div>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-xs font-semibold text-slate-400">#{k + 1}</span>
                  {a.copyWeightPct !== null && (
                    <span className="inline-flex items-center gap-1 border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                      <Copy className="h-3 w-3" /> copias {a.copyWeightPct} %
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2 px-4">
                <span className={`text-2xl font-semibold tabular-nums ${tone(a.summary.returnPct)}`}>{pct(a.summary.returnPct)}</span>
                <span className="text-sm tabular-nums text-slate-500">{eur0(a.summary.equity)}</span>
              </div>
              <div className="px-1">
                <EquityCurve points={a.equity} initial={a.summary.initialCapital} height={70} empty="La línea aparece tras su primera sesión." />
              </div>
              <div className="mt-auto border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
                <div>
                  {open} abiertas{pending ? ` · ${pending} pendientes` : ""} · {a.summary.stats.closed} cerradas
                  {a.summary.stats.closed ? ` · acierto ${Math.round(a.summary.stats.winRate * 100)} %` : ""}
                </div>
                <div className="mt-0.5 truncate text-slate-500">
                  {lastMove ? `Último: ${ACTION[lastMove.action] ?? lastMove.action} ${lastMove.name}` : a.lastRun ? "Aún no ha operado" : "Aún no se ha reunido"}
                  {a.lastRun ? ` · reunión ${when(a.lastRun.at)}` : ""}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Ficha del agente */}
      <AgentDetail
        key={agent.key}
        agent={agent}
        canManage={data.canManage}
        canCopy={data.canCopy}
        busy={running}
        onMeet={() => void meet([agent.key])}
        onReset={() => void reset(agent)}
      />
    </div>
  );
}

function AgentDetail({
  agent: a,
  canManage,
  canCopy,
  busy,
  onMeet,
  onReset,
}: {
  agent: Agent;
  canManage: boolean;
  canCopy: boolean;
  busy: boolean;
  onMeet: () => void;
  onReset: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [copying, setCopying] = useState(false);
  const lastRunId = a.lastRun?.id;
  const latest = a.proposals.filter((p) => p.runId === lastRunId);
  const older = a.proposals.filter((p) => p.runId !== lastRunId && p.status !== "rechazada" && p.action !== "vigilar");
  const s = a.summary;
  const pendingIds = new Set(a.positions.filter((p) => p.status === "pendiente").map((p) => p.id));

  return (
    <section className={`${panel} border-t-4`} style={{ borderTopColor: HEX[a.color] }}>
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
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={!canCopy} onClick={() => setCopying(true)}>
            <Copy className="h-4 w-4" /> {a.copyWeightPct !== null ? `Lo copias con el ${a.copyWeightPct} % · cambiar` : `Copiar a ${a.name}`}
          </button>
          {canManage && (
            <>
              <button type="button" className={ghost} disabled={busy} onClick={onMeet}>
                <Play className="h-4 w-4" /> Reunir solo a {a.name}
              </button>
              <button type="button" className={ghost} disabled={busy} onClick={onReset} title="Borrar sus operaciones y empezar de cero">
                <RotateCcw className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        {copying && <CopyModal agent={a} onClose={() => setCopying(false)} />}
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

      <div className="border-b border-slate-100 px-2 py-2">
        <EquityCurve points={a.equity} initial={s.initialCapital} height={160} empty="Su gráfico se dibuja con el cierre de cada sesión desde que empezó." />
      </div>
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

function CopyModal({ agent: a, onClose }: { agent: Agent; onClose: () => void }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [weight, setWeight] = useState(String(a.copyWeightPct ?? 25));
  const [mirror, setMirror] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    api<Portfolio>("portfolio").then(setPortfolio, (e) => setError(errorText(e)));
  }, []);
  const active = a.copyWeightPct !== null;
  const w = Number(weight.replace(",", "."));
  const others = portfolio ? portfolio.copies.filter((c) => c.agent !== a.key).reduce((s, c) => s + c.weightPct, 0) : 0;
  const amount = portfolio ? (portfolio.total.equity * (w || 0)) / 100 : 0;
  const valid = w >= 1 && w <= 100 - others;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ weight: number; mirrored: number }>("copy/set", { agent: a.key, weightPct: w, mirror });
      setDone(
        active
          ? `Ahora copias a ${a.name} con el ${r.weight} % de tu patrimonio.`
          : `Ya copias a ${a.name}.${r.mirrored ? ` Se han replicado ${r.mirrored} ${r.mirrored === 1 ? "posición" : "posiciones"} suyas.` : ""} A partir de ahora harás lo mismo que él, en proporción.`,
      );
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const stop = async () => {
    if (!window.confirm(`¿Dejar de copiar a ${a.name}? Se venden sus posiciones en tu copia al último precio y el dinero vuelve a tu cartera.`)) return;
    setSaving(true);
    try {
      await api("copy/stop", { agent: a.key });
      setDone(`Has dejado de copiar a ${a.name}. El dinero ha vuelto a tu cartera.`);
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={active ? `Copia de ${a.name}` : `Copiar a ${a.name}`}
      subtitle={`Perfil ${a.profile}`}
      footer={
        done ? (
          <button type="button" className={primary} onClick={onClose}>
            Hecho
          </button>
        ) : (
          <>
            {active && (
              <button type="button" className={`${ghost} mr-auto text-red-700`} disabled={saving} onClick={() => void stop()}>
                Dejar de copiar
              </button>
            )}
            <button type="button" className={ghost} onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className={primary} disabled={!valid || saving || !portfolio?.opened} onClick={() => void save()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {active ? "Guardar" : "Empezar a copiar"}
            </button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm text-slate-700">{done}</p>
      ) : !portfolio ? (
        error ? <p className="text-sm text-red-700">{error}</p> : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : !portfolio.opened ? (
        <p className="text-sm text-slate-700">Primero abre tu cuenta en Inicio y elige con cuánto dinero empiezas.</p>
      ) : (
        <div className="space-y-4 text-sm text-slate-700">
          <p>
            Asignas una parte de tu patrimonio a {a.name}. Con ese dinero, la app hace <b>exactamente lo que haga él, en proporción</b>: si mete el 20 % de
            su cartera en Repsol, tú metes el 20 % de tu parte. Si vende, vendes; si sube el stop, lo subes.
          </p>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">¿Qué parte de tu patrimonio le das?</span>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={Math.max(1, 100 - others)}
                value={Number.isFinite(w) ? w : 1}
                onChange={(e) => setWeight(e.target.value)}
                className="flex-1"
                aria-label="Peso de la copia"
              />
              <input className={`${field} w-20 text-right tabular-nums`} value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Peso en %" />
              <span>%</span>
            </div>
          </label>
          <p className="border border-slate-200 bg-slate-50 px-3 py-2">
            Son unos <b>{eur0(amount)}</b> de tus {eur0(portfolio.total.equity)}.{" "}
            {others > 0 && `Ya tienes el ${others} % en otras copias; el máximo aquí es ${100 - others} %. `}
            Solo se mueve dinero que tengas en efectivo: si está invertido, la copia empieza con lo que haya libre.
          </p>
          {!valid && <p className="text-xs text-amber-700">Elige entre 1 % y {100 - others} %.</p>}
          {!active && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
              <span>
                <b>Igualar su cartera ahora</b>: compra en proporción lo que {a.name} ya tiene ({a.positions.length}{" "}
                {a.positions.length === 1 ? "posición" : "posiciones"}). Si no, solo copias lo que haga a partir de hoy.
              </span>
            </label>
          )}
          <p className="text-xs text-slate-500">Se usan fracciones de acción, como en Trading 212, para que la proporción sea exacta aunque la cantidad sea pequeña.</p>
          {error && <p className="text-red-700">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
