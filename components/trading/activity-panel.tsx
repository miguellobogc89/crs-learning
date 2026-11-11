"use client";
// Actividad: lo último que han hecho los agentes (compras, ventas, stops, objetivos), en una tabla
// con el estilo de Oportunidades. Al desplegar una fila se ve el porqué.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bot, ChevronDown } from "lucide-react";
import type { getAgents } from "@/lib/trading/agents/service";
import { api, eur, errorText, MEETINGS_TEXT } from "./format";
import { ago } from "./home-panel";
import { useTradingRefresh } from "./navigation";
import { AVATAR, ErrorNote, LoadingCard, Rich } from "./ui";
import { AssetIcon } from "./asset-icon";
import { DataTable, Money, type Col } from "./table";

type Agents = Awaited<ReturnType<typeof getAgents>>;
const KIND: Record<string, string> = { compra: "Compra", venta: "Venta", protege: "Sube stop", stop: "Stop", objetivo: "Objetivo" };

type Move = Agents["moves"][number];

/** Resumen compacto: la acción y el activo destacan, sin repetir la explicación larga. */
function MoveSummary({ move }: { move: Move }) {
  const asset = (
    <>
      <strong className="font-semibold text-slate-900">{move.asset}</strong>{" "}
      <AssetIcon symbol={move.symbol} name={move.asset} size="xs" className="inline-block align-[-4px]" />
    </>
  );
  if (move.kind === "compra") return <>Compra {asset}</>;
  if (move.kind === "venta") return <>Venta de {asset}</>;
  if (move.kind === "protege")
    return <>Subida de <strong className="font-semibold text-slate-900">stop</strong>{move.stop !== null ? <> a {eur(move.stop, move.stop < 1 ? 6 : 2)}</> : null} en {asset}</>;
  if (move.kind === "stop") return <>Salida por <strong className="font-semibold text-slate-900">stop</strong> en {asset}</>;
  if (move.kind === "objetivo") return <>Objetivo alcanzado en {asset}</>;
  return <>Cierre por tiempo en {asset}</>;
}

export function ActivityPanel({ header }: { header?: ReactNode } = {}) {
  const [data, setData] = useState<Agents | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const moves: Move[] = data.moves;
  const columns: Col<Move>[] = [
    { key: "at", label: "Cuándo", width: 12, sort: (m) => new Date(m.at).getTime(), cell: (m) => <span className="text-slate-500">{ago(m.at)}</span> },
    {
      key: "who",
      label: "Operador",
      width: 18,
      align: "left",
      sort: (m) => m.name,
      cell: (m) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${AVATAR[m.color] ?? AVATAR.slate} text-white`}>
            <Bot className="h-3.5 w-3.5" />
          </span>
          <b className="truncate font-semibold text-slate-900">{m.name}</b>
        </span>
      ),
    },
    { key: "kind", label: "Tipo", width: 11, sort: (m) => KIND[m.kind] ?? "Cierre", cell: (m) => <span className="text-slate-600">{KIND[m.kind] ?? "Cierre"}</span> },
    { key: "what", label: "Movimiento", width: 41, align: "left", cell: (m) => <span className="block truncate text-slate-600"><MoveSummary move={m} /></span> },
    {
      key: "pnl",
      label: "Resultado",
      width: 14,
      sort: (m) => m.pnl,
      cell: (m) =>
        m.pnl === null ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className={`font-semibold ${m.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            <Money v={m.pnl} digits={2} sign />
            <span className="block text-[11px] font-normal text-slate-400">{m.pnlType === "latente" ? "latente" : "realizado"}</span>
          </span>
        ),
    },
    { key: "open", label: "", width: 4, cell: () => <ChevronDown className="mx-auto h-4 w-4 text-slate-400" /> },
  ];

  return (
    <DataTable
      id="actividad"
      header={header}
      columns={columns}
      rows={moves}
      rowKey={(m) => `${m.kind}-${m.id}`}
      paginate
      label="movimientos"
      empty={`Los agentes aún no han operado. ${MEETINGS_TEXT}`}
      expand={(m) => (
        <div className="text-sm leading-relaxed text-slate-600">
          {m.text ? <Rich text={m.text} /> : m.pnl !== null ? "Resultado de la posición cerrada." : "Movimiento registrado en la cartera del agente."}
        </div>
      )}
    />
  );
}
