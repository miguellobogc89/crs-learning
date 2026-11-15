"use client";
// Mi cartera → copias de agentes: cuánto le das a cada uno, cómo va y qué tiene.
import { useState } from "react";
import { ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import type { getPortfolio } from "@/lib/trading/agents/copy";
import { api, errorText, eur, eur0, field, ghost, int, primary, tone } from "./format";
import { AgentAvatar, Modal } from "./ui";
import { refreshTrading } from "./navigation";
import { DotsMenu } from "./agents-panel";
import { AssetIcon } from "./asset-icon";
import { PortfolioAgents } from "./portfolio-layout";

type Portfolio = Awaited<ReturnType<typeof getPortfolio>>;

export function CopiesPanel({ data }: { data: Portfolio }) {
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
  const t = data.total;
  return (
    <PortfolioAgents>
      <ul className="space-y-1">
        {data.copies.map((c) => (
          <li key={c.agent} className="rounded-xl px-2 py-1.5 hover:bg-slate-50">
            <div className="flex items-center gap-2.5">
              <Link href={`/trading/agentes/${c.agent}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:text-blue-700">
                <AgentAvatar color={c.color} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="block text-xs text-slate-500">{c.weightPct} % · {eur(c.summary.equity, 2)}</span>
                </span>
              </Link>
              <span className={`shrink-0 text-xs font-semibold tabular-nums ${tone(c.summary.returnPct)}`}>
                {c.summary.returnPct >= 0 ? "+" : ""}{c.summary.returnPct.toFixed(1).replace(".", ",")} %
              </span>
              {busy === c.agent ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
              ) : (
                <DotsMenu
                  label={`Acciones de la copia de ${c.name}`}
                  items={[
                    { label: "Cambiar el %", icon: Pencil, onClick: () => setEditing(c) },
                    { label: "Dejar de copiar", icon: Trash2, danger: true, onClick: () => void stop(c.agent, c.name) },
                  ]}
                />
              )}
            </div>
            {c.positions.length ? (
              <details className="group ml-10 text-xs text-slate-500">
                <summary className="flex cursor-pointer list-none items-center gap-1">
                  <ChevronRight className="h-3 w-3 group-open:rotate-90" /> {c.positions.length} posiciones y órdenes
                </summary>
                <ul className="space-y-1 py-1">
                  {c.positions.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-1.5">
                      <AssetIcon symbol={p.symbol} name={p.name} size="xs" />
                      {p.name} · {int(p.quantity)} a {eur(p.entryPrice ?? p.plannedEntry)}
                      {p.status === "pendiente" ? <span className="text-amber-700">Pendiente</span> : p.unrealized !== null ? <span className={tone(p.unrealized)}>{eur0(p.unrealized)}</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : <p className="ml-10 text-xs text-slate-500">En efectivo</p>}
          </li>
        ))}
        <li>
          <Link href="/trading/agentes" className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700">
            <Plus className="h-4 w-4" /> {data.copies.length ? "Cambiar copias" : "Copiar a un agente"}
          </Link>
        </li>
      </ul>
      {error && <p className="border-t border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">{error}</p>}
      {editing && (
        <WeightModal
          copy={editing}
          others={data.copies.filter((x) => x.agent !== editing.agent).reduce((s, x) => s + x.weightPct, 0)}
          total={t.equity}
          onClose={() => setEditing(null)}
        />
      )}
    </PortfolioAgents>
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
