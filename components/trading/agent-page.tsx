"use client";
// Página de un agente: su gráfica arriba, sus datos y, en pestañas, lo que tiene abierto, su historial,
// sus decisiones y (kamikazes) sus rondas. Para cualquier público: todo explicado sin jerga.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Wallet } from "lucide-react";
import { api, dayFmt, errorText, eur, eur0, ghost, int, pct, primary, tone } from "./format";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { EquityChart, withLivePoint } from "./equity-chart";
import { AgentAvatar, cap, card, ErrorNote, LoadingCard, Pill, ReturnPill, Rich } from "./ui";
import { AssetIcon } from "./asset-icon";
import { MirrorModal } from "./mirror-modal";
import { agentMenu, ChipMode, CopyBadges, CopyModal, Creator, Decision, DotsMenu, Rounds, runningFor, when, type Agent, type Data } from "./agents-panel";

type Tab = "abiertas" | "historial" | "decisiones" | "rondas";

/** Mayor caída desde un máximo, en % (sobre la curva de patrimonio). */
function maxDrawdown(points: { equity: number }[]) {
  let peak = -Infinity;
  let worst = 0;
  for (const p of points) {
    peak = Math.max(peak, p.equity);
    if (peak > 0) worst = Math.min(worst, ((p.equity - peak) / peak) * 100);
  }
  return worst;
}

export function AgentPage({ agentKey }: { agentKey: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("abiertas");
  const [copying, setCopying] = useState(false);
  const [mirroring, setMirroring] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const a = data?.agents.find((x) => x.key === agentKey) ?? null;
  const points = useMemo(() => (a ? withLivePoint(a.equity, a.summary.equity) : []), [a]);

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard height="h-96" />;
  if (!a) return <ErrorNote>Este agente no existe o ya no está disponible.</ErrorNote>;

  const s = a.summary;
  const rank = [...data.agents].sort((x, y) => y.summary.returnPct - x.summary.returnPct).findIndex((x) => x.key === a.key) + 1;
  const open = a.positions.filter((p) => p.status === "abierta").length;
  const pending = a.positions.filter((p) => p.status === "pendiente").length;
  const dd = maxDrawdown(points);

  const meet = async () => {
    setBusy(true);
    try {
      await api("agents/run", { agent: a.key });
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!window.confirm(`¿Reiniciar ${a.name}? Se borran sus operaciones y vuelve a empezar con ${eur0(s.initialCapital)}.`)) return;
    try {
      await api("agents/reset", { agent: a.key });
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "abiertas", label: "Abiertas", count: a.positions.length },
    { key: "historial", label: "Historial", count: a.closed.length },
    ...(a.kamikaze ? [{ key: "rondas" as const, label: "Rondas", count: a.kamikaze.stats.rounds }] : [{ key: "decisiones" as const, label: "Decisiones", count: a.proposals.length }]),
  ];
  const lastRunId = a.lastRun?.id;
  const pendingIds = new Set(a.positions.filter((p) => p.status === "pendiente").map((p) => p.id));

  return (
    <div className="grid gap-5 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      {/* Izquierda: quién es, su gráfica y sus números */}
      <div className="flex min-w-0 flex-col gap-5 xl:min-h-0 xl:overflow-y-auto">
        {error && <ErrorNote>{error}</ErrorNote>}
        <section className={`${card} px-6 py-5`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <AgentAvatar color={a.color} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">{a.name}</h2>
                  <Pill color={a.color}>{cap(a.profile)}</Pill>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                    #{rank} de {data.agents.length}
                  </span>
                </div>
                <p className="mt-1 max-w-xl text-sm text-slate-600">{a.tagline}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Creator /> · {runningFor(a.startedAt)}
                  {a.lastRun && <> · última decisión {when(a.lastRun.at)}</>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data.canCopy && !a.kamikaze && (
                <button type="button" className={primary} onClick={() => setCopying(true)}>
                  <Copy className="h-4 w-4" /> {a.copyWeightPct !== null ? "Cambiar copia" : "Copiar"}
                </button>
              )}
              {data.canCopy && (
                <button type="button" className={a.kamikaze ? primary : ghost} onClick={() => setMirroring(true)}>
                  <Wallet className="h-4 w-4" /> Dinero real
                </button>
              )}
              <DotsMenu
                label={`Más acciones de ${a.name}`}
                items={agentMenu(a, {
                  canManage: data.canManage && !busy,
                  canCopy: data.canCopy,
                  onCopy: () => setCopying(true),
                  onMirror: () => setMirroring(true),
                  onMeet: () => void meet(),
                  onReset: () => void reset(),
                })}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <span className="text-4xl font-bold tracking-tight tabular-nums text-slate-900">{eur0(s.equity)}</span>
            <ReturnPill value={s.returnPct} big />
            <ChipMode a={a} big />
            <span className="pb-1 text-sm text-slate-500">desde {eur0(s.initialCapital)}</span>
          </div>
          <div className="mt-3">
            <EquityChart points={points} initial={s.initialCapital} height={240} empty="Su gráfica se dibuja con el cierre de cada sesión desde que empezó." />
          </div>
          {(a.copyWeightPct !== null || a.mirror) && (
            <div className="mt-3">
              <CopyBadges a={a} />
            </div>
          )}
        </section>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ["Efectivo", eur0(s.cash), "sin invertir"],
            ["Posiciones", `${open}${pending ? ` + ${pending}` : ""}`, pending ? "abiertas + pendientes" : "abiertas"],
            ["Operaciones", int(s.stats.closed), "cerradas"],
            ["Acierto", s.stats.closed ? `${Math.round(s.stats.winRate * 100)} %` : "—", s.stats.closed ? `${s.stats.wins} de ${s.stats.closed} con ganancia` : "aún sin cerradas"],
            ["Peor caída", dd < -0.05 ? pct(dd) : "—", "desde su máximo"],
            ["Mejor / peor", s.stats.closed ? `${eur(s.stats.bestTrade, 2)}` : "—", s.stats.closed ? `peor ${eur(s.stats.worstTrade, 2)}` : "por operación"],
          ].map(([label, value, sub]) => (
            <div key={label} className={`${card} px-4 py-3`}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</dd>
              <dd className="text-[11px] text-slate-400">{sub}</dd>
            </div>
          ))}
        </dl>

        {a.chip && (
          <section className={`${card} px-5 py-4 text-sm`}>
            <div className="mb-2 text-xs font-semibold text-slate-500">Su detector: ataca solo si se cumplen las tres</div>
            <ul className="space-y-1.5">
              {a.chip.checks.map((c) => (
                <li key={c.text} className="flex items-start gap-2">
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${c.ok ? "bg-emerald-500" : "bg-slate-300"}`}>
                    {c.ok ? "✓" : "✗"}
                  </span>
                  <span className={c.ok ? "text-slate-800" : "text-slate-500"}>{c.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              En ataque compra las crypto que superan su máximo de 20 días (hasta 3) y las vende si pierden su mínimo de 10. En defensa, todo en efectivo.
              Decide una vez al día con el cierre de ayer.
            </p>
          </section>
        )}
        {(a.lastRun?.marketView || a.kamikaze?.current?.note) && (
          <section className={`${card} px-5 py-4 text-sm leading-relaxed text-slate-700`}>
            <div className="mb-1 text-xs font-semibold text-slate-500">Cómo ve el mercado</div>
            <Rich text={a.lastRun?.marketView ?? a.kamikaze?.current?.note ?? ""} />
          </section>
        )}
        {a.lastRun?.status === "error" && <ErrorNote>La última reunión falló: {a.lastRun.error}</ErrorNote>}
      </div>

      {/* Derecha: lo que tiene, lo que hizo y lo que decidió */}
      <section className={`${card} flex min-w-0 flex-col overflow-hidden xl:min-h-0`}>
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-3 [scrollbar-width:none]" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 border-b-2 px-3 pb-2.5 text-sm font-medium ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {t.label}
              {t.count ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">{t.count}</span> : null}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "abiertas" &&
            (a.positions.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Ahora mismo no tiene nada: todo en efectivo.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {a.positions.map((p) => (
                  <li key={p.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <AssetIcon symbol={p.symbol} name={p.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900">{p.name}</span>
                          <span className="block text-xs text-slate-500">
                            {p.status === "pendiente" ? "Se compra en la próxima apertura" : `${int(p.quantity)} a ${eur(p.entryPrice ?? p.plannedEntry)}`}
                          </span>
                        </span>
                      </span>
                      <span className="text-right">
                        <span className={`block font-semibold tabular-nums ${tone(p.unrealized)}`}>{p.unrealized === null ? "—" : `${p.unrealized >= 0 ? "+" : ""}${eur(p.unrealized, 2)}`}</span>
                        <span className="block text-xs tabular-nums text-slate-500">ahora {eur(p.lastPrice)}</span>
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] tabular-nums">
                      <span className="text-red-700">Stop {eur(p.stop)}</span>
                      <span className="text-emerald-700">Objetivo {eur(p.target)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ))}

          {tab === "historial" &&
            (a.closed.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Todavía no ha cerrado ninguna operación.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {a.closed.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <AssetIcon symbol={p.symbol} name={p.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{p.name}</span>
                        <span className="block text-xs text-slate-500">
                          {dayFmt(p.exitDay)} · {p.exitReason ?? "cerrada"} · {eur(p.entryPrice)} → {eur(p.exitPrice)}
                        </span>
                      </span>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${tone(p.pnl)}`}>
                      {(p.pnl ?? 0) >= 0 ? "+" : ""}
                      {eur(p.pnl, 2)}
                    </span>
                  </li>
                ))}
              </ul>
            ))}

          {tab === "decisiones" &&
            (a.proposals.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Todavía no se ha reunido.</p>
            ) : (
              <ul className="divide-y divide-slate-100 px-5">
                {a.proposals
                  .filter((p) => p.runId === lastRunId || (p.status !== "rechazada" && p.action !== "vigilar"))
                  .map((p) => (
                    <Decision key={p.id} p={p} pending={!!p.positionId && pendingIds.has(p.positionId)} />
                  ))}
              </ul>
            ))}

          {tab === "rondas" && a.kamikaze && <Rounds k={a.kamikaze} equity={s.equity} />}
        </div>
      </section>

      {copying && <CopyModal agent={a as Agent} onClose={() => setCopying(false)} />}
      {mirroring && <MirrorModal agent={a.key} name={a.name} onClose={() => setMirroring(false)} />}
    </div>
  );
}
