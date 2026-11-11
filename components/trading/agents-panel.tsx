"use client";
// Agentes: catálogo de gestores de IA (en tarjetas o en lista) con la misma información, distinto carácter
// y su propia cartera virtual. «Detalles» abre su ficha completa en un modal.
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, CheckCircle2, ChevronDown, Copy, Info, LayoutGrid, List, Loader2, Play, RotateCcw, Search, XCircle } from "lucide-react";
import type { getAgents } from "@/lib/trading/agents/service";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import { api, dayFmt, errorText, eur, eur0, field, ghost, int, panel, pct, primary, th, tone, MEETINGS_TEXT } from "./format";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { EquityCurve, withLivePoint } from "./equity-chart";
import { AgentAvatar, cap, card, ErrorNote, LoadingCard, Modal, Pill, ReturnPill, Rich } from "./ui";
import { AssetIcon } from "./asset-icon";
import { DataTable, Money } from "./table";
import { MirrorModal } from "./mirror-modal";

type Data = Awaited<ReturnType<typeof getAgents>> & { canManage: boolean; canCopy: boolean };
type Portfolio = Awaited<ReturnType<typeof getPortfolio>>;
type Agent = Data["agents"][number];

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

const PROFILES = ["todos", "precavido", "equilibrado", "arriesgado", "kamikaze"] as const;
type SortKey = "rentabilidad" | "patrimonio" | "antiguedad" | "nombre";
const SORTS: Record<SortKey, { label: string; fn: (a: Agent, b: Agent) => number }> = {
  rentabilidad: { label: "Rentabilidad", fn: (a, b) => b.summary.returnPct - a.summary.returnPct },
  patrimonio: { label: "Patrimonio", fn: (a, b) => b.summary.equity - a.summary.equity },
  antiguedad: { label: "Más veteranos", fn: (a, b) => a.startedAt.localeCompare(b.startedAt) },
  nombre: { label: "Nombre", fn: (a, b) => a.name.localeCompare(b.name, "es") },
};

type RunState = Record<string, { state: "esperando" | "reunido" | "ok" | "error"; detail?: string }>;

export function AgentsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("agent"));
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<(typeof PROFILES)[number]>("todos");
  const [sort, setSort] = useState<SortKey>("rentabilidad");
  const [layout, setLayout] = useState<"cards" | "list">("cards");
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

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard />;

  const q = query.trim().toLowerCase();
  const list = data.agents
    .filter((a) => profile === "todos" || a.profile === profile)
    .filter((a) => !q || [a.name, a.profile, a.tagline, CREATOR.name].some((t) => t.toLowerCase().includes(q)))
    .sort(SORTS[sort].fn);
  const rank = new Map([...data.agents].sort((x, y) => y.summary.returnPct - x.summary.returnPct).map((a, k) => [a.key, k + 1]));
  const detail = data.agents.find((a) => a.key === selected) ?? null;
  const bench = data.agents[0]?.benchmark;
  const openDetail = (key: string | null) => {
    setSelected(key);
    window.history.replaceState(null, "", key ? `/trading/agentes?agent=${key}` : "/trading/agentes");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Barra del catálogo: buscar, filtrar, ordenar y cambiar de vista */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className={`${field} w-full pl-9`} placeholder="Buscar agente, perfil o creador" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar agentes" />
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {PROFILES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProfile(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${profile === p ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {p === "todos" ? "Todos" : cap(p)}
            </button>
          ))}
        </div>
        {layout === "cards" && (
        <label className="flex items-center gap-2 text-sm text-slate-500">
          Ordenar por
          <select className={`${field} py-1.5`} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORTS[k].label}
              </option>
            ))}
          </select>
        </label>
        )}
        <div className="ml-auto flex items-center gap-3">
          {bench && (
            <span className="hidden items-center gap-1 text-xs text-slate-500 lg:flex" title="Lo que ha hecho el mercado desde que empezaron los agentes, para comparar.">
              Mercado desde que empezaron: IBEX 35 <b className={tone(bench.ibexPct)}>{pct(bench.ibexPct)}</b> · Bitcoin <b className={tone(bench.btcPct)}>{pct(bench.btcPct)}</b>
            </span>
          )}
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Vista">
            {(
              [
                ["cards", LayoutGrid, "Tarjetas"],
                ["list", List, "Lista"],
              ] as const
            ).map(([k, Icon, label]) => (
              <button
                key={k}
                type="button"
                title={label}
                aria-pressed={layout === k}
                onClick={() => setLayout(k)}
                className={`rounded-lg p-1.5 ${layout === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="shrink-0 text-xs text-slate-500">
        {list.length === data.agents.length ? `${list.length} agentes` : `${list.length} de ${data.agents.length} agentes`}
      </p>

      {list.length === 0 ? (
        <div className={`${card} px-6 py-10 text-center text-sm text-slate-500`}>Ningún agente coincide con la búsqueda.</div>
      ) : layout === "cards" ? (
        <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
          {list.map((a) => (
            <AgentCard key={a.key} a={a} rank={rank.get(a.key) ?? 0} onDetail={() => openDetail(a.key)} />
          ))}
        </div>
      ) : (
        <DataTable<Agent>
          id="agentes"
          height="min-h-0 flex-1"
          paginate
          label="agentes"
          rows={list}
          rowKey={(a) => a.key}
          onRowClick={(a) => openDetail(a.key)}
          columns={[
            {
              key: "name",
              label: "Agente",
              width: 26,
              align: "left",
              sort: (a) => a.name,
              cell: (a) => (
                <span className="flex min-w-0 items-center gap-3">
                  <AgentAvatar color={a.color} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <b className="truncate font-semibold text-slate-900">{a.name}</b>
                      <Pill color={a.color}>{cap(a.profile)}</Pill>
                    </span>
                    <span className="block truncate text-xs text-slate-500">{a.tagline}</span>
                  </span>
                </span>
              ),
            },
            { key: "creator", label: "Creador", width: 11, cell: () => <span className="inline-flex justify-center"><Creator /></span> },
            { key: "since", label: "Lleva", width: 9, sort: (a) => new Date(a.startedAt).getTime(), cell: (a) => <span className="text-slate-600">{runningFor(a.startedAt)}</span> },
            { key: "equity", label: "Patrimonio", width: 11, sort: (a) => a.summary.equity, cell: (a) => <Money v={a.summary.equity} digits={2} className="font-semibold text-slate-900" /> },
            { key: "ret", label: "Rentabilidad", width: 10, sort: (a) => a.summary.returnPct, cell: (a) => <span className="inline-flex justify-center"><ReturnPill value={a.summary.returnPct} /></span> },
            { key: "win", label: "Acierto", width: 8, sort: (a) => (a.summary.stats.closed ? a.summary.stats.winRate : null), cell: (a) => <span className="tabular-nums text-slate-700">{a.summary.stats.closed ? `${Math.round(a.summary.stats.winRate * 100)} %` : "—"}</span> },
            { key: "pos", label: "Posiciones", width: 8, sort: (a) => a.positions.filter((p) => p.status === "abierta").length, cell: (a) => <span className="tabular-nums text-slate-700">{a.positions.filter((p) => p.status === "abierta").length}</span> },
            { key: "risk", label: "Riesgo", width: 9, sort: (a) => a.settings.riskPerTradePct, cell: (a) => <span className="text-slate-600">{pct(a.settings.riskPerTradePct, 1, false)}</span> },
            {
              key: "act",
              label: "",
              width: 8,
              cell: (a) => (
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetail(a.key);
                  }}
                >
                  Detalles
                </button>
              ),
            },
          ]}
        />
      )}

      {detail && (
        <Modal
          open
          onClose={() => openDetail(null)}
          width="max-w-5xl"
          title={
            <span className="flex flex-wrap items-center gap-2">
              <AgentAvatar color={detail.color} size="sm" /> {detail.name} <Pill color={detail.color}>{cap(detail.profile)}</Pill>{" "}
              <ReturnPill value={detail.summary.returnPct} />
            </span>
          }
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              <Creator /> · {runningFor(detail.startedAt)} · puesto {rank.get(detail.key)} de {data.agents.length}
            </span>
          }
        >
          <div className="-mx-6 -my-5">
            <AgentDetail
              key={detail.key}
              agent={detail}
              canManage={data.canManage}
              canCopy={data.canCopy}
              busy={running}
              onMeet={() => void meet([detail.key])}
              onReset={() => void reset(detail)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Los agentes de ahora son de la casa; cuando haya agentes de usuarios, aquí irá su autor. */
const CREATOR = { name: "Crussader", logo: "/email/logo-mark.png" };

function Creator() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo propio, pequeño */}
      <img src={CREATOR.logo} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-md" />
      {CREATOR.name}
    </span>
  );
}

/** «lleva 12 días», «lleva 3 meses»… */
function runningFor(iso: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days < 1) return "empezó hoy";
  if (days < 45) return `lleva ${days} ${days === 1 ? "día" : "días"}`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `lleva ${months} meses`;
  const years = Math.floor(months / 12);
  return `lleva ${years} ${years === 1 ? "año" : "años"}`;
}

function AgentCard({ a, rank, onDetail }: { a: Agent; rank: number; onDetail: () => void }) {
  const open = a.positions.filter((p) => p.status === "abierta").length;
  const pending = a.positions.filter((p) => p.status === "pendiente").length;
  const k = a.kamikaze;
  return (
    <article className={`${card} flex flex-col overflow-hidden transition-shadow hover:shadow-md`}>
      <div className="flex items-start justify-between gap-2 px-5 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          <AgentAvatar color={a.color} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-slate-900">{a.name}</span>
              <Pill color={a.color}>{cap(a.profile)}</Pill>
            </div>
            <p className="mt-1 text-xs leading-snug text-slate-500">{a.tagline}</p>
          </div>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-xs font-semibold text-slate-600" title="Puesto por rentabilidad">
            {rank}
          </span>
          {a.copyWeightPct !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              <Copy className="h-3 w-3" /> lo copias {a.copyWeightPct} %
            </span>
          )}
        </span>
      </div>
      <div className="mt-4 px-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">{eur0(a.summary.equity)}</span>
          <ReturnPill value={a.summary.returnPct} />
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {open} abiertas{pending ? ` · ${pending} pendientes` : ""} · {a.summary.stats.closed} cerradas
          {a.summary.stats.closed ? ` · acierto ${Math.round(a.summary.stats.winRate * 100)} %` : ""}
        </div>
      </div>
      <div className="mt-3 flex-1 px-3 pb-3">
        <EquityCurve points={withLivePoint(a.equity, a.summary.equity)} initial={a.summary.initialCapital} height={110} empty="La línea aparece tras su primera sesión." />
      </div>
      {k && (
        <div className="mx-5 mb-3">
          <RoundProgress k={k} equity={a.summary.equity} />
        </div>
      )}
      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 pt-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <Creator />
          <span className="text-[11px] text-slate-400">{runningFor(a.startedAt)}</span>
        </span>
        <button type="button" className={ghost} onClick={onDetail}>
          <Info className="h-4 w-4" /> Detalles
        </button>
      </footer>
    </article>
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
  const [mirroring, setMirroring] = useState(false);
  const lastRunId = a.lastRun?.id;
  const latest = a.proposals.filter((p) => p.runId === lastRunId);
  const older = a.proposals.filter((p) => p.runId !== lastRunId && p.status !== "rechazada" && p.action !== "vigilar");
  const s = a.summary;
  const pendingIds = new Set(a.positions.filter((p) => p.status === "pendiente").map((p) => p.id));

  return (
    <section>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
        <div className="flex max-w-2xl items-start gap-3">
          <div className="min-w-0">
          <p className="text-sm text-slate-700">{a.tagline}</p>
          {a.kamikaze ? (
            <p className="mt-2 text-xs text-slate-500">
              Rondas de {eur0(a.kamikaze.capital)} con meta ×{a.kamikaze.multiple} en {a.kamikaze.days} días · solo crypto en euros (datos de Binance) · una posición y
              todo dentro · stop entre un 5 % y un 40 % · vigilancia cada pocos minutos y decisión con IA cada 30 min (60 con posición) · pausa de 30 min tras una pérdida.
              Es una lotería con método: lo más probable en cada ronda es perder buena parte del capital.
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Arriesga {pct(a.settings.riskPerTradePct, 1, false)} del patrimonio por operación · como mucho {pct(a.settings.maxPositionPct, 0, false)} en un
              valor · hasta {a.settings.maxOpenPositions} posiciones · {a.rules.maxBuys} {a.rules.maxBuys === 1 ? "compra" : "compras"} por reunión ·
              convicción mínima {a.rules.minConviction} de 5 · {a.rules.buyInBearMarket ? "puede comprar con el mercado bajista" : "no compra con el mercado bajista"}
            </p>
          )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCopy && (
            <button type="button" className={a.kamikaze ? primary : ghost} onClick={() => setMirroring(true)}>
              <Copy className="h-4 w-4" /> Copiar en mi Binance
            </button>
          )}
          {!a.kamikaze && (
            <button type="button" className={primary} disabled={!canCopy} onClick={() => setCopying(true)}>
              <Copy className="h-4 w-4" /> {a.copyWeightPct !== null ? `Lo copias con el ${a.copyWeightPct} % · cambiar` : `Copiar a ${a.name}`}
            </button>
          )}
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
        {mirroring && <MirrorModal agent={a.key} name={a.name} onClose={() => setMirroring(false)} />}
      </header>

      <dl className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
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
        <EquityCurve points={withLivePoint(a.equity, s.equity)} initial={s.initialCapital} height={160} empty="Su gráfico se dibuja con el cierre de cada sesión desde que empezó." />
      </div>
      {a.lastRun?.marketView && (
        <div className="border-b border-slate-100 px-5 py-3 text-sm leading-relaxed text-slate-700">
          <div className="mb-1 text-xs font-medium text-slate-500">Cómo ve el mercado ({when(a.lastRun.at)})</div>
          <Rich text={a.lastRun.marketView} />
        </div>
      )}
      {a.lastRun?.status === "error" && <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">La última reunión falló: {a.lastRun.error}</p>}

      {a.kamikaze && <Rounds k={a.kamikaze} equity={s.equity} />}

      {/* Cartera */}
      <div className="border-b border-slate-100">
        <h3 className="px-5 pt-4 text-[15px] font-semibold text-slate-900">Su cartera</h3>
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
                      <span className="flex items-center gap-2.5">
                        <AssetIcon symbol={p.symbol} name={p.name} size="sm" />
                        <span>
                          <span className="block font-medium text-slate-900">{p.name}</span>
                          {p.status === "pendiente" && <span className="block text-xs text-amber-700">Se compra en la próxima apertura</span>}
                        </span>
                      </span>
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
        <h3 className="text-[15px] font-semibold text-slate-900">Qué decidió en su última reunión</h3>
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
          <h3 className="text-[15px] font-semibold text-slate-900">Operaciones cerradas</h3>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {a.closed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="flex items-center gap-2 text-slate-700">
                  <AssetIcon symbol={p.symbol} name={p.name} size="xs" />
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
          <AssetIcon symbol={p.symbol} name={p.name} size="sm" className="mr-2 align-middle" />
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
          <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
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

type Kamikaze = NonNullable<Agent["kamikaze"]>;
const ROUND_END: Record<string, { label: string; color: string }> = {
  en_curso: { label: "En curso", color: "blue" },
  meta: { label: "Meta", color: "emerald" },
  plazo: { label: "Fin de plazo", color: "slate" },
  arruinado: { label: "Sin capital", color: "rose" },
};

/** Avance hacia el objetivo de la ronda, sin fecha límite. */
function RoundProgress({ k, equity }: { k: Kamikaze; equity: number }) {
  const r = k.current;
  if (!r) return <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">La primera ronda empieza en la próxima revisión.</p>;
  const progress = equity > 0 ? Math.max(0, Math.min(1, Math.log(equity / r.startCapital) / Math.log(r.goal / r.startCapital))) : 0;
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
      <div className="flex items-baseline justify-between gap-2">
        <span><b className="font-semibold text-slate-900">Ronda {r.number}</b> · {eur0(equity)} de {eur0(r.goal)}</span>
        <span>Sin plazo</span>
      </div>
      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200" title="Camino a la meta (escala de multiplicador)">
        <span className="absolute inset-y-0 left-0 rounded-full bg-rose-500" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between gap-2">
        <span>{equity >= r.goal ? "¡Meta alcanzada!" : "Objetivo sin fecha límite"}</span>
        <span>{k.stats.rounds} rondas · {k.stats.goals} metas</span>
      </div>
      {r.note && (
        <p className="mt-1.5 border-t border-slate-200/70 pt-1.5 text-slate-500" title={r.noteAt ? `Revisado ${new Date(r.noteAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : undefined}>
          {r.note}
        </p>
      )}
    </div>
  );
}

/** Ficha de un kamikaze: la ronda en curso y el historial de rondas. */
function Rounds({ k, equity }: { k: Kamikaze; equity: number }) {
  return (
    <div className="border-b border-slate-100 px-5 py-4">
      <h3 className="text-[15px] font-semibold text-slate-900">Rondas</h3>
      <div className="mt-2 max-w-md">
        <RoundProgress k={k} equity={equity} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <b className="font-semibold text-slate-900">{k.stats.rounds}</b> <span className="text-slate-500">terminadas</span>
        </span>
        <span>
          <b className="font-semibold text-emerald-700">{k.stats.goals}</b> <span className="text-slate-500">metas</span>
        </span>
        <span>
          <b className="font-semibold text-rose-700">{k.stats.busted}</b> <span className="text-slate-500">sin capital</span>
        </span>
        <span>
          <b className={`font-semibold ${tone(k.stats.net)}`}>{eur0(k.stats.net)}</b> <span className="text-slate-500">neto acumulado</span>
        </span>
      </div>
      {k.history.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                <th className={th}>Ronda</th>
                <th className={th}>Resultado</th>
                <th className={`${th} text-right`}>Empezó con</th>
                <th className={`${th} text-right`}>Acabó con</th>
                <th className={`${th} text-right`}>Máximo</th>
                <th className={`${th} text-right`}>Operaciones</th>
                <th className={th}>Fin</th>
              </tr>
            </thead>
            <tbody>
              {k.history.map((r) => (
                <tr key={r.number} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{r.number}</td>
                  <td className="px-3 py-2">
                    <Pill color={ROUND_END[r.status]?.color}>{ROUND_END[r.status]?.label ?? r.status}</Pill>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{eur0(r.startCapital)}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${tone((r.endEquity ?? 0) - r.startCapital)}`}>{eur(r.endEquity, 2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{eur(r.bestEquity, 2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.trades}</td>
                  <td className="px-3 py-2 text-slate-600">{r.endedAt ? dayFmt(r.endedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
