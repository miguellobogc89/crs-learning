"use client";
// «Calibrar tu mes» (laboratorio, 23/11/2026). Modelo «el ahorro es la consecuencia»: lo que cobras − lo inamovible
// (grupos con candado, con su media) − lo que te permites en cada grupo ajustable (Ocio y caprichos…) − tu colchón
// de imprevistos («Otros gastos»: el veterinario, unos zapatos, una multa) = lo que ahorras. El candado de cada
// grupo se guarda al momento (inamovible / ajustable); «Guardar este reparto» guarda lo que te permites y el colchón
// como objetivos. Cálculo en monthPlan() (plan.ts).
import { useEffect, useState } from "react";
import { ArrowLeft, Lock, LockOpen } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { categoryHex } from "@/lib/finance/categories";
import { monthPlan, type GroupCycleTotals } from "@/lib/finance/plan";
import { eur } from "@/components/trading/format";
import { CategoryIcon } from "./category-icon";

export type CalibrateGroup = { id: string; name: string; categories: string[]; goal: number | null; fixed: boolean };

const parse = (raw: string) => {
  const t = raw.trim().replace(/\s|€/g, "");
  if (!t) return 0;
  const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
};
const sliderMax = (...vals: number[]) => Math.max(100, Math.ceil((Math.max(...vals) * 2) / 50) * 50);

/** Importe con deslizador y casilla, para lo ajustable y el colchón. */
function Amount({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value).replace(".", ",")), [value]);
  return (
    <div className="mt-2 flex items-center gap-3">
      <input type="range" min={0} max={max} step={5} value={Math.min(value, max)} onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label} className="min-w-0 flex-1 accent-blue-600" />
      <span className="flex w-24 shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <input aria-label={label} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)}
          onBlur={() => { const v = parse(text); if (v === null) setText(String(value)); else onChange(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="min-w-0 flex-1 bg-transparent py-2 text-right text-[16px] tabular-nums text-slate-900 outline-none" />
        <span className="text-sm text-slate-400">€</span>
      </span>
    </div>
  );
}

/** Candado discreto: silueta gris oscuro, sin fondo; abierto, en gris claro. */
function Padlock({ on, name, onToggle }: { on: boolean; name: string; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} aria-label={on ? `${name}: inamovible (tocar para ajustarlo)` : `${name}: ajustable (tocar para fijarlo)`}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl active:bg-slate-100 ${on ? "text-slate-700" : "text-slate-300"}`}>
      {on ? <Lock className="h-[18px] w-[18px]" strokeWidth={2} /> : <LockOpen className="h-[18px] w-[18px]" strokeWidth={2} />}
    </button>
  );
}

export function CalibrateSheet({ open, onClose, income, groups, history, unforeseenGoal, unforeseenLast, savingsGoal, onToggleFixed, onApply }: {
  open: boolean;
  onClose: () => void;
  /** Lo cobrado este mes. */
  income: number;
  groups: CalibrateGroup[];
  history: GroupCycleTotals[];
  /** Tu colchón de imprevistos («Otros gastos»), si ya lo pusiste. */
  unforeseenGoal: number | null;
  /** Lo que se fue el mes pasado en lo que no tiene grupo (solo como dato). */
  unforeseenLast: number | null;
  /** Tu meta de ahorro (solo como referencia). */
  savingsGoal: number | null;
  onToggleFixed: (id: string, fixed: boolean) => void;
  onApply: (goals: { id: string; goal: number }[], unforeseen: number) => void;
}) {
  const closed = history.slice(1, 4);
  const avgOf = (keys: string[]) => (closed.length ? Math.round(closed.reduce((t, c) => t + keys.reduce((u, k) => u + (c.full[k] ?? 0), 0), 0) / closed.length) : 0);
  const list = groups.filter((g) => g.categories.length).map((g) => ({ g, avg: avgOf(g.categories), color: categoryHex(g.categories[0]) }));
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [unforeseen, setUnforeseen] = useState(0);
  useEffect(() => {
    if (!open) return;
    setAmounts(Object.fromEntries(list.map(({ g, avg }) => [g.id, g.goal ?? avg])));
    setUnforeseen(unforeseenGoal ?? 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fixed = list.filter((i) => i.g.fixed);
  const adjustable = list.filter((i) => !i.g.fixed);
  const amountOf = (id: string, avg: number) => amounts[id] ?? avg;
  const fixedAmount = (i: (typeof list)[number]) => i.avg || i.g.goal || 0;
  const r = monthPlan({
    income,
    fixed: fixed.map(fixedAmount),
    adjustable: adjustable.map((i) => amountOf(i.g.id, i.avg)),
    unforeseen,
  });
  const segs = [
    ...fixed.map((i) => ({ key: i.g.id, amount: fixedAmount(i), color: i.color, soft: true })),
    ...adjustable.map((i) => ({ key: i.g.id, amount: amountOf(i.g.id, i.avg), color: i.color, soft: false })),
    { key: "imprevistos", amount: unforeseen, color: "#94a3b8", soft: false },
    { key: "ahorro", amount: Math.max(0, r.saving), color: "#10b981", soft: false },
  ];
  const total = Math.max(income, r.fixed + r.adjustable + r.unforeseen, 1);
  const pct = (v: number) => `${(Math.max(0, v) / total) * 100}%`;
  const tone = r.saving < 0 ? "text-rose-700" : savingsGoal && r.saving < savingsGoal ? "text-amber-700" : "text-emerald-700";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="gap-0 bg-white p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <div className="flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 shrink-0 items-center gap-1 px-2">
            <button type="button" onClick={onClose} aria-label="Volver" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <SheetTitle className="text-base font-semibold text-slate-900">Calibrar tu mes</SheetTitle>
            <SheetDescription className="sr-only">Decide lo que te permites y mira cuánto ahorras.</SheetDescription>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
            {/* El resultado: lo que ahorras */}
            <p className="text-sm text-slate-500">Con este reparto ahorras</p>
            <p className={`amount text-[34px] font-semibold leading-tight tracking-tight ${tone}`}>{r.saving < 0 ? `−${eur(-r.saving, 0)}` : eur(r.saving, 0)}</p>
            <p className="amount text-xs text-slate-500">
              De {eur(income, 0)} cobrados este mes{savingsGoal ? (r.saving >= savingsGoal ? `; superas tu meta de ${eur(savingsGoal, 0)}` : `; tu meta es ${eur(savingsGoal, 0)}`) : ""}.
            </p>

            <div className="mt-4 flex h-10 w-full overflow-hidden rounded-xl bg-slate-100" role="img" aria-label="Reparto de lo que cobras">
              {segs.filter((x) => x.amount > 0).map((x) => (
                <span key={x.key} className="h-full border-r-2 border-white transition-[width] duration-200 ease-out last:border-r-0 motion-reduce:transition-none"
                  style={{ width: pct(x.amount), backgroundColor: x.color, opacity: x.soft ? 0.45 : 1 }} />
              ))}
            </div>
            {r.saving < 0 && <p className="mt-2 text-sm font-medium text-rose-700">No llega: te faltan {eur(-r.saving, 0)}. Baja lo que te permites o el colchón.</p>}

            {/* Ajustable: lo que te permites */}
            <h3 className="mt-6 text-sm font-semibold text-slate-900">Lo que te permites</h3>
            <ul className="mt-1 divide-y divide-slate-100">
              {adjustable.map((i) => {
                const v = amountOf(i.g.id, i.avg);
                return (
                  <li key={i.g.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <CategoryIcon category={i.g.categories[0]} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-slate-900">{i.g.name}</span>
                        <span className="amount block truncate text-xs text-slate-500">{i.avg > 0 ? `Sueles gastar ~${eur(i.avg, 0)}` : "Sin gasto los últimos meses"}</span>
                      </span>
                      <Padlock on={false} name={i.g.name} onToggle={() => onToggleFixed(i.g.id, true)} />
                    </div>
                    <Amount label={`Lo que te permites en ${i.g.name}`} value={v} max={sliderMax(i.avg, v)} onChange={(x) => setAmounts((a) => ({ ...a, [i.g.id]: x }))} />
                  </li>
                );
              })}
              {adjustable.length === 0 && <li className="py-3 text-sm text-slate-500">Todo está fijado. Abre un candado para ajustar ese grupo.</li>}

              {/* Colchón de imprevistos */}
              <li className="py-3">
                <div className="flex items-center gap-3">
                  <CategoryIcon category="otros_gastos" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-900">Imprevistos</span>
                    <span className="amount block text-xs text-slate-500">
                      Otros gastos: el veterinario, unos zapatos, una multa…{unforeseenLast ? ` El mes pasado: ${eur(unforeseenLast, 0)}.` : ""}
                    </span>
                  </span>
                </div>
                <Amount label="Colchón de imprevistos" value={unforeseen} max={sliderMax(unforeseenLast ?? 0, unforeseen, 250)} onChange={setUnforeseen} />
              </li>
            </ul>

            {/* Inamovible: con su media */}
            {fixed.length > 0 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-slate-900">Inamovible</h3>
                <p className="text-xs text-slate-500">Lo que pagas sí o sí; cuenta con lo que sueles gastar.</p>
                <ul className="mt-1 divide-y divide-slate-100">
                  {fixed.map((i) => (
                    <li key={i.g.id} className="flex items-center gap-3 py-3">
                      <CategoryIcon category={i.g.categories[0]} />
                      <span className="min-w-0 flex-1 truncate text-[15px] text-slate-800">{i.g.name}</span>
                      <span className="amount shrink-0 text-sm tabular-nums text-slate-700">~{eur(fixedAmount(i), 0)}</span>
                      <Padlock on name={i.g.name} onToggle={() => onToggleFixed(i.g.id, false)} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button type="button"
              onClick={() => onApply(adjustable.map((i) => ({ id: i.g.id, goal: amountOf(i.g.id, i.avg) })), unforeseen)}
              className="h-12 w-full rounded-full bg-blue-600 text-sm font-semibold text-white active:bg-blue-700">
              Guardar este reparto
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
