"use client";
// Laboratorio · «Tu mes»: la estructura del mes para Mi plan. Lo que cobras, repartido en una barra: cada grupo con
// su objetivo (o su media, marcada «~», si no tiene), lo que no está en ningún grupo (su media), tu ahorro y lo que
// queda libre. Debajo, los grupos con su objetivo editable para ver la barra llenarse. Usa y guarda datos reales
// (objetivos de grupo, ahorro y lo que cobras), igual que Mi plan y Preferencias.
import { useEffect, useMemo, useState } from "react";
import { categoryHex } from "@/lib/finance/categories";
import type { GroupCycleTotals } from "@/lib/finance/plan";
import { card, eur, flat } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { errorText, fapi, refreshFinance, useFinance } from "./api";
import { CategoryIcon } from "./category-icon";

type Plan = {
  groups: { id: string; name: string; categories: string[]; goal: number | null }[];
  history?: GroupCycleTotals[];
  budget?: { income: number | null; savingsGoal: number | null; limit: number | null };
};
type Seg = { key: string; label: string; amount: number; color: string; estimate: boolean; kind: "grupo" | "otros" | "ahorro" | "libre" };

/** Importe escrito a mano («1.200,50», «60», «60 €») → número, o null si está vacío. NaN si no es válido. */
const parseAmount = (raw: string) => {
  const t = raw.trim().replace(/\s|€/g, "");
  if (!t) return null;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};
const fmtInput = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

function AmountInput({ value, onCommit, placeholder, label }: { value: number | null; onCommit: (v: number | null) => void; placeholder: string; label: string }) {
  const [text, setText] = useState(fmtInput(value));
  useEffect(() => setText(fmtInput(value)), [value]);
  const commit = () => {
    const v = parseAmount(text);
    if (v !== null && (!Number.isFinite(v) || v < 0)) { setText(fmtInput(value)); return; }
    const rounded = v === null || v === 0 ? null : Math.round(v * 100) / 100;
    if (rounded !== value) onCommit(rounded);
  };
  return (
    <span className="flex w-28 shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
      <input aria-label={label} inputMode="decimal" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="min-w-0 flex-1 bg-transparent py-2 text-right text-[15px] tabular-nums text-slate-900 outline-none placeholder:text-slate-300" />
      <span className="text-sm text-slate-400">€</span>
    </span>
  );
}

export function LabStructure() {
  const { data, error } = useFinance<Plan>("plan");
  // Cambios que todavía no han vuelto del servidor: la barra se mueve al momento.
  const [goals, setGoals] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState<number | null | undefined>(undefined);
  const [income, setIncome] = useState<number | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(t); }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const closed = (data.history ?? []).slice(1, 4);
    const avgOf = (cats: string[] | null, exclude: Set<string> = new Set()) => {
      if (!closed.length) return 0;
      const per = closed.map((c) => Object.entries(c.full).reduce((t, [k, v]) => t + ((cats ? cats.includes(k) : !exclude.has(k)) ? v : 0), 0));
      return Math.round(per.reduce((t, x) => t + x, 0) / per.length);
    };
    const groups = data.groups.filter((g) => g.categories.length).map((g) => {
      const goal = g.id in goals ? goals[g.id] : g.goal;
      return { ...g, goal, avg: avgOf(g.categories) };
    });
    const inGroups = new Set(groups.flatMap((g) => g.categories));
    const others = avgOf(null, inGroups);
    const inc = income === undefined ? data.budget?.income ?? null : income;
    const sav = saving === undefined ? data.budget?.savingsGoal ?? null : saving;
    const segs: Seg[] = groups.map((g) => ({ key: g.id, label: g.name, amount: g.goal ?? g.avg, color: categoryHex(g.categories[0]), estimate: g.goal === null, kind: "grupo" as const }))
      .filter((s) => s.amount > 0);
    if (others > 0) segs.push({ key: "otros", label: "Sin grupo", amount: others, color: "#94a3b8", estimate: true, kind: "otros" });
    if (sav) segs.push({ key: "ahorro", label: "Ahorro", amount: sav, color: "#10b981", estimate: false, kind: "ahorro" });
    const used = segs.reduce((t, s) => t + s.amount, 0);
    const free = inc === null ? null : Math.round((inc - used) * 100) / 100;
    return { groups, others, inc, sav, segs, used, free };
  }, [data, goals, saving, income]);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!view) return <SkeletonList rows={6} />;
  const { groups, others, inc, sav, segs, used, free } = view;
  const total = Math.max(inc ?? 0, used, 1);
  const pct = (v: number) => `${(Math.max(0, v) / total) * 100}%`;

  const saveGoal = async (id: string, name: string, goal: number | null) => {
    setGoals((g) => ({ ...g, [id]: goal }));
    setErr(null);
    try { await fapi("plan/group", { id, name, goal }); refreshFinance(); } catch (e) { setErr(errorText(e)); }
  };
  const saveSettings = async (patch: { savingsGoal?: number | null; expectedIncome?: number | null }) => {
    if ("savingsGoal" in patch) setSaving(patch.savingsGoal ?? null);
    // Sin importe propio se vuelve a usar la nómina detectada (la da el servidor).
    if ("expectedIncome" in patch) setIncome(patch.expectedIncome ?? undefined);
    setErr(null);
    try { await fapi("settings", patch); refreshFinance(); } catch (e) { setErr(errorText(e)); }
  };

  const verdict = inc === null ? { text: "Dinos cuánto cobras al mes para ver si tu plan cuadra.", tone: "text-slate-500" }
    : free !== null && free >= 0 ? { text: `Te quedan ${eur(free, 0)} libres cada mes.`, tone: "text-emerald-700" }
    : { text: `Tu plan se pasa ${eur(-(free ?? 0), 0)} de lo que cobras: baja algún objetivo o ahorra menos.`, tone: "text-rose-700" };

  return (
    <div className="space-y-4">
      <section className={`${card} ${flat} min-w-0 overflow-hidden p-4 sm:p-5`}>
        <p className="text-sm text-slate-500">Tu mes</p>
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <p className="amount text-[30px] font-semibold leading-none tracking-tight text-slate-900">{inc === null ? "—" : eur(inc, 0)}</p>
          <span className="text-right text-xs text-slate-500">lo que cobras<br />al mes</span>
        </div>

        {/* La barra: lo que cobras, repartido. Si el plan se pasa, la barra llega al 100 % y lo que sobra se ve en rojo. */}
        <div className="mt-4 flex h-11 w-full overflow-hidden rounded-xl bg-slate-100" role="img" aria-label={`Reparto: ${segs.map((s) => `${s.label} ${eur(s.amount, 0)}`).join(", ")}. ${verdict.text}`}>
          {segs.map((s) => (
            <span key={s.key} className="h-full border-r-2 border-white transition-[width] duration-700 ease-out last:border-r-0 motion-reduce:transition-none"
              style={{ width: ready ? pct(s.amount) : "0%", backgroundColor: s.color, opacity: s.estimate ? 0.45 : 1 }} />
          ))}
          {free !== null && free > 0 && <span className="h-full flex-1" />}
        </div>
        {free !== null && free < 0 && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-rose-500" style={{ width: pct(-free), marginLeft: `calc(100% - ${pct(-free)})` }} />
          </div>
        )}
        <p className={`mt-3 text-[15px] font-medium ${verdict.tone}`}>{verdict.text}</p>

        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600">
          {segs.map((s) => (
            <li key={s.key} className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color, opacity: s.estimate ? 0.45 : 1 }} />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="amount shrink-0 tabular-nums text-slate-900">{s.estimate ? "~" : ""}{eur(s.amount, 0)}</span>
            </li>
          ))}
          {free !== null && free > 0 && (
            <li className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-200" />
              <span className="min-w-0 flex-1 truncate">Libre</span>
              <span className="amount shrink-0 tabular-nums text-slate-900">{eur(free, 0)}</span>
            </li>
          )}
        </ul>
        <p className="mt-3 text-[11px] text-slate-400">«~» y tono suave: sin objetivo, se usa tu media de los últimos meses.</p>
      </section>

      <section className={`${card} ${flat} min-w-0 overflow-hidden px-4 py-2 sm:px-5`}>
        {err && <p className="py-2 text-sm text-rose-700">{err}</p>}
        <ul className="divide-y divide-slate-100">
          <li className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-slate-900">Lo que cobras</span>
              <span className="block text-xs text-slate-500">Al mes. Si lo dejas vacío, se usa tu nómina detectada</span>
            </span>
            <AmountInput label="Lo que cobras al mes" value={inc} placeholder="0" onCommit={(v) => void saveSettings({ expectedIncome: v })} />
          </li>
          <li className="flex items-center gap-3 py-3">
            <span className="h-9 w-9 shrink-0 rounded-[11px] bg-emerald-500" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-slate-900">Ahorro</span>
              <span className="block text-xs text-slate-500">Lo que quieres apartar cada mes</span>
            </span>
            <AmountInput label="Ahorro al mes" value={sav} placeholder="0" onCommit={(v) => void saveSettings({ savingsGoal: v })} />
          </li>
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-3 py-3">
              <CategoryIcon category={g.categories[0]} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
                <span className="amount block truncate text-xs text-slate-500">{g.avg > 0 ? `Sueles gastar ~${eur(g.avg, 0)}` : "Sin gasto los últimos meses"}</span>
              </span>
              <AmountInput label={`Objetivo de ${g.name}`} value={g.goal} placeholder={g.avg > 0 ? String(g.avg) : "0"} onCommit={(v) => void saveGoal(g.id, g.name, v)} />
            </li>
          ))}
          {others > 0 && (
            <li className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-slate-500">Sin grupo</span>
                <span className="block text-xs text-slate-400">Lo que no está en ningún grupo (tu media)</span>
              </span>
              <span className="amount shrink-0 text-[15px] tabular-nums text-slate-500">~{eur(others, 0)}</span>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
