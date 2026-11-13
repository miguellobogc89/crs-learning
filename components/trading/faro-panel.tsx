"use client";
// Oportunidades: una sola tabla con las ideas cripto del analista común (vivas primero), qué habría
// pasado siguiéndolas al pie de la letra y quién entró en cada una. Paginada.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownAZ, ArrowDownZA, Check, ChevronDown, Filter, Grid2X2, List, ListFilter, Play } from "lucide-react";
import type { faroView } from "@/lib/trading/faro/engine";
import { api, errorText, eur, pct } from "./format";
import { DataTable, Money, type Col, type TableSort } from "./table";
import { ago } from "./home-panel";
import { AgentAvatar, AVATAR, ErrorNote, LoadingCard, Pill, Rich } from "./ui";
import { useTradingRefresh } from "./navigation";
import { ManualBuyModal, type BuyIdea } from "./manual-buy-modal";
import { AssetIcon } from "./asset-icon";
import { SearchInput } from "@/components/ui/search-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Data = Awaited<ReturnType<typeof faroView>>;
type Idea = Data["live"][number];

const KIND: Record<string, { label: string; color: string }> = {
  impulso: { label: "Impulso", color: "orange" },
  ruptura: { label: "Ruptura", color: "violet" },
  rebote: { label: "Rebote", color: "blue" },
  noticia: { label: "Noticia", color: "amber" },
};
const STATUS: Record<string, { label: string; color: string }> = {
  viva: { label: "Viva", color: "blue" },
  acierto: { label: "Acierto", color: "emerald" },
  fallo: { label: "Fallo", color: "rose" },
  caducada: { label: "Caducada", color: "slate" },
};
type IdeaStatus = "all" | "viva" | "acierto" | "fallo" | "caducada";
type IdeaKind = "all" | "impulso" | "ruptura" | "rebote" | "noticia";
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

export function FaroPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<BuyIdea | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IdeaStatus>("all");
  const [kindFilter, setKindFilter] = useState<IdeaKind>("all");
  const [sort, setSort] = useState<TableSort>({ key: "status", dir: 1 });
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

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
    setConfirm({ id: i.id, symbol: i.symbol, kind: i.kind, price: i.lastPrice ?? i.price, invalidation: i.invalidation, target: i.target, rationale: i.rationale });
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
            <span className="block text-xs text-slate-400">{ago(i.createdAt)}</span>
          </span>
        </span>
      ),
    },
    { key: "kind", label: "Tipo", width: 7, sort: (i) => KIND[i.kind]?.label ?? i.kind, cell: (i) => <Pill color={(KIND[i.kind] ?? { color: "slate" }).color}>{KIND[i.kind]?.label ?? i.kind}</Pill> },
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
          <Pill color={STATUS[i.status].color}>{STATUS[i.status].label}</Pill>
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
            {i.status === "viva" && (
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
      {viewMode === "list" ? (
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
                      {idea.status === "viva" && (
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
  const count = Number(statusFilter !== "all") + Number(kindFilter !== "all");
  const current = SORT_OPTIONS.find((item) => item.value?.key === sort?.key && item.value?.dir === sort?.dir);
  const sortLabel = current?.label ?? (sort ? (COLUMN_LABELS[sort.key] ?? sort.key) + (sort.dir === 1 ? " ↑" : " ↓") : "Ordenar");
  const SortIcon = sort?.key === "asset" ? (sort.dir === 1 ? ArrowDownAZ : ArrowDownZA) : ListFilter;
  const buttonStyle = "inline-flex h-control-lg items-center gap-2 rounded-xl border-0 bg-white px-3.5 text-body font-medium text-slate-700 shadow-none outline-none transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0";
  const viewStyle = "inline-flex size-control-md items-center justify-center rounded-lg border-0 shadow-none outline-none transition-colors duration-150 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0";

  return (
    <div className="knowledge-toolbar-container shrink-0">
      <div className="knowledge-explorer-controls">
        <SearchInput
          className="knowledge-explorer-controls__search min-w-0"
          placeholder="Buscar en Oportunidades..."
          value={search}
          onChange={onSearchChange}
        />
        <div className="knowledge-explorer-controls__actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={buttonStyle + " knowledge-filter-trigger"} title="Filtrar" aria-label="Filtrar">
                <Filter className="size-icon-md" strokeWidth={2.25} />
                <span className="knowledge-toolbar-label">Filtrar</span>
                {count > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-semibold text-white">{count}</span>
                )}
                <ChevronDown className="knowledge-toolbar-chevron size-icon-md text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="flex items-center justify-between px-2 py-1.5">
                <DropdownMenuLabel className="p-0">Filtros</DropdownMenuLabel>
                {count > 0 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      onStatusFilterChange("all");
                      onKindFilterChange("all");
                    }}
                    className="text-caption font-medium text-slate-700 transition-colors hover:text-slate-950 hover:underline"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-caption text-muted-foreground">Estado</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as IdeaStatus)}>
                <DropdownMenuRadioItem value="all"><Check className="mr-2 size-icon-md" />Todos los estados</DropdownMenuRadioItem>
                {(["viva", "acierto", "fallo", "caducada"] as const).map((status) => (
                  <DropdownMenuRadioItem key={status} value={status}>{STATUS[status].label}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-caption text-muted-foreground">Tipo de oportunidad</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={kindFilter} onValueChange={(value) => onKindFilterChange(value as IdeaKind)}>
                <DropdownMenuRadioItem value="all"><ListFilter className="mr-2 size-icon-md" />Todos los tipos</DropdownMenuRadioItem>
                {(["impulso", "ruptura", "rebote", "noticia"] as const).map((kind) => (
                  <DropdownMenuRadioItem key={kind} value={kind}>{KIND[kind].label}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={buttonStyle + " knowledge-sort-trigger min-w-40 max-w-full justify-between"}
                title={"Ordenar por " + sortLabel}
                aria-label={"Ordenar por " + sortLabel}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SortIcon className="size-icon-md" />
                  <span className="knowledge-toolbar-label truncate">{sortLabel}</span>
                </span>
                <ChevronDown className="knowledge-toolbar-chevron size-icon-md text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={sort ? sort.key + ":" + sort.dir : ""}
                onValueChange={(value) => {
                  const option = SORT_OPTIONS.find((item) => item.value && item.value.key + ":" + item.value.dir === value);
                  if (option) onSortChange(option.value);
                }}
              >
                {SORT_OPTIONS.map(({ label, value }) => (
                  <DropdownMenuRadioItem key={label} value={value!.key + ":" + value!.dir}>{label}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="knowledge-view-toggle ml-1 flex h-control-lg items-center rounded-xl border-0 bg-white p-1 shadow-none">
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              className={viewStyle + (viewMode === "grid" ? " bg-slate-100 text-slate-950" : " bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700")}
              title="Vista de tarjetas"
              aria-label="Vista de tarjetas"
              aria-pressed={viewMode === "grid"}
            >
              <Grid2X2 className="size-icon-md" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={viewStyle + (viewMode === "list" ? " bg-slate-100 text-slate-950" : " bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700")}
              title="Vista de lista"
              aria-label="Vista de lista"
              aria-pressed={viewMode === "list"}
            >
              <List className="size-icon-md" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
