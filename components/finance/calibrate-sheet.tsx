"use client";
// «Calibrar tu mes» (laboratorio, 23/11/2026): cuánto puedes gastar en cada grupo para ahorrar lo que quieres.
// Pantalla completa desde la derecha. Arriba lo cobrado este mes y el ahorro (deslizador); la barra ideal con el
// ahorro dentro; debajo, los grupos flexibles con lo que te tocaría (editable: al escribir un importe queda con
// candado y el resto se recalcula), incluido «Otros gastos» (lo que no está en ningún grupo), y los fijos. «Aplicar como objetivos» guarda los importes
// como objetivos de los grupos y el ahorro como tu objetivo de ahorro. El reparto lo hace calibrate() (plan.ts).
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Lock, LockOpen } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { categoryHex } from "@/lib/finance/categories";
import { calibrate, isGradual, type GroupCycleTotals } from "@/lib/finance/plan";
import { eur } from "@/components/trading/format";
import { CategoryIcon } from "./category-icon";

export type CalibrateGroup = { id: string; name: string; categories: string[]; goal: number | null };

const round = (v: number) => Math.round(v * 100) / 100;
const OTHERS = "__otros";

export function CalibrateSheet({ open, onClose, income, saving, groups, history, prevDaily, others, onApply }: {
  open: boolean;
  onClose: () => void;
  /** Lo cobrado este mes. */
  income: number;
  saving: number | null;
  groups: CalibrateGroup[];
  history: GroupCycleTotals[];
  prevDaily: Record<string, number[]>;
  /** Media de lo que no está en ningún grupo («Otros gastos»): se calibra como un grupo flexible más. */
  others: number;
  onApply: (saving: number, goals: { id: string; goal: number }[], othersGoal: number | null) => void;
}) {
  const [save, setSave] = useState(saving ?? 0);
  const [locks, setLocks] = useState<Record<string, number>>({});
  useEffect(() => { if (open) { setSave(saving ?? 0); setLocks({}); } }, [open, saving]);

  const closed = history.slice(1, 4);
  const avgOf = (keys: string[]) => (closed.length ? Math.round(closed.reduce((t, c) => t + keys.reduce((u, k) => u + (c.full[k] ?? 0), 0), 0) / closed.length) : 0);
  const items = useMemo(() => [
    ...groups.filter((g) => g.categories.length).map((g) => {
      const avg = avgOf(g.categories);
      const fixed = !isGradual(g.categories, history, prevDaily);
      return { g, avg, fixed, base: fixed ? g.goal ?? avg : avg || g.goal || 0, color: categoryHex(g.categories[0]) };
    }),
    // «Otros gastos» (lo que no está en ningún grupo): flexible, con su media como base.
    ...(others > 0 ? [{ g: { id: OTHERS, name: "Otros gastos", categories: ["otros_gastos"], goal: null }, avg: others, fixed: false, base: others, color: "#94a3b8" }] : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [groups, history, prevDaily, others]);
  const r = calibrate({
    income,
    saving: save,
    items: items.map((i) => ({ id: i.g.id, base: i.base, fixed: i.fixed, locked: locks[i.g.id] ?? null })),
  });
  const flexible = items.filter((i) => !i.fixed);
  const fixed = items.filter((i) => i.fixed);
  const segs = [
    ...fixed.map((i) => ({ key: i.g.id, amount: r.amounts[i.g.id] ?? 0, color: i.color, soft: true })),
    ...flexible.map((i) => ({ key: i.g.id, amount: r.amounts[i.g.id] ?? 0, color: i.color, soft: false })),
    ...(save > 0 ? [{ key: "ahorro", amount: save, color: "#10b981", soft: false }] : []),
  ];
  const total = Math.max(income, segs.reduce((t, x) => t + x.amount, 0), 1);
  const pct = (v: number) => `${(Math.max(0, v) / total) * 100}%`;
  const max = Math.max(0, Math.floor(income / 10) * 10);

  const setAmount = (id: string, raw: string) => {
    const t = raw.trim().replace(/\s|€/g, "");
    if (!t) { setLocks((l) => { const n = { ...l }; delete n[id]; return n; }); return; }
    const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
    if (Number.isFinite(v) && v >= 0) setLocks((l) => ({ ...l, [id]: round(v) }));
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="gap-0 bg-white p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <div className="flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 shrink-0 items-center gap-1 px-2">
            <button type="button" onClick={onClose} aria-label="Volver" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <SheetTitle className="text-base font-semibold text-slate-900">Calibrar tu mes</SheetTitle>
            <SheetDescription className="sr-only">Cuánto puedes gastar en cada grupo para ahorrar lo que quieres.</SheetDescription>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
            <p className="text-sm text-slate-500">Este mes has cobrado</p>
            <p className="amount text-[28px] font-semibold leading-tight tracking-tight text-slate-900">{eur(income, 0)}</p>

            {/* Ahorro: deslizador y casilla */}
            <div className="mt-5 rounded-2xl bg-emerald-50/80 px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-semibold text-slate-900">Quiero ahorrar</span>
                <span className="amount text-2xl font-semibold tabular-nums text-emerald-700">{eur(save, 0)}</span>
              </div>
              <input type="range" min={0} max={max} step={10} value={Math.min(save, max)} onChange={(e) => setSave(Number(e.target.value))}
                aria-label="Ahorro al mes" className="mt-3 w-full accent-emerald-600" />
              <div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>0 €</span><span className="amount">{eur(max, 0)}</span></div>
            </div>

            {/* La barra ideal, con el ahorro dentro */}
            <div className="mt-5 flex h-10 w-full overflow-hidden rounded-xl bg-slate-100" role="img" aria-label="Reparto ideal de lo que cobras">
              {segs.filter((x) => x.amount > 0).map((x) => (
                <span key={x.key} className="h-full border-r-2 border-white transition-[width] duration-300 ease-out last:border-r-0 motion-reduce:transition-none"
                  style={{ width: pct(x.amount), backgroundColor: x.color, opacity: x.soft ? 0.45 : 1 }} />
              ))}
            </div>
            <p className={`mt-3 text-sm font-medium ${r.shortfall > 0 ? "text-rose-700" : "text-slate-700"}`}>
              {r.shortfall > 0
                ? `Con tus gastos fijos no llega: como mucho podrías ahorrar ${eur(r.maxSaving, 0)} este mes.`
                : `Para ahorrar ${eur(save, 0)}, puedes gastar ${eur(Math.max(0, r.available), 0)} en lo flexible.`}
            </p>

            {/* Flexibles: lo que te toca (editable con candado) */}
            <h3 className="mt-6 text-sm font-semibold text-slate-900">Puedes gastar</h3>
            <ul className="mt-1 divide-y divide-slate-100">
              {flexible.map((i) => {
                const locked = i.g.id in locks;
                const amount = r.amounts[i.g.id] ?? 0;
                return (
                  <li key={i.g.id} className="flex items-center gap-3 py-3">
                    <CategoryIcon category={i.g.categories[0]} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-900">{i.g.name}</span>
                      <span className="amount block truncate text-xs text-slate-500">{i.g.id === OTHERS ? `Sin grupo; sueles gastar ~${eur(i.avg, 0)}` : i.avg > 0 ? `Sueles gastar ~${eur(i.avg, 0)}` : "Sin gasto los últimos meses"}</span>
                    </span>
                    <button type="button" onClick={() => setLocks((l) => { const n = { ...l }; if (locked) delete n[i.g.id]; else n[i.g.id] = amount; return n; })}
                      aria-label={locked ? `Soltar ${i.g.name}` : `Fijar ${i.g.name}`} aria-pressed={locked}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${locked ? "bg-slate-900 text-white" : "text-slate-300 active:bg-slate-100"}`}>
                      {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                    </button>
                    <span className="flex w-24 shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                      <input aria-label={`Importe para ${i.g.name}`} inputMode="decimal" key={`${i.g.id}-${locked ? "l" : amount}`} defaultValue={String(amount).replace(".", ",")}
                        onBlur={(e) => setAmount(i.g.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="min-w-0 flex-1 bg-transparent py-2 text-right text-[16px] tabular-nums text-slate-900 outline-none" />
                      <span className="text-sm text-slate-400">€</span>
                    </span>
                  </li>
                );
              })}
              {flexible.length === 0 && <li className="py-3 text-sm text-slate-500">No tienes grupos de gasto flexible.</li>}
            </ul>

            {/* Fijos: no se recortan */}
            {fixed.length > 0 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-slate-900">Fijos (no se recortan)</h3>
                <ul className="mt-1 divide-y divide-slate-100">
                  {fixed.map((i) => (
                    <li key={i.g.id} className="flex items-center gap-3 py-3">
                      <CategoryIcon category={i.g.categories[0]} />
                      <span className="min-w-0 flex-1 truncate text-[15px] text-slate-700">{i.g.name}</span>
                      <span className="amount shrink-0 text-sm tabular-nums text-slate-700">{eur(r.amounts[i.g.id] ?? 0, 0)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button type="button" disabled={r.shortfall > 0}
              onClick={() => onApply(save,
                flexible.filter((i) => i.g.id !== OTHERS).map((i) => ({ id: i.g.id, goal: r.amounts[i.g.id] ?? 0 })).filter((x) => x.goal > 0),
                flexible.some((i) => i.g.id === OTHERS) ? r.amounts[OTHERS] ?? null : null)}
              className="h-12 w-full rounded-full bg-blue-600 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-40">
              Aplicar como objetivos
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
