"use client";
// Oportunidades: una sola tabla con las ideas cripto del analista común (vivas primero), qué habría
// pasado siguiéndolas al pie de la letra y quién entró en cada una. Paginada.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import type { faroView } from "@/lib/trading/faro/engine";
import { api, errorText, eur, pct } from "./format";
import { DataTable, Money, type Col } from "./table";
import { ago } from "./home-panel";
import { AgentAvatar, AVATAR, ErrorNote, LoadingCard, Pill, Rich } from "./ui";
import { useTradingRefresh } from "./navigation";
import { ManualBuyModal, type BuyIdea } from "./manual-buy-modal";
import { AssetIcon } from "./asset-icon";

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
const tone = (v: number | null) => (v === null ? "text-slate-400" : v > 0.05 ? "text-emerald-600" : v < -0.05 ? "text-rose-600" : "text-slate-600");
const left = (iso: string) => {
  const h = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  return h <= 0 ? "caducada" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${Math.round(h)} h`;
};

export function FaroPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<BuyIdea | null>(null);

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
      <DataTable
        id="oportunidades"
        height="min-h-0 flex-1"
        columns={columns}
        rows={all}
        rowKey={(i) => i.id}
        paginate
        label="ideas"
        empty={`Todavía no hay ideas. La primera tanda llega en el próximo análisis (cada ${data.everyMinutes} min).`}
        expand={detail}
      />
      {confirm && <ManualBuyModal idea={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
