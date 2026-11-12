"use client";
// Mi cartera → copias de agentes: cuánto le das a cada uno, cómo va y qué tiene.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Copy, User } from "lucide-react";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import { api, errorText, eur, eur0, field, ghost, int, panel, pct, primary, th, tone } from "./format";
import { AgentAvatar, AVATAR, Modal, ReturnPill } from "./ui";
import { refreshTrading, useTradingRefresh } from "./navigation";
import { DotsMenu } from "./agents-panel";
import { AssetIcon } from "./asset-icon";

type Portfolio = Awaited<ReturnType<typeof getPortfolio>>;

export function CopiesPanel() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [editing, setEditing] = useState<Portfolio["copies"][number] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = async (agent: string, name: string) => {
    if (!window.confirm(`¿Dejar de copiar a ${name}? Se vende lo de esa copia al último precio y el dinero vuelve a tu parte.`)) return;
    setBusy(agent);
    try {
      await api("copy/stop", { agent });
      refreshTrading();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
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
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Copy className="h-5 w-5 text-blue-600" /> Tu patrimonio total: {eur0(t.equity)} <ReturnPill value={t.returnPct} />
        </h2>
        <Link href="/trading/agentes" className="text-xs font-medium text-blue-700 hover:underline">
          {data.copies.length ? "Cambiar copias" : "Copiar a un agente"}
        </Link>
      </header>
      {data.copies.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">
          Todo lo manejas tú. Puedes darle una parte a un agente y la app hará lo mismo que él, en proporción.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className={th}>Parte</th>
                <th className={`${th} text-right`}>Peso</th>
                <th className={`${th} text-right`}>Patrimonio</th>
                <th className={`${th} text-right`}>Rentabilidad</th>
                <th className={th}>Qué tiene</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${AVATAR.slate} text-white`}>
                      <User className="h-4 w-4" />
                    </span>
                    <b className="font-semibold text-slate-900">Lo que manejas tú</b>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                  {pct(t.equity > 0 ? (data.main.summary.equity / t.equity) * 100 : 0, 0, false)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{eur0(data.main.summary.equity)}</td>
                <td className="px-3 py-2.5 text-right">
                  <ReturnPill value={data.main.summary.returnPct} />
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-600">Abajo, en el detalle</td>
                <td />
              </tr>
              {data.copies.map((c) => (
                <tr key={c.agent} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2.5">
                    <Link href={`/trading/agentes/${c.agent}`} className="flex items-center gap-3 hover:underline">
                      <AgentAvatar color={c.color} /> <b className="font-semibold text-slate-900">Copia de {c.name}</b>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{c.weightPct} %</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{eur0(c.summary.equity)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <ReturnPill value={c.summary.returnPct} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {c.positions.length === 0
                      ? "En efectivo"
                      : c.positions.map((p) => (
                          <div key={p.id} className="flex items-center gap-1.5 py-0.5">
                            <AssetIcon symbol={p.symbol} name={p.name} size="xs" />
                            {p.name}: {int(p.quantity)} a {eur(p.entryPrice ?? p.plannedEntry)}
                            {p.status === "pendiente" ? <span className="text-amber-700"> (próxima apertura)</span> : p.unrealized !== null ? <span className={tone(p.unrealized)}> ({eur0(p.unrealized)})</span> : null}
                          </div>
                        ))}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {busy === c.agent ? (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-400" />
                    ) : (
                      <DotsMenu
                        label={`Acciones de la copia de ${c.name}`}
                        items={[
                          { label: "Cambiar el %", icon: Pencil, onClick: () => setEditing(c) },
                          { label: "Dejar de copiar", icon: Trash2, danger: true, onClick: () => void stop(c.agent, c.name) },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="border-t border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">{error}</p>}
      {editing && (
        <WeightModal
          copy={editing}
          others={data.copies.filter((x) => x.agent !== editing.agent).reduce((s, x) => s + x.weightPct, 0)}
          total={t.equity}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function WeightModal({ copy, others, total, onClose }: { copy: Portfolio["copies"][number]; others: number; total: number; onClose: () => void }) {
  const [w, setW] = useState(String(copy.weightPct));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = Number(w.replace(",", "."));
  const valid = v >= 1 && v <= 100 - others;
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api("copy/set", { agent: copy.agent, weightPct: v, mirror: false });
      refreshTrading();
      onClose();
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
      title={`Copia de ${copy.name}`}
      subtitle="Qué parte de tu patrimonio de prueba le das"
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={primary} disabled={!valid || saving} onClick={() => void save()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={Math.max(1, 100 - others)} value={Number.isFinite(v) ? v : 1} onChange={(e) => setW(e.target.value)} className="flex-1" aria-label="Peso" />
          <input className={`${field} w-20 text-right tabular-nums`} value={w} onChange={(e) => setW(e.target.value)} aria-label="Peso en %" />
          <span>%</span>
        </div>
        <p className="text-slate-600">
          Son unos <b>{eur0((total * (v || 0)) / 100)}</b>. Solo se mueve dinero en efectivo: si está invertido, se ajusta con lo libre.
        </p>
        {!valid && <p className="text-xs text-amber-700">Entre 1 % y {100 - others} %.</p>}
        {error && <p className="text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
