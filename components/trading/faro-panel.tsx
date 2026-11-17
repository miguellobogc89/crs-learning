"use client";
// Oportunidades: una sola tabla con las ideas cripto del analista común (vivas primero), qué habría
// pasado siguiéndolas al pie de la letra y quién entró en cada una. Paginada.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ListFilter, Play } from "lucide-react";
import type { faroView } from "@/lib/trading/faro/engine";
import { api, errorText, eur, pct } from "./format";
import { DataTable, Money, useIsMobile, type Col, type TableSort } from "./table";
import { ago } from "./home-panel";
import { AgentAvatar, AVATAR, ErrorNote, LoadingCard, Modal, Pill, Rich } from "./ui";
import { useTradingRefresh, useWarmStart } from "./navigation";
import { ManualBuyModal, type BuyIdea } from "./manual-buy-modal";
import { AssetIcon } from "./asset-icon";
import { FaroAnalysis } from "./faro-analysis";
import { useSearchParams } from "next/navigation";
import { TableToolbar } from "@/components/ui/table-toolbar";

type Data = Awaited<ReturnType<typeof faroView>>;
type Idea = Data["live"][number];

const KIND: Record<string, { label: string; color: string }> = {
  impulso: { label: "Impulso", color: "orange" },
  ruptura: { label: "Ruptura", color: "violet" },
  rebote: { label: "Rebote", color: "slate" },
  noticia: { label: "Noticia", color: "amber" },
  retroceso: { label: "Retroceso", color: "blue" },
  ruido: { label: "Ruido", color: "slate" },
  tendencia: { label: "Tendencia larga", color: "fuchsia" },
};
const STATUS: Record<string, { label: string; color: string }> = {
  viva: { label: "Viva", color: "blue" },
  acierto: { label: "Acierto", color: "emerald" },
  fallo: { label: "Fallo", color: "rose" },
  caducada: { label: "Caducada", color: "slate" },
  sin_entrar: { label: "Sin entrar", color: "slate" },
};
type IdeaStatus = "all" | "viva" | "acierto" | "fallo" | "caducada" | "sin_entrar";
type IdeaKind = "all" | "impulso" | "ruptura" | "noticia" | "retroceso" | "ruido" | "tendencia";
type ViewMode = "list" | "grid";

const SORT_OPTIONS: { label: string; value: TableSort }[] = [
  { label: "Vivas primero", value: { key: "status", dir: 1 } },
  { label: "Más recientes", value: { key: "date", dir: -1 } },
  { label: "Más antiguas", value: { key: "date", dir: 1 } },
  { label: "Activo A-Z", value: { key: "asset", dir: 1 } },
  { label: "Activo Z-A", value: { key: "asset", dir: -1 } },
  { label: "Mayor convicción", value: { key: "conv", dir: -1 } },
  { label: "Mejor resultado", value: { key: "res", dir: -1 } },
  { label: "Más agentes", value: { key: "who", dir: -1 } },
];

const COLUMN_LABELS: Record<string, string> = {
  asset: "Activo", kind: "Tipo", conv: "Convicción", price: "Detectada a",
  inv: "Invalidación", target: "Objetivo", down: "Puedes perder",
  up: "Puedes ganar", now: "Precio ahora", res: "Resultado",
  status: "Estado", who: "Agentes", date: "Fecha",
};

const tone = (v: number | null) => (v === null ? "text-slate-400" : v > 0.05 ? "text-emerald-600" : v < -0.05 ? "text-rose-600" : "text-slate-600");
const left = (iso: string) => {
  const h = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  return h <= 0 ? "caducada" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${Math.round(h)} h`;
};

/** Oportunidades: las ideas (tablón) y su análisis (rendimiento de FARO), en dos pestañas. */
export function FaroPanel() {
  const params = useSearchParams();
  const view = params.get("vista") === "analisis" ? "analisis" : "ideas";
  const go = (v: "ideas" | "analisis") => {
    const q = new URLSearchParams(params.toString());
    if (v === "ideas") q.delete("vista");
    else q.set("vista", v);
    const qs = q.toString();
    // Solo en el navegador (sin ir al servidor): el cambio de pestaña es instantáneo.
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 gap-1 self-start rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Oportunidades">
        {(
          [
            ["ideas", "Ideas"],
            ["analisis", "Análisis"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => go(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === k ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{view === "analisis" ? <div className="lg:h-full lg:overflow-y-auto lg:pr-1"><FaroAnalysis /></div> : <FaroIdeas />}</div>
    </div>
  );
}

function FaroIdeas() {
  const [data, setData] = useState<Data | null>(null);
  useWarmStart<Data>("faro", setData);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<BuyIdea | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IdeaStatus>("all");
  const [kindFilter, setKindFilter] = useState<IdeaKind>("all");
  const [sort, setSort] = useState<TableSort>({ key: "status", dir: 1 });
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const mobile = useIsMobile();
  const [selected, setSelected] = useState<string | null>(null);
  const [shown, setShown] = useState(30);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>("faro"));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  const all = useMemo(() => (data ? [...data.live, ...data.past] : []), [data]);
  const ideas = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    const filtered = all.filter((idea) => {
      if (statusFilter !== "all" && idea.status !== statusFilter) return false;
      if (kindFilter !== "all" && idea.kind !== kindFilter) return false;
      if (!query) return true;
      return [idea.symbol, idea.kind, KIND[idea.kind]?.label ?? "", idea.rationale, ...idea.participants.map((p) => p.name)]
        .some((value) => value.toLocaleLowerCase("es").includes(query));
    });
    // La fecha no tiene una columna propia; los demás órdenes los aplica DataTable.
    if (sort?.key === "date") {
      return [...filtered].sort((a, b) => a.createdAt.localeCompare(b.createdAt) * sort.dir);
    }
    return filtered;
  }, [all, search, statusFilter, kindFilter, sort]);
  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard />;

  const execute = (i: Idea) => {
    setConfirm({ id: i.id, symbol: i.symbol, kind: i.kind, price: i.lastPrice ?? i.price, invalidation: i.invalidation, target: i.target, rationale: i.rationale, faro2: i.faro2 });
  };
  // Desde el precio de ahora (o el de la idea, si ya terminó): cuánto cae hasta la invalidación y cuánto sube hasta el objetivo.
  const ref = (i: Idea) => (i.status === "viva" ? i.lastPrice ?? i.price : i.price);
  const downPct = (i: Idea) => ((i.invalidation - ref(i)) / ref(i)) * 100;
  const upPct = (i: Idea) => ((i.target - ref(i)) / ref(i)) * 100;
  const pct1 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;

  const columns: Col<Idea>[] = [
    {
      key: "asset",
      label: "Activo",
      width: 12,
      align: "left",
      sort: (i) => i.symbol,
      cell: (i) => (
        <span className="flex items-center gap-2">
          <AssetIcon symbol={i.symbol} name={i.symbol} size="sm" />
          <span className="min-w-0">
            <b className="block truncate font-semibold text-slate-900">{i.symbol.replace(/-EUR$/, "")}</b>
            <span className="block text-xs text-slate-400">{i.market === "us" ? "EE. UU. · " : ""}{ago(i.createdAt)}</span>
          </span>
        </span>
      ),
    },
    { key: "kind", label: "Tipo", width: 7, sort: (i) => KIND[i.kind]?.label ?? i.kind, cell: (i) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <Pill color={(KIND[i.kind] ?? { color: "slate" }).color}>{KIND[i.kind]?.label ?? i.kind}</Pill>
        </span>
      ) },
    {
      key: "order",
      label: "Orden · dónde",
      width: 9,
      sort: (i) => i.howTo?.venue?.roundTripPct ?? 99,
      cell: (i) =>
        i.howTo ? (
          <span className="block text-xs leading-tight">
            <b className="block font-semibold text-slate-700">{i.howTo.order === "limitada" ? "Limitada" : "A mercado"}</b>
            <span className="text-slate-400" title="Exchange con menos comisión para este tipo de orden (comprar y vender)">
              {i.howTo.venue ? `${i.howTo.venue.name} · ${i.howTo.venue.roundTripPct.toFixed(2).replace(".", ",")} %` : "—"}
            </span>
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    { key: "conv", label: "Convicción", width: 6, sort: (i) => i.conviction, cell: (i) => <span className="tabular-nums text-slate-700">{i.conviction}/5</span> },
    { key: "price", label: "Detectada a", width: 8, sort: (i) => i.price, cell: (i) => <Money v={i.price} className="text-slate-700" /> },
    { key: "inv", label: "Invalidación", width: 8, sort: (i) => i.invalidation, cell: (i) => <Money v={i.invalidation} className="text-rose-600" /> },
    { key: "target", label: "Objetivo", width: 8, sort: (i) => i.target, cell: (i) => <Money v={i.target} className="text-emerald-600" /> },
    { key: "down", label: "Puedes perder", width: 7, sort: (i) => downPct(i), cell: (i) => <span className="tabular-nums font-semibold text-rose-600">{pct1(downPct(i))}</span> },
    { key: "up", label: "Puedes ganar", width: 7, sort: (i) => upPct(i), cell: (i) => <span className="tabular-nums font-semibold text-emerald-600">{pct1(upPct(i))}</span> },
    { key: "now", label: "Precio ahora / salida", width: 8, sort: (i) => i.lastPrice, cell: (i) => <Money v={i.lastPrice} className="text-slate-700" /> },
    { key: "res", label: "Resultado por 100 €", width: 9, sort: (i) => i.resultPct, cell: (i) => <Money v={i.resultPct} digits={2} sign className={`font-semibold ${tone(i.resultPct)}`} /> },
    {
      key: "status",
      label: "Estado",
      width: 10,
      sort: (i) => (i.status === "viva" ? 0 : 1),
      cell: (i) => (
        <span className="flex flex-wrap items-center justify-center gap-1.5">
          <Pill color={(STATUS[i.status] ?? STATUS.caducada).color}>{(STATUS[i.status] ?? STATUS.caducada).label}</Pill>
          {i.status === "viva" && <span className="text-xs text-slate-400">{left(i.validUntil)}</span>}
        </span>
      ),
    },
    {
      key: "who",
      label: "Agentes",
      width: 11,
      sort: (i) => i.participants.length,
      cell: (i) =>
        i.participants.length === 0 ? (
          <span className="text-xs text-slate-400">0</span>
        ) : (
          <span className="inline-flex items-center gap-2" title={i.participants.map((p) => p.name).join(", ")}>
            <span className="flex -space-x-2">
              {i.participants.slice(0, 4).map((p, n) => (
                <span key={`${p.who}-${n}`} className={`h-5 w-5 rounded-full ring-2 ring-white ${AVATAR[p.color] ?? AVATAR.slate}`} />
              ))}
            </span>
            <span className="text-xs font-semibold tabular-nums text-slate-700">{i.participants.length}</span>
          </span>
        ),
    },
    {
      key: "act",
      label: "",
      width: 10,
      align: "right",
      cell: (i) => {
        const mineIn = i.participants.some((p) => p.who === "tu");
        return (
          <span className="inline-flex items-center gap-2">
            {i.status === "viva" && i.market !== "us" && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                disabled={mineIn}
                title={mineIn ? "Ya has entrado en esta idea" : "Comprar con tu dinero"}
                onClick={(e) => {
                  e.stopPropagation();
                  execute(i);
                }}
              >
                <Play className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Ejecutar</span>
              </button>
            )}
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </span>
        );
      },
    },
  ];

  const cardIdeas = [...ideas];
  if (sort) {
    const col = columns.find((column) => column.key === sort.key);
    if (col?.sort) {
      const value = col.sort;
      cardIdeas.sort((a, b) => {
        const left = value(a);
        const right = value(b);
        if (left === right) return 0;
        if (left === null || left === undefined) return 1;
        if (right === null || right === undefined) return -1;
        const comparison = typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right, "es", { sensitivity: "base", numeric: true })
          : left < right ? -1 : 1;
        return comparison * sort.dir;
      });
    }
  }

  const detail = (i: Idea) => (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-2 text-sm text-slate-700">
        <Rich text={i.rationale} />
        {i.risks && <p className="text-xs text-slate-500">Riesgos: {i.risks}</p>}
        <p className="text-xs text-slate-500">
          Lo mejor que llegó a ir: <span className={tone(i.bestPct)}>{pct(i.bestPct ?? 0, 1)}</span> · lo peor: <span className={tone(i.worstPct)}>{pct(i.worstPct ?? 0, 1)}</span>
          {i.resolvedAt && ` · resuelta ${ago(i.resolvedAt)}`}
        </p>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Quién entró</div>
        {i.participants.length === 0 ? (
          <p className="text-sm text-slate-500">Nadie entró en esta idea.</p>
        ) : (
          <ul className="space-y-1.5">
            {i.participants.map((p, n) => (
              <li key={`${p.who}-${n}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <AgentAvatar color={p.color} size="sm" />
                  <b className="font-semibold text-slate-900">{p.name}</b>
                  <span className="text-xs text-slate-500">
                    {eur(p.invested)}
                    {p.entry ? ` a ${eur(p.entry)}` : ""} · {p.status}
                  </span>
                </span>
                <span className={`font-semibold ${tone(p.result)}`}>
                  <Money v={p.result} digits={2} sign />
                  {p.resultPct !== null && <span className="ml-1 text-xs font-normal">({pct(p.resultPct, 1)})</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {error && <ErrorNote>{error}</ErrorNote>}
      <FaroToolbar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        kindFilter={kindFilter}
        onKindFilterChange={setKindFilter}
        sort={sort}
        onSortChange={setSort}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      {mobile ? (
        <MobileIdeas
          ideas={cardIdeas.slice(0, shown)}
          total={cardIdeas.length}
          onMore={() => setShown((n) => n + 30)}
          onOpen={setSelected}
          empty={all.length ? "No hay oportunidades que coincidan con la búsqueda o los filtros." : `Todavía no hay ideas. La primera tanda llega en el próximo análisis (cada ${data.everyMinutes} min).`}
          downPct={downPct}
          upPct={upPct}
        />
      ) : viewMode === "list" ? (
        <DataTable
          id="oportunidades"
          height="min-h-0 flex-1"
          columns={columns}
          rows={ideas}
          rowKey={(i) => i.id}
          paginate
          label="ideas"
          sortBy={sort}
          onSortChange={setSort}
          empty={all.length
            ? "No hay oportunidades que coincidan con la búsqueda o los filtros."
            : `Todavía no hay ideas. La primera tanda llega en el próximo análisis (cada ${data.everyMinutes} min).`}
          expand={detail}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {ideas.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {all.length
                ? "No hay oportunidades que coincidan con la búsqueda o los filtros."
                : `Todavía no hay ideas. La primera tanda llega en el próximo análisis (cada ${data.everyMinutes} min).`}
            </p>
          ) : (
            <div className="grid gap-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
              {cardIdeas.map((idea) => {
                const mineIn = idea.participants.some((p) => p.who === "tu");
                const expanded = expandedCard === idea.id;
                return (
                  <article key={idea.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <AssetIcon symbol={idea.symbol} name={idea.symbol} size="sm" />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{idea.symbol.replace(/-EUR$/, "")}</p>
                          <p className="text-xs text-slate-500">{ago(idea.createdAt)}</p>
                        </div>
                      </div>
                      <Pill color={STATUS[idea.status]?.color ?? "slate"}>{STATUS[idea.status]?.label ?? idea.status}</Pill>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <Pill color={KIND[idea.kind]?.color ?? "slate"}>{KIND[idea.kind]?.label ?? idea.kind}</Pill>
                      <span className="text-slate-500">Convicción {idea.conviction}/5</span>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs text-slate-500">Detectada a</dt><dd><Money v={idea.price} /></dd></div>
                      <div><dt className="text-xs text-slate-500">Precio ahora / salida</dt><dd><Money v={idea.lastPrice} /></dd></div>
                      <div><dt className="text-xs text-slate-500">Puedes perder</dt><dd className="font-semibold tabular-nums text-rose-600">{pct1(downPct(idea))}</dd></div>
                      <div><dt className="text-xs text-slate-500">Puedes ganar</dt><dd className="font-semibold tabular-nums text-emerald-600">{pct1(upPct(idea))}</dd></div>
                      <div><dt className="text-xs text-slate-500">Invalidación</dt><dd><Money v={idea.invalidation} /></dd></div>
                      <div><dt className="text-xs text-slate-500">Objetivo</dt><dd><Money v={idea.target} /></dd></div>
                      <div><dt className="text-xs text-slate-500">Resultado por 100 €</dt><dd className={`font-semibold ${tone(idea.resultPct)}`}><Money v={idea.resultPct} digits={2} sign /></dd></div>
                      <div><dt className="text-xs text-slate-500">Agentes</dt><dd className="font-semibold tabular-nums">{idea.participants.length}</dd></div>
                    </dl>
                    {expanded && <div className="border-t border-slate-100 pt-3">{detail(idea)}</div>}
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
                        onClick={() => setExpandedCard(expanded ? null : idea.id)}
                        aria-expanded={expanded}
                      >
                        Detalles <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </button>
                      {idea.status === "viva" && idea.market !== "us" && (
                        <button
                          type="button"
                          disabled={mineIn}
                          onClick={() => execute(idea)}
                          title={mineIn ? "Ya has entrado en esta idea" : "Comprar con tu dinero"}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Play className="h-3.5 w-3.5" /> Ejecutar
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
      {mobile && selected && (() => {
        const i = all.find((x) => x.id === selected);
        if (!i) return null;
        const mineIn = i.participants.some((p) => p.who === "tu");
        return (
          <Modal
            open
            onClose={() => setSelected(null)}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {i.symbol.replace(/-EUR$/, "")}
                <Pill color={(KIND[i.kind] ?? { color: "slate" }).color}>{KIND[i.kind]?.label ?? i.kind}</Pill>
                <Pill color={(STATUS[i.status] ?? STATUS.caducada).color}>{(STATUS[i.status] ?? STATUS.caducada).label}</Pill>
              </span>
            }
            subtitle={`${ago(i.createdAt)} · convicción ${i.conviction}/5${i.status === "viva" ? ` · le quedan ${left(i.validUntil)}` : ""}`}
            footer={
              i.status === "viva" && i.market !== "us" ? (
                <button
                  type="button"
                  disabled={mineIn}
                  onClick={() => {
                    setSelected(null);
                    execute(i);
                  }}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white active:bg-blue-700 disabled:opacity-50"
                >
                  <Play className="h-5 w-5" /> {mineIn ? "Ya has entrado" : "Ejecutar"}
                </button>
              ) : undefined
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {(
                  [
                    ["Detectada a", eur(i.price), "text-slate-900"],
                    [i.status === "viva" ? "Precio ahora" : "Salida", i.lastPrice !== null ? eur(i.lastPrice) : "—", "text-slate-900"],
                    ["Invalidación", eur(i.invalidation), "text-rose-700"],
                    ["Objetivo", eur(i.target), "text-emerald-700"],
                    ["Puedes perder", pct1(downPct(i)), "text-rose-700"],
                    ["Puedes ganar", pct1(upPct(i)), "text-emerald-700"],
                  ] as const
                ).map(([label, value, cls]) => (
                  <div key={label}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                    <div className={`mt-0.5 text-base font-semibold tabular-nums ${cls}`}>{value}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="text-slate-600">Resultado por 100 €</span>
                <b className={`text-base tabular-nums ${tone(i.resultPct)}`}>{i.resultPct === null ? "—" : `${i.resultPct > 0 ? "+" : ""}${eur(i.resultPct, 2)}`}</b>
              </div>
              {detail(i)}
            </div>
          </Modal>
        );
      })()}
      {confirm && <ManualBuyModal idea={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}


function FaroToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  kindFilter,
  onKindFilterChange,
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: IdeaStatus;
  onStatusFilterChange: (value: IdeaStatus) => void;
  kindFilter: IdeaKind;
  onKindFilterChange: (value: IdeaKind) => void;
  sort: TableSort;
  onSortChange: (value: TableSort) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
}) {
  return (
    <TableToolbar
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Buscar en Oportunidades..."
      filters={{
        groups: [
          { key: "status", label: "Estado", value: statusFilter, allLabel: "Todos los estados", options: (["viva", "acierto", "fallo", "caducada"] as const).map((s) => ({ value: s, label: STATUS[s].label })) },
          { key: "kind", label: "Tipo de oportunidad", value: kindFilter, allLabel: "Todos los tipos", allIcon: ListFilter, options: (["impulso", "ruptura", "noticia", "retroceso", "ruido", "tendencia"] as const).map((k) => ({ value: k, label: KIND[k].label })) },
        ],
        onChange: (key, value) => (key === "status" ? onStatusFilterChange(value as IdeaStatus) : onKindFilterChange(value as IdeaKind)),
        onClear: () => {
          onStatusFilterChange("all");
          onKindFilterChange("all");
        },
      }}
      sort={{ value: sort, options: SORT_OPTIONS.map((o) => ({ label: o.label, value: o.value! })), onChange: onSortChange, columnLabels: COLUMN_LABELS, textKeys: ["asset"] }}
      view={{ value: viewMode, onChange: onViewModeChange }}
    />
  );
}

/**
 * Móvil: las ideas como lista compacta (dos líneas por idea) y «Ver más» en vez de páginas. Al tocar
 * una, su detalle sube desde abajo con «Ejecutar».
 */
function MobileIdeas({
  ideas,
  total,
  onMore,
  onOpen,
  empty,
  downPct,
  upPct,
}: {
  ideas: Idea[];
  total: number;
  onMore: () => void;
  onOpen: (id: string) => void;
  empty: string;
  downPct: (i: Idea) => number;
  upPct: (i: Idea) => number;
}) {
  const p1 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;
  if (!ideas.length) return <p className="py-10 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="-mx-3">
      <ul className="divide-y divide-slate-100 border-y border-slate-100">
        {ideas.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onOpen(i.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-slate-50">
              <AssetIcon symbol={i.symbol} name={i.symbol} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <b className="truncate text-[15px] font-semibold text-slate-900">{i.symbol.replace(/-EUR$/, "")}</b>
                  <Pill color={(KIND[i.kind] ?? { color: "slate" }).color} className="!px-2 !text-[11px]">
                    {KIND[i.kind]?.label ?? i.kind}
                  </Pill>
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {(STATUS[i.status] ?? STATUS.caducada).label}
                  {i.status === "viva" ? ` · ${left(i.validUntil)}` : ` · ${ago(i.createdAt)}`} · {p1(upPct(i))} / {p1(downPct(i))}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <b className={`block text-sm font-semibold tabular-nums ${tone(i.resultPct)}`}>{i.resultPct === null ? "—" : `${i.resultPct > 0 ? "+" : ""}${eur(i.resultPct, 2)}`}</b>
                <span className="block text-[11px] text-slate-400">por 100 €</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {ideas.length < total && (
        <button type="button" onClick={onMore} className="mx-3 my-3 flex h-11 w-[calc(100%-1.5rem)] items-center justify-center rounded-xl border border-slate-200 text-sm font-medium text-slate-700 active:bg-slate-50">
          Ver más ({total - ideas.length})
        </button>
      )}
    </div>
  );
}
