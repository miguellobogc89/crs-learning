"use client";
// Mi cartera → copias de agentes: cuánto le das a cada uno, cómo va y qué tiene.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import { api, eur, eur0, int, panel, pct, th, tone } from "./format";
import { AGENT_DOT } from "./home-panel";
import { useTradingRefresh } from "./navigation";

type Portfolio = Awaited<ReturnType<typeof getPortfolio>>;

export function CopiesPanel() {
  const [data, setData] = useState<Portfolio | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Portfolio>("portfolio"));
    } catch {
      // El resto de la cartera ya muestra los errores.
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useTradingRefresh(load);
  if (!data?.opened) return null;

  const t = data.total;
  return (
    <section className={panel}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Copy className="h-4 w-4 text-blue-600" /> Tu patrimonio total: {eur0(t.equity)} <span className={`font-medium ${tone(t.returnPct)}`}>{pct(t.returnPct)}</span>
        </h2>
        <Link href="/trading/agentes" className="text-xs font-medium text-blue-700 hover:underline">
          {data.copies.length ? "Cambiar copias" : "Copiar a un agente"}
        </Link>
      </header>
      {data.copies.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">
          Todo lo manejas tú. Puedes darle una parte a un agente y la app hará lo mismo que él, en proporción.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Parte</th>
                <th className={`${th} text-right`}>Peso</th>
                <th className={`${th} text-right`}>Patrimonio</th>
                <th className={`${th} text-right`}>Rentabilidad</th>
                <th className={th}>Qué tiene</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 ${AGENT_DOT.slate}`} /> <b className="font-semibold text-slate-900">Lo que manejas tú</b>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                  {pct(t.equity > 0 ? (data.main.summary.equity / t.equity) * 100 : 0, 0, false)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{eur0(data.main.summary.equity)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${tone(data.main.summary.returnPct)}`}>{pct(data.main.summary.returnPct)}</td>
                <td className="px-3 py-2.5 text-xs text-slate-600">Abajo, en el detalle</td>
              </tr>
              {data.copies.map((c) => (
                <tr key={c.agent} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2.5">
                    <Link href={`/trading/agentes?agent=${c.agent}`} className="flex items-center gap-2 hover:underline">
                      <span className={`h-2.5 w-2.5 ${AGENT_DOT[c.color]}`} /> <b className="font-semibold text-slate-900">Copia de {c.name}</b>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{c.weightPct} %</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{eur0(c.summary.equity)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${tone(c.summary.returnPct)}`}>{pct(c.summary.returnPct)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {c.positions.length === 0
                      ? "En efectivo"
                      : c.positions.map((p) => (
                          <div key={p.id}>
                            {p.name}: {int(p.quantity)} a {eur(p.entryPrice ?? p.plannedEntry)}
                            {p.status === "pendiente" ? <span className="text-amber-700"> (próxima apertura)</span> : p.unrealized !== null ? <span className={tone(p.unrealized)}> ({eur0(p.unrealized)})</span> : null}
                          </div>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
