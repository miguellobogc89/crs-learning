"use client";
// Actividad: lo último que han hecho los agentes (compras, ventas, stops, objetivos). Al pulsar el
// operador se abre su página; al pulsar el movimiento, un panel lateral con el detalle.
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Bot, ChevronRight, Clock, OctagonX, ShieldCheck, Target } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { getAgents } from "@/lib/trading/agents/service";
import { api, eur, errorText, MEETINGS_TEXT, pct } from "./format";
import { ago } from "./home-panel";
import { useTradingRefresh, useWarmStart } from "./navigation";
import { AVATAR, ErrorNote, LoadingCard, ReturnPill, Rich } from "./ui";
import { AssetIcon } from "./asset-icon";
import { DataTable, Money, type Col, type TableSort } from "./table";
import { TableToolbar } from "@/components/ui/table-toolbar";

type Agents = Awaited<ReturnType<typeof getAgents>>;

type Move = Agents["moves"][number];

/** Cada tipo de operación: nombre, icono y color de su pastilla. */
const OP: Record<Move["kind"], { label: string; icon: ComponentType<{ className?: string }>; cls: string }> = {
  compra: { label: "Compra", icon: ArrowDownLeft, cls: "bg-blue-50 text-blue-700 ring-blue-100" },
  venta: { label: "Venta", icon: ArrowUpRight, cls: "bg-violet-50 text-violet-700 ring-violet-100" },
  protege: { label: "Sube stop", icon: ShieldCheck, cls: "bg-amber-50 text-amber-700 ring-amber-100" },
  stop: { label: "Stop", icon: OctagonX, cls: "bg-rose-50 text-rose-700 ring-rose-100" },
  objetivo: { label: "Objetivo", icon: Target, cls: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  tiempo: { label: "Por tiempo", icon: Clock, cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};

function OpPill({ kind }: { kind: Move["kind"] }) {
  const op = OP[kind] ?? OP.tiempo;
  const Icon = op.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${op.cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {op.label}
    </span>
  );
}

const price = (v: number | null | undefined) => (v === null || v === undefined ? "—" : eur(v, v < 1 ? 6 : 2));
const STATUS: Record<string, string> = { abierta: "Abierta", pendiente: "Pendiente", cerrada: "Cerrada" };
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));

function Result({ m, align = "right" }: { m: Move; align?: "left" | "right" }) {
  if (m.pnl === null) return <span className="text-slate-400">—</span>;
  return (
    <span className={`flex flex-col ${align === "right" ? "items-end" : "items-start"} gap-0.5`}>
      <span className={`font-semibold tabular-nums ${m.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
        <Money v={m.pnl} digits={2} sign />
      </span>
      <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
        {m.detail.pnlPct !== null && <ReturnPill value={m.detail.pnlPct} />}
        {m.pnlType === "latente" ? "en curso" : "cerrado"}
      </span>
    </span>
  );
}

function Asset({ m }: { m: Move }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <AssetIcon symbol={m.symbol} name={m.asset} size="md" />
      <span className="min-w-0">
        <b className="block truncate font-semibold text-slate-900">{m.asset}</b>
        <span className="block truncate text-[11px] uppercase tracking-wide text-slate-400">{m.symbol}</span>
      </span>
    </span>
  );
}

/** Entrada → salida (o precio actual si sigue abierta). */
function Prices({ m }: { m: Move }) {
  const d = m.detail;
  const end = d.exitPrice ?? d.lastPrice;
  if (d.entryPrice === null && end === null) return <span className="text-slate-400">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums text-slate-600">
      {price(d.entryPrice)} <span className="text-slate-300">→</span> {price(end)}
      <span className="block text-[11px] text-slate-400">{d.exitPrice !== null ? "entrada → salida" : "entrada → ahora"}</span>
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium tabular-nums text-slate-900">{children}</dd>
    </div>
  );
}

/** Panel lateral con el detalle de un movimiento. */
function MoveDetail({ m, onClose, onAgent }: { m: Move | null; onClose: () => void; onAgent: (key: string) => void }) {
  const d = m?.detail;
  return (
    <Sheet open={!!m} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {m && d && (
          <>
            <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
              <div className="flex items-center gap-2">
                <OpPill kind={m.kind} />
                {d.status && <span className="text-xs text-slate-400">Posición {STATUS[d.status]?.toLowerCase()}</span>}
              </div>
              <SheetTitle className="mt-3 flex items-center gap-2 text-lg font-semibold text-slate-950">
                <AssetIcon symbol={m.symbol} name={m.asset} size="sm" />
                {m.asset}
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm text-slate-500">
                {dateTime(m.at)} ·{" "}
                <button type="button" className="font-medium text-blue-600 hover:underline" onClick={() => onAgent(m.agent)}>
                  {m.name}
                </button>
              </SheetDescription>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{m.pnlType === "latente" ? "Resultado en curso" : "Resultado"}</p>
              <div className="mt-1 flex items-center gap-3">
                <span className={`text-3xl font-bold tabular-nums ${m.pnl === null ? "text-slate-400" : m.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {m.pnl === null ? "—" : <Money v={m.pnl} digits={2} sign />}
                </span>
                {d.pnlPct !== null && <ReturnPill value={d.pnlPct} big />}
              </div>
              <dl className="mt-4 divide-y divide-slate-100">
                <Row label="Precio de compra">{price(d.entryPrice)}</Row>
                {d.entryDay && <Row label="Entrada">{d.entryDay}</Row>}
                {d.exitPrice !== null ? (
                  <Row label="Precio de salida">{price(d.exitPrice)}</Row>
                ) : (
                  <Row label="Precio actual">{price(d.lastPrice)}</Row>
                )}
                {d.exitDay && <Row label="Salida">{d.exitDay}</Row>}
                {d.exitReason && <Row label="Motivo de salida">{d.exitReason}</Row>}
                {d.quantity !== null && <Row label="Cantidad">{d.quantity.toLocaleString("es-ES", { maximumFractionDigits: 6 })}</Row>}
                {d.entryPrice !== null && d.quantity !== null && <Row label="Invertido">{eur(d.entryPrice * d.quantity, 2)}</Row>}
                <Row label="Stop">
                  {price(d.stop)}
                  {d.stop !== null && d.entryPrice ? <span className="ml-1 text-xs font-normal text-slate-400">({pct(((d.stop - d.entryPrice) / d.entryPrice) * 100)})</span> : null}
                </Row>
                <Row label="Objetivo">
                  {price(d.target)}
                  {d.target !== null && d.entryPrice ? <span className="ml-1 text-xs font-normal text-slate-400">({pct(((d.target - d.entryPrice) / d.entryPrice) * 100)})</span> : null}
                </Row>
                {d.conviction !== null && <Row label="Convicción">{d.conviction}/10</Row>}
              </dl>
              <p className="mt-6 text-xs font-medium uppercase tracking-wide text-slate-400">Por qué</p>
              <div className="mt-2 text-sm leading-relaxed text-slate-700">
                {m.text ? <Rich text={m.text} /> : m.pnl !== null && m.pnlType === "realizado" ? "Cierre automático de la posición al tocar su nivel." : "Movimiento registrado en la cartera del agente."}
              </div>
              <button
                type="button"
                onClick={() => onAgent(m.agent)}
                className="mt-6 flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
              >
                Ver a {m.name}
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ActivityPanel({ header }: { header?: ReactNode } = {}) {
  const router = useRouter();
  const [data, setData] = useState<Agents | null>(null);
  // Usa los mismos datos que Operadores: si ya están cargados, se ve al instante.
  useWarmStart<Agents>("agents", setData);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Move | null>(null);
  const [query, setQuery] = useState("");
  const [activitySort, setActivitySort] = useState<TableSort>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Agents>("agents"));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <LoadingCard />;
  const q = query.trim().toLocaleLowerCase("es");
  const moves: Move[] = q
    ? data.moves.filter((m) => [m.name, m.asset, m.kind, OP[m.kind]?.label ?? ""].some((value) => value.toLocaleLowerCase("es").includes(q)))
    : data.moves;
  const openAgent = (key: string) => router.push(`/trading/agentes/${key}?from=inicio`);
  const columns: Col<Move>[] = [
    {
      key: "who",
      label: "Operador",
      width: 17,
      align: "left",
      sort: (m) => m.name,
      cell: (m) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openAgent(m.agent);
          }}
          className="group flex min-w-0 items-center gap-2 text-left"
          title={`Ver a ${m.name}`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${AVATAR[m.color] ?? AVATAR.slate} text-white`}>
            <Bot className="h-3.5 w-3.5" />
          </span>
          <b className="truncate font-semibold text-slate-900 group-hover:text-blue-600 group-hover:underline">{m.name}</b>
        </button>
      ),
    },
    { key: "kind", label: "Operación", width: 14, align: "left", sort: (m) => OP[m.kind]?.label ?? "", cell: (m) => <OpPill kind={m.kind} /> },
    { key: "asset", label: "Activo", width: 20, align: "left", sort: (m) => m.asset, cell: (m) => <Asset m={m} /> },
    { key: "prices", label: "Precio", width: 19, align: "right", cell: (m) => <Prices m={m} /> },
    { key: "pnl", label: "Resultado", width: 16, align: "right", sort: (m) => m.pnl, cell: (m) => <Result m={m} /> },
    {
      key: "at",
      label: "Cuándo",
      width: 11,
      align: "right",
      sort: (m) => new Date(m.at).getTime(),
      cell: (m) => <span className="whitespace-nowrap text-slate-500" title={dateTime(m.at)}>{ago(m.at)}</span>,
    },
    { key: "open", label: "", width: 3, cell: () => <ChevronRight className="mx-auto h-4 w-4 text-slate-300" /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DataTable
        id="actividad-v2"
        height="min-h-0 flex-1"
        header={<div className="flex flex-col gap-3">{header}<TableToolbar search={query} onSearchChange={setQuery} searchPlaceholder="Buscar en Actividad..." sort={{ value: activitySort, onChange: setActivitySort, options: [
          { label: "Más recientes", value: { key: "at", dir: -1 } },
          { label: "Más antiguos", value: { key: "at", dir: 1 } },
          { label: "Operador: A-Z", value: { key: "who", dir: 1 } },
          { label: "Activo: A-Z", value: { key: "asset", dir: 1 } },
          { label: "Resultado: mayor a menor", value: { key: "pnl", dir: -1 } },
        ] }} /></div>}
        columns={columns}
        sortBy={activitySort}
        onSortChange={setActivitySort}
        hideMobileSort
        rows={moves}
        rowKey={(m) => `${m.kind}-${m.id}`}
        paginate
        label="movimientos"
        empty={`Los agentes aún no han operado. ${MEETINGS_TEXT}`}
        onRowClick={setSelected}
        mobileRow={{
          sub: (m) => (
            <span className="flex items-center gap-2">
              <OpPill kind={m.kind} />
              <span className="truncate">{m.asset} · {ago(m.at)}</span>
            </span>
          ),
          right: (m) => <Result m={m} />,
        }}
      />
      <MoveDetail m={selected} onClose={() => setSelected(null)} onAgent={openAgent} />
    </div>
  );
}
