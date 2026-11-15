"use client";
// Mi cartera: tu dinero real. Arriba: saldo, en qué está (disponible, trabajando, en oportunidades, ganado)
// y su evolución, con «Actualizar». Debajo: tus oportunidades ejecutadas (abiertas e historial juntas, para
// gestionarlas: seguir si sube, cerrar) y, al lado, tus agentes en pequeño (clic → Gestionar).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Clock, Crosshair, Flame, Link2, Loader2, Minus, Pause, Play, Plus, Shield, Trash2 } from "lucide-react";
import type { getWallets, myAgents } from "@/lib/trading/wallets";
import type { mirrorView } from "@/lib/trading/mirror/service";
import type { manualView } from "@/lib/trading/manual/service";
import { api, errorText, eur, field, primary, tone } from "./format";
import { AssetIcon } from "./asset-icon";
import { refreshTrading, useTradingRefresh, useWarmStart } from "./navigation";
import { AgentAvatar, ErrorNote, LoadingCard, Modal, ReturnPill, StopTargetBar } from "./ui";
import { PortfolioAgents, PortfolioBalance, PortfolioColumns, PortfolioOpportunities } from "./portfolio-layout";
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
const dateTime = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso)) : "—";

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
  useWarmStart<Wallets>("wallets?history=1", setWallets);
  const [mirrors, setMirrors] = useState<Mirrors | null>(null);
  useWarmStart<Mirrors>("mirror", setMirrors);
  const [agents, setAgents] = useState<AgentsData | null>(null);
  useWarmStart<AgentsData>("agents", setAgents);
  const [mine, setMine] = useState<Mine | null>(null);
  useWarmStart<Mine>("mine", setMine);
  const [manual, setManual] = useState<Manual | null>(null);
  useWarmStart<Manual>("manual", setManual);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<"24h" | "7d">("24h");

  const load = useCallback(async () => {
    try {
      const [w, m, a, o] = await Promise.all([api<Wallets>("wallets?history=1"), api<Mirrors>("mirror"), api<AgentsData>("agents"), api<Mine>("mine")]);
      setWallets(w);
      setMirrors(m);
      setAgents(a);
      setMine(o);
      setError(null);
      // Mis oportunidades: si falta la tabla (migración sin pasar), la pantalla sigue funcionando.
      await api<Manual>("manual").then(setManual, () => setManual(null));
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

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

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
  const inTrades = manual?.working ?? 0;
  const working = Math.min(total, realRows.reduce((s, r) => s + (money(r.mirror)?.now ?? 0), 0) + inTrades);
  const earnedAgents = realRows.reduce((s, r) => s + (money(r.mirror)?.result ?? 0), 0);
  const earned = earnedAgents + (manual?.result ?? 0);
  const free = Math.max(0, total - working);
  const earnedBase = realRows.reduce((s, r) => s + (r.mirror?.budget ?? 0), 0) + (manual?.trades.filter((t) => t.status === "abierta" || t.status === "cerrada").reduce((s, t) => s + t.invested, 0) ?? 0);
  const operating = wallets.items.find((w) => w.operating) ?? wallets.items[0] ?? null;
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

      <PortfolioBalance
        title={`Tu dinero real${operating ? ` · ${operating.name}` : ""}`}
        total={total}
        available={free}
        working={working}
        opportunities={inTrades}
        earned={earned}
        returnPct={earnedBase > 0 ? (earned / earnedBase) * 100 : null}
        points={graphPoints}
        initial={graphPoints[0]?.equity ?? total}
        intraday={hasIntraday}
        periods={[{ key: "24h", label: "24 h" }, { key: "7d", label: "7 días" }]}
        period={chartPeriod}
        onPeriodChange={setChartPeriod}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        note={hasIntraday
          ? "Saldo valorado en EUR cada 5 min; las aportaciones y retiradas también cambian la curva."
          : "De momento se muestra el histórico diario. Las lecturas de cinco minutos se irán añadiendo mientras Trading esté abierto."}
        empty="La gráfica se completará tras la segunda lectura de saldo (aprox. 5 minutos)."
        setup={wallets.items.length === 0 ? (
          <div className="py-6">
            <p className="text-sm text-slate-600">Conecta tu exchange para ejecutar oportunidades y copiar agentes con tu dinero.</p>
            <Link href="/trading/integraciones" className={`${primary} mt-3`}>
              <Link2 className="h-4 w-4" /> Conectar exchange
            </Link>
          </div>
        ) : undefined}
      />

      <PortfolioColumns
        opportunities={<MyOpportunities data={manual} canManage={mirrors.canManage} onChange={load} />}
        agents={(
          <PortfolioAgents count={`${mine.owned.length} de ${mine.max}`}>
            <ul className="space-y-1">
              {rows.map((r) => (
                <AgentRow
                  key={r.key}
                  r={r}
                  onClick={mirrors.canManage ? () => setManaging(r) : undefined}
                  onRemove={r.mine && !r.mirror && mirrors.canManage ? () => removeAgent(r.key, r.agent?.name ?? r.key) : undefined}
                  removing={removing === r.key}
                />
              ))}
              {mine.owned.length < mine.max && (
                <li>
                  <button
                    type="button"
                    disabled={!mirrors.canManage}
                    onClick={() => setAdding(true)}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-left text-sm text-slate-400 transition-colors enabled:hover:border-blue-300 enabled:hover:bg-blue-50/40 enabled:hover:text-blue-700"
                  >
                    <Plus className="h-4 w-4" /> Añadir agente
                    <span className="ml-auto text-xs">{mine.max - mine.owned.length} libres</span>
                  </button>
                </li>
              )}
            </ul>
            {!rows.length && <p className="px-1 pt-1 text-xs text-slate-500">Aún sin agentes: mientras los evalúas, ejecuta oportunidades.</p>}
          </PortfolioAgents>
        )}
      />

      {adding && (
        <AddAgentModal
          agents={agents.agents.filter((a) => !mine.owned.includes(a.key))}
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await load();
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

/** Un agente en pequeño: nombre, qué hace y su resultado con tu dinero. Clic → Gestionar. */
function AgentRow({ r, onClick, onRemove, removing }: { r: Row; onClick?: () => void; onRemove?: () => void; removing?: boolean }) {
  const m = money(r.mirror);
  const st = statusOf(r);
  return (
    <li className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50">
      <button type="button" onClick={onClick} disabled={!onClick} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <AgentAvatar color={r.agent?.color ?? "slate"} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <b className="truncate text-sm font-semibold text-slate-900">{r.agent?.name ?? r.mirror?.name ?? r.key}</b>
            {!r.mine && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">No es tuyo</span>}
          </span>
          <span className="flex items-center gap-1 truncate text-xs text-slate-500">
            <st.icon className="h-3 w-3 shrink-0" /> {st.text}
          </span>
        </span>
        {m && (
          <span className={`shrink-0 text-right text-xs font-semibold tabular-nums ${tone(m.result)}`}>
            {signed(m.result)}
            {m.test && <span className="block font-normal text-amber-700">prueba</span>}
          </span>
        )}
      </button>
      <Link href={`/trading/agentes/${r.key}?from=cartera`} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline" title="Ver el agente">
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          title="Quitar agente (deja el hueco libre)"
          className="hidden shrink-0 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 group-hover:inline-flex"
        >
          {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Minus className="h-3.5 w-3.5" />}
        </button>
      )}
    </li>
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

const TRADE_STATUS: Record<string, { label: string; cls: string }> = {
  abriendo: { label: "Comprando…", cls: "bg-blue-50 text-blue-700" },
  abierta: { label: "Abierta", cls: "bg-emerald-50 text-emerald-700" },
  vendiendo: { label: "Vendiendo…", cls: "bg-blue-50 text-blue-700" },
  cerrada: { label: "Cerrada", cls: "bg-slate-100 text-slate-600" },
  omitida: { label: "No se compró", cls: "bg-slate-100 text-slate-500" },
  error: { label: "Revisa el exchange", cls: "bg-orange-50 text-orange-700" },
};
const ACTIVE = ["abriendo", "abierta", "vendiendo", "error"];
type Filter = "todas" | "activas" | "historial";

/**
 * Tus oportunidades ejecutadas con dinero real: abiertas e historial en una sola lista. En las abiertas,
 * «Seguir si sube» (al llegar al objetivo, el stop sube y acompaña al precio) y «Cerrar» (vende ya).
 */
function MyOpportunities({ data, canManage, onChange }: { data: Manual | null; canManage: boolean; onChange: () => Promise<void> }) {
  const [filter, setFilter] = useState<Filter>("todas");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trades = data?.trades ?? [];
  const active = trades.filter((t) => ACTIVE.includes(t.status));
  const history = trades.filter((t) => !ACTIVE.includes(t.status));
  const list = filter === "activas" ? active : filter === "historial" ? history : [...active, ...history];
  const closed = history.filter((t) => t.status === "cerrada");
  const wins = closed.filter((t) => (t.result ?? 0) > 0).length;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const close = (id: string, name: string) => {
    if (!window.confirm(`¿Cerrar ${name}? Se vende ya a mercado.`)) return;
    void run(`cerrar:${id}`, () => api("manual/sell", { id }));
  };
  const trail = (id: string, on: boolean) => void run(`seguir:${id}`, () => api("manual/trail", { id, trail: on }));

  return (
    <PortfolioOpportunities>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
        <h2 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-lg font-semibold text-slate-900">
          <Flame className="h-5 w-5 text-orange-500" /> Mis oportunidades
          {data && <span className={`text-sm font-semibold tabular-nums ${tone(data.result)}`}>{signed(data.result)}</span>}
          {closed.length > 0 && <span className="text-xs font-normal text-slate-400">· acierto {Math.round((wins / closed.length) * 100)} % ({wins}/{closed.length})</span>}
        </h2>
        <div className="flex w-full gap-1 rounded-lg bg-slate-100 p-1 sm:w-auto" role="group" aria-label="Filtrar oportunidades">
          {(
            [
              ["todas", `Todas · ${trades.length}`],
              ["activas", `Abiertas · ${active.length}`],
              ["historial", `Historial · ${history.length}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium sm:flex-none sm:py-1 ${filter === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {data?.problem && <p className="mb-2 px-1 text-xs text-amber-700">{data.problem}.</p>}

      {!data ? (
        <p className="px-1 py-6 text-sm text-slate-500">No se pudieron cargar tus oportunidades.</p>
      ) : list.length === 0 ? (
        <div className="px-1 py-8 text-center text-sm text-slate-500">
          {filter === "historial" ? "Todavía no has cerrado ninguna oportunidad." : "No tienes oportunidades abiertas."}{" "}
          <Link href="/trading/oportunidades" className="font-semibold text-blue-700 hover:underline">
            Ver oportunidades
          </Link>
        </div>
      ) : (
        <>
        <MobileTrades list={list} canManage={canManage} busy={busy} onTrail={trail} onClose={close} />
        <div className="hidden max-h-[32rem] overflow-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Activo</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2 text-right">Invertido</th>
                <th className="px-2 py-2 text-right">Entrada → ahora</th>
                <th className="w-40 px-2 py-2">Stop · objetivo</th>
                <th className="px-2 py-2 text-right">Resultado</th>
                <th className="px-2 py-2 text-center" title="Al llegar al objetivo, en vez de vender, el stop sube y acompaña al precio">
                  Seguir si sube
                </th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const name = coin(t.symbol);
                const open = t.status === "abierta";
                const st = TRADE_STATUS[t.status] ?? { label: t.status, cls: "bg-slate-100 text-slate-600" };
                const resultPct = t.result !== null && t.invested > 0 ? (t.result / t.invested) * 100 : null;
                const exit = t.status === "cerrada" && t.result !== null && t.entry && t.invested > 0 ? t.entry * (1 + t.result / t.invested) : null;
                return (
                  <tr key={t.id} className="border-b border-slate-100/80 align-middle" title={t.note ?? undefined}>
                    <td className="px-2 py-2.5">
                      <b className="font-semibold text-slate-900">{name}</b>
                      <span className="block text-[11px] text-slate-400">
                        {t.status === "cerrada" && t.closedAt ? `cerrada ${dateTime(t.closedAt)}` : t.openedAt ? `desde ${dateTime(t.openedAt)}` : dateTime(t.closedAt)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                      {open && t.trailing && <span className="ml-1 text-[11px] text-emerald-700">stop subiendo</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">{eur(t.invested, 2)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                      {t.entry ? eur(t.entry) : "—"}
                      {open && t.price !== null && (
                        <>
                          {" "}
                          <ArrowRight className="inline h-3 w-3 text-slate-400" /> <b className="font-semibold text-slate-900">{eur(t.price)}</b>
                        </>
                      )}
                      {!open && exit !== null && (
                        <span className="block text-[11px] text-slate-400" title="Precio de salida aproximado (sin comisiones)">
                          salida ≈ {eur(exit)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      {t.entry && t.status !== "omitida" ? (
                        <>
                          {open && <StopTargetBar stop={t.stop} target={t.target} price={t.price} entry={t.entry} />}
                          <span className="mt-1 flex justify-between text-[11px] tabular-nums text-slate-500">
                            <span className="text-red-700">{eur(t.stop)}</span>
                            <span className="text-emerald-700">{eur(t.target)}</span>
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={`px-2 py-2.5 text-right font-semibold tabular-nums ${tone(t.result ?? 0)}`}>
                      {t.result === null ? "—" : signed(t.result)}
                      {resultPct !== null && <span className="block text-[11px] font-normal">{pctText(resultPct)}</span>}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {open ? (
                        <label className="inline-flex cursor-pointer items-center justify-center" title={t.trail ? "Quitar: venderá al llegar al objetivo" : "Al llegar al objetivo, seguir mientras suba"}>
                          {busy === `seguir:${t.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          ) : (
                            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={t.trail} disabled={!canManage || busy !== null} onChange={(e) => trail(t.id, e.target.checked)} />
                          )}
                        </label>
                      ) : t.trail ? (
                        <span className="text-[11px] text-slate-400">sí</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {open && canManage && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => close(t.id, name)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        >
                          {busy === `cerrar:${t.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />} Cerrar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      <p className="mt-2 px-1 text-[11px] text-slate-400">La app revisa cada ~5 min: vende al tocar el stop o el objetivo (o sube el stop si marcaste «Seguir si sube»). Resultados con comisiones.</p>
    </PortfolioOpportunities>
  );
}

type Trade = Manual["trades"][number];

/**
 * Móvil: tus oportunidades como lista (dos líneas por operación). Al tocar una, sube desde abajo su
 * detalle con «Seguir si sube» y «Cerrar» en grande.
 */
function MobileTrades({
  list,
  canManage,
  busy,
  onTrail,
  onClose,
}: {
  list: Trade[];
  canManage: boolean;
  busy: string | null;
  onTrail: (id: string, on: boolean) => void;
  onClose: (id: string, name: string) => void;
}) {
  const [selId, setSelId] = useState<string | null>(null);
  const sel = list.find((t) => t.id === selId) ?? null;
  return (
    <>
      <ul className="-mx-1 divide-y divide-slate-100 md:hidden">
        {list.map((t) => {
          const name = coin(t.symbol);
          const open = t.status === "abierta";
          const st = TRADE_STATUS[t.status] ?? { label: t.status, cls: "bg-slate-100 text-slate-600" };
          const resultPct = t.result !== null && t.invested > 0 ? (t.result / t.invested) * 100 : null;
          return (
            <li key={t.id}>
              <button type="button" onClick={() => setSelId(t.id)} className="flex w-full items-center gap-3 px-1 py-3 text-left active:bg-slate-50">
                <AssetIcon symbol={t.symbol} name={name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <b className="truncate text-[15px] font-semibold text-slate-900">{name}</b>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                    {open && t.trail && <span className="shrink-0 text-[11px] font-medium text-emerald-700">sigue si sube</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {eur(t.invested, 2)} ·{" "}
                    {open && t.entry && t.price !== null ? `${eur(t.entry)} → ${eur(t.price)}` : t.status === "cerrada" && t.closedAt ? `cerrada ${dateTime(t.closedAt)}` : dateTime(t.openedAt)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <b className={`block text-sm font-semibold tabular-nums ${tone(t.result ?? 0)}`}>{t.result === null ? "—" : signed(t.result)}</b>
                  {resultPct !== null && <span className={`block text-[11px] tabular-nums ${tone(resultPct)}`}>{pctText(resultPct)}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            </li>
          );
        })}
      </ul>

      {sel && (
        <Modal
          open
          onClose={() => setSelId(null)}
          title={
            <span className="flex items-center gap-2">
              {coin(sel.symbol)}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${(TRADE_STATUS[sel.status] ?? { cls: "bg-slate-100 text-slate-600" }).cls}`}>{TRADE_STATUS[sel.status]?.label ?? sel.status}</span>
            </span>
          }
          subtitle={sel.status === "cerrada" && sel.closedAt ? `Cerrada el ${dateTime(sel.closedAt)}` : sel.openedAt ? `Desde el ${dateTime(sel.openedAt)}` : undefined}
          footer={
            sel.status === "abierta" && canManage ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => onClose(sel.id, coin(sel.symbol))}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-base font-semibold text-white active:bg-rose-700 disabled:opacity-60"
              >
                {busy === `cerrar:${sel.id}` ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />} Cerrar (vender ya)
              </button>
            ) : undefined
          }
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {(
                [
                  ["Invertido", eur(sel.invested, 2), "text-slate-900"],
                  ["Resultado", sel.result === null ? "—" : `${signed(sel.result)}${sel.invested > 0 ? ` · ${pctText((sel.result / sel.invested) * 100)}` : ""}`, tone(sel.result ?? 0)],
                  ["Entrada", sel.entry ? eur(sel.entry) : "—", "text-slate-900"],
                  [sel.status === "abierta" ? "Precio ahora" : "Salida aprox.", sel.status === "abierta" ? (sel.price !== null ? eur(sel.price) : "—") : sel.entry && sel.result !== null && sel.invested > 0 ? eur(sel.entry * (1 + sel.result / sel.invested)) : "—", "text-slate-900"],
                  ["Stop", eur(sel.stop), "text-rose-700"],
                  ["Objetivo", eur(sel.target), "text-emerald-700"],
                ] as const
              ).map(([label, value, cls]) => (
                <div key={label}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                  <div className={`mt-0.5 text-base font-semibold tabular-nums ${cls}`}>{value}</div>
                </div>
              ))}
            </div>
            {sel.status === "abierta" && sel.entry && <StopTargetBar stop={sel.stop} target={sel.target} price={sel.price} entry={sel.entry} />}
            {sel.status === "abierta" && (
              <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
                <span>
                  <b className="block text-[15px] font-semibold text-slate-900">Seguir si sube</b>
                  <span className="block text-xs text-slate-500">Al llegar al objetivo, en vez de vender, el stop sube y acompaña al precio.</span>
                </span>
                {busy === `seguir:${sel.id}` ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-slate-400" />
                ) : (
                  <input type="checkbox" className="h-6 w-6 shrink-0 accent-emerald-600" checked={sel.trail} disabled={!canManage || busy !== null} onChange={(e) => onTrail(sel.id, e.target.checked)} />
                )}
              </label>
            )}
            {sel.note && <p className="text-xs text-slate-500">{sel.note}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
