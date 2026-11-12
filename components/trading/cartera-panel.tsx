"use client";
// Mi cartera: tu dinero real, trabajando con tus agentes (operarios que trabajan para ti).
// Arriba: saldo, evolución y en qué está tu dinero. Debajo: tus agentes (le diste → ahora tiene)
// y, a la derecha, el elegido con sus últimas órdenes y «Gestionar» (añadir, retirar, cerrar, despedir).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Clock, Crosshair, Layers, Link2, Loader2, Minus, Pause, Play, Plus, Shield, Trash2, TrendingUp, Users, Wallet } from "lucide-react";
import type { getWallets, myAgents } from "@/lib/trading/wallets";
import type { mirrorView } from "@/lib/trading/mirror/service";
import type { manualView } from "@/lib/trading/manual/service";
import { api, errorText, eur, field, primary, tone } from "./format";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { AgentAvatar, card, ErrorNote, LoadingCard, Modal, ReturnPill } from "./ui";
import { EquityChart } from "./equity-chart";
import type { Agent, Data as AgentsData } from "./agents-panel";

type Wallets = Awaited<ReturnType<typeof getWallets>>;
type Mine = Awaited<ReturnType<typeof myAgents>>;
type Mirrors = Awaited<ReturnType<typeof mirrorView>> & { canManage: boolean };
type Mirror = Mirrors["mirrors"][number];
type Manual = Awaited<ReturnType<typeof manualView>>;
type Row = { key: string; agent: Agent | null; mirror: Mirror | null; mine: boolean };

const HOLDING = ["abriendo", "abierta", "vendiendo"];
const coin = (s: string) => s.replace(/-EUR$/, "");
const signed = (v: number) => `${v >= 0 ? "+" : ""}${eur(v, 2)}`;
const pctText = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  if (m < 48 * 60) return `hace ${Math.round(m / 60)} h`;
  return `hace ${Math.round(m / 1440)} d`;
};

/** Lo tuyo con un agente: le diste, resultado (cerrado + abierto) y lo que tiene ahora. */
function money(m: Mirror | null) {
  if (!m) return null;
  const result = m.result + (m.unrealized ?? 0);
  return { given: m.budget, result, now: m.budget + result, pct: m.budget > 0 ? (result / m.budget) * 100 : 0, test: m.mode !== "real" };
}

/** Qué está haciendo, en pocas palabras y con su icono. */
function statusOf(r: Row) {
  const open = r.mirror?.legs.filter((l) => HOLDING.includes(l.status) && l.mode === r.mirror?.mode) ?? [];
  if (r.mirror?.paused) return { icon: Pause, text: open.length ? `En pausa · aún tiene ${open.map((l) => coin(l.symbol)).join(", ")}` : "En pausa · no compra nada nuevo" };
  if (open.length) return { icon: Play, text: `Trabajando · tiene ${open.map((l) => coin(l.symbol)).join(", ")}` };
  if (r.agent?.chip?.mode === "defensa") return { icon: Shield, text: "En defensa · efectivo" };
  if (!r.mirror) return { icon: Pause, text: "Sin dinero tuyo" };
  return { icon: Clock, text: "Esperando · efectivo" };
}

export function CarteraPanel() {
  const [wallets, setWallets] = useState<Wallets | null>(null);
  const [mirrors, setMirrors] = useState<Mirrors | null>(null);
  const [agents, setAgents] = useState<AgentsData | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [manual, setManual] = useState<Manual | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [managing, setManaging] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"24h" | "7d">("24h");

  const load = useCallback(async () => {
    try {
      const [w, m, a, o] = await Promise.all([api<Wallets>("wallets?history=1"), api<Mirrors>("mirror"), api<AgentsData>("agents"), api<Mine>("mine")]);
      setWallets(w);
      setMirrors(m);
      setAgents(a);
      setMine(o);
      setError(null);
      // Mis operaciones: si falta la tabla (migración sin pasar), la pantalla sigue funcionando.
      api<Manual>("manual").then(setManual, () => setManual(null));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);
  // Mientras esta página esté abierta, refrescar el saldo y registrar una muestra cada ~5 minutos.
  useEffect(() => {
    const interval = window.setInterval(() => { void load(); }, 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const removeAgent = async (key: string, name: string) => {
    if (!window.confirm(`¿Quitar a ${name} de tus agentes? Seguirá en la plataforma y podrás volver a añadirlo.`)) return;
    setRemoving(key);
    try {
      await api("mine/remove", { agent: key });
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRemoving(null);
    }
  };

  const rows: Row[] = useMemo(() => {
    if (!agents || !mirrors || !mine) return [];
    const mirrorOf = (k: string) => mirrors.mirrors.find((m) => m.agent === k && m.active) ?? null;
    const own = mine.owned.map((k) => ({ key: k, agent: agents.agents.find((a) => a.key === k) ?? null, mirror: mirrorOf(k), mine: true }));
    const others = mirrors.mirrors
      .filter((m) => m.active && !mine.owned.includes(m.agent))
      .map((m) => ({ key: m.agent, agent: agents.agents.find((a) => a.key === m.agent) ?? null, mirror: m, mine: false }));
    return [...own, ...others];
  }, [agents, mirrors, mine]);

  if (!wallets || !mirrors || !agents || !mine) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard height="h-96" />;

  const real = wallets.items.filter((w) => w.environment === "real" && w.total !== null && w.currency === "EUR");
  const total = real.reduce((s, w) => s + (w.total ?? 0), 0);
  const realRows = rows.filter((r) => r.mirror && r.mirror.mode === "real");
  const working = Math.min(total, realRows.reduce((s, r) => s + (money(r.mirror)?.now ?? 0), 0) + (manual?.working ?? 0));
  const earned = realRows.reduce((s, r) => s + (money(r.mirror)?.result ?? 0), 0);
  const free = Math.max(0, total - working);
  const earnedBase = realRows.reduce((s, r) => s + (r.mirror?.budget ?? 0), 0);
  const operating = wallets.items.find((w) => w.operating) ?? wallets.items[0] ?? null;
  const current = rows.find((r) => r.key === selected) ?? rows[0] ?? null;
  const cutoff = Date.now() - (chartPeriod === "24h" ? 1 : 7) * 86_400_000;
  const recent = wallets.history.filter((p) => new Date(p.day).getTime() >= cutoff);
  const hasIntraday = recent.length >= 2;
  const graphPoints = hasIntraday ? recent : mine.history;

  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}
      {mirrors.real.problem && wallets.items.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {mirrors.real.problem}.{" "}
          <Link href="/trading/integraciones" className="font-semibold underline">
            Revisar
          </Link>
        </p>
      )}

      {/* Cabecera */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className={`${card} px-6 pb-3 pt-5`}>
          <div className="flex items-center gap-3 text-[15px] font-medium text-slate-800">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Wallet className="h-5 w-5" />
            </span>
            Tu dinero real{operating ? ` · ${operating.name}` : ""}
          </div>
          {wallets.items.length === 0 ? (
            <div className="py-6">
              <p className="text-sm text-slate-600">Conecta tu exchange para que tus agentes trabajen con tu dinero.</p>
              <Link href="/trading/integraciones" className={`${primary} mt-3`}>
                <Link2 className="h-4 w-4" /> Conectar exchange
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-5xl font-bold tracking-tight tabular-nums text-slate-900">{eur(total, 2)}</span>
                {earnedBase > 0 && <ReturnPill value={(earned / earnedBase) * 100} big />}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">Evolución de tu saldo real · cada 5 min</span>
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Periodo del gráfico">
                  {(["24h", "7d"] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      aria-pressed={chartPeriod === period}
                      onClick={() => setChartPeriod(period)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${chartPeriod === period ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                    >
                      {period === "24h" ? "24 h" : "7 días"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-1">
                <EquityChart
                  points={graphPoints}
                  initial={graphPoints[0]?.equity ?? total}
                  height={145}
                  ranges={false}
                  intraday={hasIntraday}
                  balanceOnly
                  empty="La gráfica se completará tras la segunda lectura de saldo (aprox. 5 minutos)."
                />
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-400">
                {hasIntraday
                  ? "Saldo valorado en EUR; las aportaciones y retiradas también cambian la curva. Se actualiza mientras Trading esté abierto."
                  : "De momento se muestra el histórico diario. Las lecturas de cinco minutos se irán añadiendo mientras Trading esté abierto."}
              </p>
            </>
          )}
        </section>

        <section className={`${card} flex flex-col justify-center divide-y divide-slate-100 px-6 py-2`}>
          {[
            { icon: Layers, label: "Trabajando para ti", value: eur(working, 2), cls: "text-slate-900" },
            { icon: Wallet, label: "Libre", value: eur(free, 2), cls: "text-slate-900" },
            { icon: TrendingUp, label: "Ganado por tus agentes", value: signed(earned), cls: tone(earned) },
          ].map((x) => (
            <div key={x.label} className="flex items-center justify-between gap-3 py-4">
              <span className="flex items-center gap-3 text-[15px] text-slate-700">
                <x.icon className={`h-5 w-5 ${x.label.startsWith("Ganado") ? "text-emerald-600" : "text-blue-600"}`} /> {x.label}
              </span>
              <span className={`text-2xl font-bold tabular-nums ${x.cls}`}>{x.value}</span>
            </div>
          ))}
        </section>
      </div>

      {/* Agentes + detalle */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className={`${card} px-4 py-4`}>
          <h2 className="flex items-center gap-3 px-2 pb-3 text-lg font-semibold text-slate-900">
            <Users className="h-5 w-5 text-slate-500" /> Tus agentes <span className="font-normal text-slate-400">· {mine.owned.length} de {mine.max}</span>
          </h2>
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <AgentRow
                key={r.key}
                r={r}
                active={current?.key === r.key}
                onClick={() => setSelected(r.key)}
                onRemove={r.mine && !r.mirror && mirrors.canManage ? () => removeAgent(r.key, r.agent?.name ?? r.key) : undefined}
                removing={removing === r.key}
              />
            ))}
            {Array.from({ length: Math.max(0, mine.max - mine.owned.length) }).map((_, i) => (
              <li key={`hueco-${i}`}>
                <button
                  type="button"
                  disabled={!mirrors.canManage}
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-3.5 text-left text-slate-400 transition-colors enabled:hover:border-blue-300 enabled:hover:bg-blue-50/40 enabled:hover:text-blue-700"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-current">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="flex-1 text-[15px] font-medium">Añadir agente</span>
                </button>
              </li>
            ))}
          </ul>
          {manual && manual.trades.length > 0 && <MyTrades data={manual} onChange={load} />}
        </section>

        <section className={`${card} px-5 py-5 lg:self-start`}>
          {current ? (
            <Detail r={current} canManage={mirrors.canManage} onManage={() => setManaging(current)} />
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Elige un agente para ver su detalle.</p>
          )}
        </section>
      </div>

      {adding && (
        <AddAgentModal
          agents={agents.agents.filter((a) => !mine.owned.includes(a.key))}
          onClose={() => setAdding(false)}
          onAdded={async (key) => {
            setAdding(false);
            await load();
            setSelected(key);
          }}
        />
      )}

      {managing && (
        <ManageModal
          r={managing}
          free={free}
          maxBudget={mirrors.maxBudget}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  );
}

function AgentRow({ r, active, onClick, onRemove, removing }: { r: Row; active: boolean; onClick: () => void; onRemove?: () => void; removing?: boolean }) {
  const m = money(r.mirror);
  const st = statusOf(r);
  // Sin dinero tuyo: al pasar por encima (o seleccionado), «Quitar agente» deja el hueco libre.
  const hide = onRemove ? (active ? "invisible" : "group-hover:invisible") : "";
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-4 rounded-2xl border-l-4 px-4 py-3 text-left transition-colors ${active ? "border-blue-600 bg-blue-50/70" : "border-transparent hover:bg-slate-50"}`}
      >
        <AgentAvatar color={r.agent?.color ?? "slate"} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <b className="truncate text-[15px] font-semibold text-slate-900">{r.agent?.name ?? r.mirror?.name ?? r.key}</b>
            {!r.mine && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">No es tuyo</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-500">
            <st.icon className="h-4 w-4 shrink-0" /> {st.text}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {m ? (
            <>
              <span className="block text-sm text-slate-600">
                {r.mine && !m.test ? "Le diste " : ""}
                {eur(m.given, 2)} <ArrowRight className="inline h-3.5 w-3.5" /> {r.mine && !m.test ? "ahora " : ""}
                <b className="font-semibold text-slate-900">{eur(m.now, 2)}</b>
              </span>
              <span className={`block text-sm font-semibold tabular-nums ${tone(m.result)}`}>
                {signed(m.result)} · {pctText(m.pct)}
                {m.test && <span className="ml-1 font-normal text-amber-700">(prueba)</span>}
              </span>
            </>
          ) : (
            <span className={`text-sm text-slate-400 ${hide}`}>Sin dinero tuyo</span>
          )}
        </span>
        <ChevronRight className={`h-5 w-5 shrink-0 text-slate-400 ${hide}`} />
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className={`absolute right-4 top-1/2 -translate-y-1/2 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 ${active ? "inline-flex" : "hidden group-hover:inline-flex"}`}
        >
          {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Minus className="h-3.5 w-3.5" />} Quitar agente
        </button>
      )}
    </li>
  );
}

function Detail({ r, canManage, onManage }: { r: Row; canManage: boolean; onManage: () => void }) {
  const m = money(r.mirror);
  const legs = (r.mirror?.legs ?? []).filter((l) => l.mode === r.mirror?.mode && l.status !== "omitida").slice(0, 5);
  return (
    <div>
      <div className="flex items-center gap-3">
        <AgentAvatar color={r.agent?.color ?? "slate"} size="lg" />
        <b className="flex-1 text-xl font-semibold text-slate-900">{r.agent?.name ?? r.key}</b>
        <Link href={`/trading/agentes/${r.key}?from=cartera`} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
          Ver <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-3 items-center divide-x divide-slate-200 rounded-2xl border border-slate-200 px-2 py-3">
        <div className="px-3">
          <div className="text-xs text-slate-500">Le diste</div>
          <div className="text-xl font-bold tabular-nums text-slate-900">{m ? eur(m.given, 2) : "—"}</div>
        </div>
        <div className="flex justify-center px-2">
          {m ? (
            <span className={`rounded-full px-3 py-1 text-lg font-bold tabular-nums ${m.result >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{signed(m.result)}</span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </div>
        <div className="px-3 text-right">
          <div className="text-xs text-slate-500">Tiene</div>
          <div className="text-xl font-bold tabular-nums text-slate-900">{m ? eur(m.now, 2) : "—"}</div>
        </div>
      </div>
      {m?.test && <p className="mt-2 text-xs text-amber-700">Ahora en prueba: calcula las órdenes pero no las envía. Pásalo a real desde Gestionar.</p>}

      <div className="mt-5 flex items-center gap-2 text-[15px] font-medium text-slate-700">
        <Clock className="h-4 w-4 text-slate-400" /> Últimas órdenes
      </div>
      {legs.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{r.mirror ? "Todavía no ha operado con tu dinero." : "No tiene dinero tuyo: dale una cantidad para que trabaje para ti."}</p>
      ) : (
        <ul className="mt-1 divide-y divide-slate-100">
          {legs.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2.5 text-[15px]">
              <span className="text-slate-800">
                {l.status === "cerrada" ? `Vendió ${coin(l.symbol)}` : l.status === "error" ? `Error con ${coin(l.symbol)}` : `Compró ${coin(l.symbol)}${l.amount ? ` · ${eur(l.amount, 0)}` : ""}`}
              </span>
              {l.result !== null && l.status === "cerrada" ? (
                <span className={`font-semibold tabular-nums ${tone(l.result)}`}>{signed(l.result)}</span>
              ) : (
                <span className="text-sm text-slate-400">{ago(l.closedAt ?? l.openedAt ?? l.createdAt)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <button type="button" onClick={onManage} className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white hover:bg-blue-700">
          {r.mirror ? "Gestionar" : "Darle dinero"}
        </button>
      )}
    </div>
  );
}

function ManageModal({ r, free, maxBudget, onClose }: { r: Row; free: number; maxBudget: number; onClose: () => void }) {
  const m = money(r.mirror);
  const name = r.agent?.name ?? r.key;
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const budget = r.mirror?.budget ?? 0;
  const value = Number(amount.replace(",", ".")) || 0;
  const target = Math.round((mode === "add" ? budget + value : budget - value) * 100) / 100;
  const maxAdd = Math.max(0, Math.min(maxBudget - budget, free));
  const valid = value > 0 && (mode === "add" ? value <= maxAdd + 1e-9 && target >= 5 : target >= 5 || target <= 0);

  const call = async (what: string, path: string, body: unknown, ok: string, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(what);
    setError(null);
    try {
      await api(path, body);
      setDone(ok);
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const save = () =>
    target <= 0
      ? call("guardar", "mirror/stop", { agent: r.key }, `${name} ya no trabaja con tu dinero.`)
      : call("guardar", "mirror/set", { agent: r.key, budget: target, mode: "real" }, mode === "add" ? `Ahora le das ${eur(target, 2)}.` : `Ahora le das ${eur(target, 2)}.`);

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-3">
          <AgentAvatar color={r.agent?.color ?? "slate"} /> {r.mirror ? `Gestionar ${name}` : `Darle dinero a ${name}`}
        </span>
      }
      subtitle={m ? `Tiene ${eur(m.now, 2)} tuyos · tienes ${eur(free, 2)} libres` : `Tienes ${eur(free, 2)} libres`}
    >
      {done ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{done}</p>
          <button type="button" className={`${primary} w-full justify-center`} onClick={onClose}>
            Hecho
          </button>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          {r.mirror && (
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["add", "Añadir", Plus],
                  ["remove", "Retirar", Minus],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMode(k)}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[15px] font-semibold ${mode === k ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {[10, 50].map((v) => (
              <button key={v} type="button" onClick={() => setAmount(String(v))} className="rounded-xl border border-slate-200 py-2 font-medium text-slate-700 hover:bg-slate-50">
                {v} €
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAmount(String(mode === "add" ? Math.floor(maxAdd * 100) / 100 : budget))}
              className="rounded-xl border border-slate-200 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              Todo
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input className={`${field} flex-1 text-right text-base tabular-nums`} inputMode="decimal" placeholder="Importe" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="text-slate-500">€</span>
            <button type="button" className={primary} disabled={!valid || !!busy} onClick={() => void save()}>
              {busy === "guardar" && <Loader2 className="h-4 w-4 animate-spin" />} {mode === "add" ? "Añadir" : "Retirar"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {value > 0 ? (target <= 0 ? "Retiras todo: deja de trabajar con tu dinero." : `Le quedarán ${eur(target, 2)} para sus próximas compras.`) : `Entre 5 € y ${eur(maxBudget, 0)} por agente. Se aplica a sus próximas compras.`}
            {r.mirror?.mode !== "real" && r.mirror && " Al guardar, pasa a dinero real."}
          </p>

          {r.mirror && (
            <div className="space-y-1 border-t border-slate-100 pt-3 text-[15px]">
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  void call("cerrar", "mirror/close", { agent: r.key }, "Posiciones cerradas. Seguirá trabajando con sus próximas compras.", `¿Vender ahora lo que tiene ${name} con tu dinero?`)
                }
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-slate-800 hover:bg-slate-50"
              >
                {busy === "cerrar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Cerrar sus posiciones
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  void call(
                    "pausa",
                    "mirror/pause",
                    { agent: r.key, paused: !r.mirror?.paused },
                    r.mirror?.paused ? `${name} vuelve a trabajar: copiará sus próximas compras.` : `${name} en pausa: no comprará nada nuevo con tu dinero. Lo que tiene lo venderá cuando él salga.`,
                  )
                }
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-slate-800 hover:bg-slate-50"
              >
                {busy === "pausa" ? <Loader2 className="h-4 w-4 animate-spin" /> : r.mirror?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {r.mirror?.paused ? "Reanudar" : "Pausar"}
                <span className="ml-auto text-xs text-slate-400">{r.mirror?.paused ? "volverá a comprar" : "no compra, conserva lo que tiene"}</span>
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void call("despedir", "mirror/stop", { agent: r.key }, `${name} ya no trabaja con tu dinero.`, `¿Despedir a ${name}? Se vende todo lo que tenga tuyo.`)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-red-700 hover:bg-red-50"
              >
                {busy === "despedir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Despedirlo (vende todo)
              </button>
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

const KIND_TEXT: Record<string, string> = { agente: "Comité de IA", kamikaze: "Kamikaze", chip: "Reglas fijas" };

/** Catálogo de la plataforma: eliges uno y pasa a «Tus agentes» (luego le das dinero desde «Gestionar»). */
function AddAgentModal({ agents, onClose, onAdded }: { agents: Agent[]; onClose: () => void; onAdded: (key: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = [...agents].sort((a, b) => b.summary.returnPct - a.summary.returnPct);
  const add = async (key: string) => {
    setBusy(key);
    setError(null);
    try {
      await api("mine/add", { agent: key });
      onAdded(key);
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };
  return (
    <Modal open onClose={onClose} title="Añadir agente" subtitle="Agentes de la plataforma. Añádelo y luego dale dinero desde «Gestionar»." width="max-w-2xl">
      {error && <ErrorNote>{error}</ErrorNote>}
      <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
        {list.map((a) => (
          <li key={a.key} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
            <AgentAvatar color={a.color} size="lg" />
            <Link href={`/trading/agentes/${a.key}?from=cartera`} className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <b className="truncate text-sm font-semibold text-slate-900">{a.name}</b>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{KIND_TEXT[a.kind] ?? a.kind}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">{a.tagline}</span>
            </Link>
            <ReturnPill value={a.summary.returnPct} />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => add(a.key)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === a.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Añadir
            </button>
          </li>
        ))}
        {!list.length && <li className="py-8 text-center text-sm text-slate-500">Ya tienes todos los agentes de la plataforma.</li>}
      </ul>
    </Modal>
  );
}

const TRADE_STATUS: Record<string, string> = { abriendo: "Comprando…", abierta: "Abierta", vendiendo: "Vendiendo…", cerrada: "Cerrada", omitida: "No se compró", error: "Revisa el exchange" };

/** Tus compras desde Oportunidades con dinero real: abiertas (con «Vender ya») y las últimas cerradas. */
function MyTrades({ data, onChange }: { data: Manual; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sell = async (id: string, name: string) => {
    if (!window.confirm(`¿Vender ya ${name} a mercado?`)) return;
    setBusy(id);
    setError(null);
    try {
      await api("manual/sell", { id });
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-4 border-t border-slate-100 px-2 pt-3">
      <h3 className="flex items-center justify-between pb-2 text-sm font-semibold text-slate-900">
        <span className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-slate-500" /> Mis operaciones
        </span>
        <span className={`text-sm tabular-nums ${tone(data.result)}`}>{signed(data.result)}</span>
      </h3>
      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {data.trades.map((t) => {
          const name = coin(t.symbol);
          const open = t.status === "abierta";
          return (
            <li key={t.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-slate-50" title={t.note ?? undefined}>
              <b className="w-16 shrink-0 truncate font-semibold text-slate-900">{name}</b>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                {TRADE_STATUS[t.status] ?? t.status}
                {open && ` · stop ${eur(t.stop)}${t.trailing ? " (subiendo)" : ` · objetivo ${eur(t.target)}`}`}
                {t.status === "cerrada" && t.closedAt && ` · ${ago(t.closedAt)}`}
              </span>
              <span className="shrink-0 text-right text-xs text-slate-600 tabular-nums">{eur(t.invested, 2)}</span>
              <span className={`w-20 shrink-0 text-right font-semibold tabular-nums ${tone(t.result ?? 0)}`}>{t.result === null ? "—" : signed(t.result)}</span>
              {open ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => sell(t.id, name)}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50"
                >
                  {busy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Vender ya"}
                </button>
              ) : (
                <span className="w-[68px] shrink-0" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
