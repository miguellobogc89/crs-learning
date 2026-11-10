"use client";
import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Direction, PatternKey } from "@/lib/trading/types";
import { api, errorText, eur, eur0, field, ghost, num, primary } from "./format";

export type OrderDraft = {
  symbol: string;
  name: string;
  direction: Direction;
  reference: number;
  quantity: number;
  stop: number;
  target: number;
  pattern?: PatternKey | null;
  signalKey?: string | null;
  score?: number | null;
  maxHoldDays?: number | null;
  notes?: string | null;
};

export function OrderDialog({
  draft,
  cash,
  equity,
  commissionPct,
  commissionMin,
  onClose,
  onDone,
}: {
  draft: OrderDraft;
  cash: number;
  equity: number;
  commissionPct: number;
  commissionMin: number;
  onClose: () => void;
  onDone: (status: string) => void;
}) {
  const [quantity, setQuantity] = useState(String(draft.quantity || ""));
  const [stop, setStop] = useState(String(draft.stop.toFixed(3)));
  const [target, setTarget] = useState(String(draft.target.toFixed(3)));
  const [execution, setExecution] = useState<"next_open" | "now">("next_open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calc = useMemo(() => {
    const q = Math.floor(Number(quantity.replace(",", ".")));
    const s = Number(stop.replace(",", "."));
    const t = Number(target.replace(",", "."));
    const p = draft.reference;
    const notional = q > 0 ? q * p : 0;
    const fee = notional > 0 ? Math.max(commissionMin, (notional * commissionPct) / 100) : 0;
    const risk = q > 0 && s > 0 ? q * Math.abs(p - s) + 2 * fee : 0;
    const reward = q > 0 && t > 0 ? q * Math.abs(t - p) - 2 * fee : 0;
    return { q, s, t, notional, fee, risk, reward, rr: risk > 0 ? reward / risk : 0 };
  }, [quantity, stop, target, draft.reference, commissionMin, commissionPct]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ status: string }>("order", {
        symbol: draft.symbol,
        direction: draft.direction,
        quantity: calc.q,
        stop: calc.s,
        target: calc.t,
        execution,
        pattern: draft.pattern ?? null,
        signalKey: draft.signalKey ?? null,
        score: draft.score ?? null,
        maxHoldDays: draft.maxHoldDays ?? null,
        notes: draft.notes ?? null,
      });
      onDone(r.status);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const long = draft.direction === "long";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {long ? "Comprar" : "Vender en corto"} · {draft.name}
            </div>
            <div className="text-xs text-slate-500">
              {draft.symbol} · último cierre {eur(draft.reference)} · cartera virtual
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 px-5 py-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Acciones</span>
            <input className={`${field} w-full tabular-nums`} value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-red-700">Stop</span>
            <input className={`${field} w-full tabular-nums`} value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-emerald-700">Objetivo</span>
            <input className={`${field} w-full tabular-nums`} value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
          </label>
        </div>
        <dl className="mx-5 grid grid-cols-2 gap-x-6 gap-y-1.5 border border-slate-100 bg-slate-50 px-4 py-3 text-sm tabular-nums">
          <dt className="text-slate-500">Importe aproximado</dt>
          <dd className="text-right text-slate-900">{eur0(calc.notional)}</dd>
          <dt className="text-slate-500">Comisión estimada (por lado)</dt>
          <dd className="text-right text-slate-900">{eur(calc.fee, 2)}</dd>
          <dt className="text-slate-500">Pérdida si salta el stop</dt>
          <dd className="text-right text-red-700">
            −{eur0(calc.risk)} ({num(equity ? (calc.risk / equity) * 100 : 0, 1)} %)
          </dd>
          <dt className="text-slate-500">Ganancia en el objetivo</dt>
          <dd className="text-right text-emerald-700">+{eur0(calc.reward)}</dd>
          <dt className="text-slate-500">Beneficio / riesgo</dt>
          <dd className="text-right font-semibold text-slate-900">{num(calc.rr, 2)} a 1</dd>
          <dt className="text-slate-500">Efectivo tras la orden</dt>
          <dd className={`text-right ${cash - calc.notional - calc.fee < 0 ? "text-red-700" : "text-slate-900"}`}>
            {eur0(long ? cash - calc.notional - calc.fee : cash + calc.notional - calc.fee)}
          </dd>
        </dl>
        <fieldset className="space-y-2 px-5 py-4 text-sm">
          <legend className="mb-1 text-xs font-medium text-slate-600">Ejecución</legend>
          <label className="flex items-start gap-2">
            <input type="radio" checked={execution === "next_open"} onChange={() => setExecution("next_open")} className="mt-1" />
            <span>
              <b className="font-medium text-slate-900">A la apertura de la próxima sesión</b>
              <span className="block text-xs text-slate-500">Lo realista: así se haría con datos de cierre. Si abre más allá del stop u objetivo, la orden se cancela.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" checked={execution === "now"} onChange={() => setExecution("now")} className="mt-1" />
            <span>
              <b className="font-medium text-slate-900">Ahora, al último cierre</b>
              <span className="block text-xs text-slate-500">Útil para practicar; en real no se podría comprar a ese precio.</span>
            </span>
          </label>
        </fieldset>
        {error && <p className="mx-5 mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" className={ghost} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={primary} onClick={submit} disabled={saving || !(calc.q > 0)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {execution === "now" ? "Abrir posición" : "Programar orden"}
          </button>
        </div>
      </div>
    </div>
  );
}
