"use client";
// Actividad: lo último que han hecho los agentes (compras, ventas, stops, objetivos), en una tabla
// con el estilo de Oportunidades. Al desplegar una fila se ve el porqué.
import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { Bot, ChevronDown } from "lucide-react";
import type { getAgents } from "@/lib/trading/agents/service";
import { api, eur, errorText, MEETINGS_TEXT } from "./format";
import { ago } from "./home-panel";
import { useTradingRefresh } from "./navigation";
import { AVATAR, ErrorNote, LoadingCard, Rich } from "./ui";
import { AssetIcon } from "./asset-icon";
import { Money, pageOf, Pager, TablePanel, TD, TH } from "./table";

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
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(15);

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
  const moves = data.moves;
  const rows = pageOf<Move>(moves, page, perPage);

  return (
    <TablePanel header={header} footer={<Pager total={moves.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} label="movimientos" />}>
      {moves.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-slate-500">Los agentes aún no han operado. {MEETINGS_TEXT}</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <colgroup>
            {[12, 20, 12, 38, 14, 4].map((w, n) => (
              <col key={n} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>Cuándo</th>
              <th className={TH}>Operador</th>
              <th className={TH}>Tipo</th>
              <th className={TH}>Movimiento</th>
              <th className={`${TH} text-right`}>Resultado</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const key = `${m.kind}-${m.id}`;
              const expanded = open === key;
              return (
                <Fragment key={key}>
                  <tr className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/60" onClick={() => setOpen(expanded ? null : key)}>
                    <td className={`${TD} text-slate-500`}>{ago(m.at)}</td>
                    <td className={TD}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${AVATAR[m.color] ?? AVATAR.slate} text-white`}>
                          <Bot className="h-3.5 w-3.5" />
                        </span>
                        <b className="truncate font-semibold text-slate-900">{m.name}</b>
                      </span>
                    </td>
                    <td className={`${TD} text-slate-600`}>{KIND[m.kind] ?? "Cierre"}</td>
                    <td className={`${TD} truncate text-slate-600`}>
                      <MoveSummary move={m} />
                    </td>
                    <td className={`${TD} text-right`}>
                      {m.pnl === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className={`font-semibold ${m.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          <Money v={m.pnl} digits={2} sign />
                          <span className="block text-[11px] font-normal text-slate-400">{m.pnlType === "latente" ? "latente" : "realizado"}</span>
                        </span>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>
                      <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <td colSpan={6} className="px-6 py-3 text-sm leading-relaxed text-slate-600">
                        {m.text ? <Rich text={m.text} /> : m.pnl !== null ? "Resultado de la posición cerrada." : "Movimiento registrado en la cartera del agente."}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </TablePanel>
  );
}
