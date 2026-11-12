"use client";
// Agentes: catálogo de gestores de IA (en tarjetas o en lista) con la misma información, distinto carácter
// y su propia cartera virtual. Cada tarjeta lleva a la página del agente (/trading/agentes/<clave>).
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Copy, CopyPlus, LayoutGrid, List, Loader2, MoreHorizontal, Pause, Play, Plus, RotateCcw, Search, Trash2, Wallet } from "lucide-react";
import type { getAgents } from "@/lib/trading/agents/service";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import { api, dayFmt, errorText, eur, eur0, field, ghost, int, pct, primary, th, tone } from "./format";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { EquityCurve, withLivePoint } from "./equity-chart";
import { AgentAvatar, cap, card, ErrorNote, LoadingCard, Modal, Pill, ReturnPill, Rich } from "./ui";
import { AssetIcon } from "./asset-icon";
import { DataTable, Money } from "./table";
import { MirrorModal } from "./mirror-modal";

export type Data = Awaited<ReturnType<typeof getAgents>> & { canManage: boolean; canCopy: boolean };
type Portfolio = Awaited<ReturnType<typeof getPortfolio>>;
export type Agent = Data["agents"][number];

const ACTION: Record<string, string> = { comprar: "Compra", vender: "Venta", mantener: "Mantener", vigilar: "Vigilar" };
const STATUS: Record<string, { label: string; tone: string }> = {
  ejecutada: { label: "Ejecutada", tone: "text-emerald-700" },
  propuesta: { label: "Pendiente", tone: "text-slate-600" },
  descartada: { label: "No se ejecutó", tone: "text-amber-700" },
  rechazada: { label: "Frenada por las reglas", tone: "text-red-700" },
};

export const when = (iso: string | null | undefined) =>
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


export function AgentsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const [copyFor, setCopyFor] = useState<Agent | null>(null);
  const [mirrorFor, setMirrorFor] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Enlaces antiguos (?agent=…): ahora cada agente tiene su página.
  const legacy = params.get("agent");
  useEffect(() => {
    if (legacy) router.replace(`/trading/agentes/${legacy}`);
  }, [legacy, router]);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<(typeof PROFILES)[number]>("todos");
  const [sort, setSort] = useState<SortKey>("rentabilidad");
  const [layout, setLayout] = useState<"cards" | "list">("cards");
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

  const meet = async (a: Agent) => {
    setBusy(a.key);
    try {
      await api("agents/run", { agent: a.key });
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
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
  const bench = data.agents[0]?.benchmark;
  const openDetail = (key: string) => router.push(`/trading/agentes/${key}`);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Barra del catálogo: buscar, filtrar, ordenar y cambiar de vista */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[220px] sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className={`${field} w-full pl-9`} placeholder="Buscar agente, perfil o creador" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar agentes" />
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none]">
          {PROFILES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProfile(p)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${profile === p ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
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
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-6 text-center text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Plus className="h-6 w-6" />
            </span>
            <span className="text-[15px] font-semibold text-slate-900">Crear agente</span>
            <span className="max-w-[240px] text-xs">Elige su carácter, su riesgo y en qué mercados opera.</span>
          </button>
          {list.map((a) => (
            <AgentCard
              key={a.key}
              a={a}
              rank={rank.get(a.key) ?? 0}
              canManage={data.canManage}
              canCopy={data.canCopy}
              busy={busy === a.key}
              onDetail={() => openDetail(a.key)}
              onCopy={() => setCopyFor(a)}
              onMirror={() => setMirrorFor(a)}
              onMeet={() => void meet(a)}
              onReset={() => void reset(a)}
            />
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

      {copyFor && <CopyModal agent={copyFor} onClose={() => setCopyFor(null)} />}
      {mirrorFor && <MirrorModal agent={mirrorFor.key} name={mirrorFor.name} onClose={() => setMirrorFor(null)} />}
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
    </div>
  );
}

/** Los agentes de ahora son de la casa; cuando haya agentes de usuarios, aquí irá su autor. */
const CREATOR = { name: "Crussader", logo: "/email/logo-mark.png" };

export function Creator() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo propio, pequeño */}
      <img src={CREATOR.logo} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-md" />
      {CREATOR.name}
    </span>
  );
}

/** «lleva 12 días», «lleva 3 meses»… */
export function runningFor(iso: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days < 1) return "empezó hoy";
  if (days < 45) return `lleva ${days} ${days === 1 ? "día" : "días"}`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `lleva ${months} meses`;
  const years = Math.floor(months / 12);
  return `lleva ${years} ${years === 1 ? "año" : "años"}`;
}

/** Lo que tienes con este agente: copia virtual y/o copia en tu exchange. */
export function CopyBadges({ a }: { a: Agent }) {
  if (a.copyWeightPct === null && !a.mirror) return null;
  return (
    <div className="space-y-1">
      {a.copyWeightPct !== null && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <span className="flex items-center gap-1.5 font-medium">
            <Copy className="h-3.5 w-3.5" /> Lo copias al {a.copyWeightPct} %
          </span>
          {a.copyReturnPct !== null && (
            <span className={`font-semibold tabular-nums ${tone(a.copyReturnPct)}`} title="Rentabilidad de tu copia desde que la empezaste">
              {pct(a.copyReturnPct)} desde que lo copias
            </span>
          )}
        </div>
      )}
      {a.mirror && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-800">
          <span className="flex items-center gap-1.5 font-medium">
            <Wallet className="h-3.5 w-3.5" /> {a.mirror.mode === "real" ? "Copia real" : "Copia en ensayo"} · {eur(a.mirror.budget, 2)}
          </span>
          <span className={`font-semibold tabular-nums ${tone(a.mirror.result)}`}>
            {a.mirror.result >= 0 ? "+" : ""}
            {eur(a.mirror.result, 2)}
          </span>
        </div>
      )}
    </div>
  );
}

type MenuItem = { label: string; icon: typeof Copy; onClick?: () => void; soon?: boolean; danger?: boolean; disabledReason?: string };

/** Menú de tres puntos: se cierra al pulsar fuera o con Escape. */
export function DotsMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-slate-100 bg-white py-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
          {items.map((it) => {
            const disabled = it.soon || !!it.disabledReason || !it.onClick;
            return (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={disabled}
                title={it.disabledReason ?? (it.soon ? "Muy pronto" : undefined)}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${disabled ? "cursor-not-allowed text-slate-400" : it.danger ? "text-red-700 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <it.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{it.label}</span>
                {it.soon && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Pronto</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Acciones de un agente (tarjeta y página). */
export function agentMenu(
  a: Agent,
  o: { canManage: boolean; canCopy: boolean; onDetail?: () => void; onCopy: () => void; onMirror: () => void; onMeet: () => void; onReset: () => void },
): MenuItem[] {
  const items: MenuItem[] = [];
  if (o.onDetail) items.push({ label: "Ver su página", icon: ArrowRight, onClick: o.onDetail });
  if (!a.kamikaze)
    items.push({ label: a.copyWeightPct !== null ? "Cambiar la copia" : "Copiar", icon: Copy, onClick: o.canCopy ? o.onCopy : undefined, disabledReason: o.canCopy ? undefined : "Solo el propietario o un administrador" });
  items.push({ label: a.mirror ? "Copia con dinero real…" : "Copiar con dinero real", icon: Wallet, onClick: o.canCopy ? o.onMirror : undefined, disabledReason: o.canCopy ? undefined : "Solo el propietario o un administrador" });
  items.push({ label: "Pausar", icon: Pause, soon: true });
  items.push({ label: "Duplicar", icon: CopyPlus, soon: true });
  if (o.canManage) {
    items.push({ label: "Reunir ahora", icon: Play, onClick: o.onMeet });
    items.push({ label: "Reiniciar", icon: RotateCcw, onClick: o.onReset, danger: true });
  }
  items.push({ label: "Eliminar", icon: Trash2, danger: true, disabledReason: "Los agentes de Crussader no se pueden eliminar; los tuyos sí" });
  return items;
}

function AgentCard({
  a,
  rank,
  canManage,
  canCopy,
  busy,
  onDetail,
  onCopy,
  onMirror,
  onMeet,
  onReset,
}: {
  a: Agent;
  rank: number;
  canManage: boolean;
  canCopy: boolean;
  busy: boolean;
  onDetail: () => void;
  onCopy: () => void;
  onMirror: () => void;
  onMeet: () => void;
  onReset: () => void;
}) {
  const open = a.positions.filter((p) => p.status === "abierta").length;
  const pending = a.positions.filter((p) => p.status === "pendiente").length;
  const k = a.kamikaze;
  return (
    <article
      role="link"
      tabIndex={0}
      onClick={onDetail}
      onKeyDown={(e) => e.key === "Enter" && onDetail()}
      className={`${card} group flex cursor-pointer flex-col transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
    >
      <div className="flex items-start justify-between gap-2 px-5 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          <AgentAvatar color={a.color} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-slate-900 group-hover:underline">{a.name}</span>
              <Pill color={a.color}>{cap(a.profile)}</Pill>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500" title="Puesto por rentabilidad">
                #{rank}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-slate-500">{a.tagline}</p>
          </div>
        </div>
        <div className="-mr-2 -mt-1 shrink-0">
          {busy ? (
            <Loader2 className="m-2 h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <DotsMenu label={`Acciones de ${a.name}`} items={agentMenu(a, { canManage, canCopy, onDetail, onCopy, onMirror, onMeet, onReset })} />
          )}
        </div>
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
      <div className="mt-2 px-3">
        <EquityCurve points={withLivePoint(a.equity, a.summary.equity)} initial={a.summary.initialCapital} height={90} empty="La línea aparece tras su primera sesión." />
      </div>
      {(k || a.copyWeightPct !== null || a.mirror) && (
        <div className="mx-5 mb-3 space-y-2">
          {k && <RoundProgress k={k} equity={a.summary.equity} />}
          <CopyBadges a={a} />
        </div>
      )}
      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
        <span className="flex min-w-0 items-center gap-2">
          <Creator />
          <span className="text-[11px] text-slate-400">· {runningFor(a.startedAt)}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
          Ver <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </footer>
    </article>
  );
}

/** Crear agente: el formulario ya está; guardar llegará con los agentes de usuarios. */
function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [profile, setProfile] = useState("equilibrado");
  const [markets, setMarkets] = useState<string[]>(["crypto"]);
  const [style, setStyle] = useState("");
  const toggle = (m: string) => setMarkets((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]));
  return (
    <Modal
      open
      onClose={onClose}
      title="Crear agente"
      subtitle="Tu propio gestor de IA, con tu carácter y tus reglas"
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">Muy pronto: estamos preparando los agentes de usuarios.</span>
          <button type="button" className={ghost} onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className={primary} disabled>
            Crear agente
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Nombre</span>
          <input className={`${field} mt-1 w-full`} placeholder="p. ej. TORTUGA-7" value={name} onChange={(e) => setName(e.target.value.toUpperCase().slice(0, 24))} />
        </label>
        <div>
          <span className="text-xs font-medium text-slate-600">Carácter</span>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["precavido", "equilibrado", "arriesgado", "kamikaze"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProfile(p)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium ${profile === p ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {cap(p)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-xs font-medium text-slate-600">Mercados</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {(
              [
                ["bolsa", "Bolsa española"],
                ["crypto", "Criptomonedas"],
                ["eeuu", "EE. UU. (pronto)"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${k === "eeuu" ? "border-slate-100 text-slate-400" : "border-slate-200 text-slate-700"}`}>
                <input type="checkbox" disabled={k === "eeuu"} checked={markets.includes(k)} onChange={() => toggle(k)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">¿Cómo quieres que piense?</span>
          <textarea
            className={`${field} mt-1 h-24 w-full resize-none`}
            placeholder="p. ej. Solo compra monedas grandes, vende rápido si pierde un 3 % y prefiere no operar a equivocarse."
            value={style}
            onChange={(e) => setStyle(e.target.value.slice(0, 600))}
          />
        </label>
      </div>
    </Modal>
  );
}

export function Decision({ p, pending }: { p: Agent["proposals"][number]; pending: boolean }) {
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

export function CopyModal({ agent: a, onClose }: { agent: Agent; onClose: () => void }) {
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
export function Rounds({ k, equity }: { k: Kamikaze; equity: number }) {
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
