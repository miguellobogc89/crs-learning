"use client";
// Laboratorio · Mi plan mínimo (24/11/2026). Pones lo que cobras y un límite a cada grupo; la barra se va llenando
// (un tramo por grupo) y te dice cuánto te quedaría de ahorro. Lo que se repite pone un suelo: un grupo que es todo
// recibos no se edita (sale «según tus recibos»); uno mixto no deja bajar del comprometido. Lo que no está en ningún
// grupo entra con lo que sueles gastar ahí. Prueba: no guarda nada.
import { useEffect, useMemo, useState } from "react";
import type { planView } from "@/lib/finance/service";
import { categoryHex } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";
import { CategoryIcon } from "./category-icon";

type Plan = Awaited<ReturnType<typeof planView>>;

const num = (s: string) => { const n = Number(s.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };

export function LabPlanMvp() {
  const { data, error } = useFinance<Plan>("plan");
  const [income, setIncome] = useState("");
  const [goal, setGoal] = useState("");
  const [limits, setLimits] = useState<Record<string, string>>({});

  // Por grupo: lo comprometido (lo que se repite, al mes), lo que sueles gastar (media de los 3 meses cerrados) y si
  // es todo recibos (lo que sueles gastar apenas pasa de lo comprometido).
  const groups = useMemo(() => {
    if (!data) return [];
    const closed = data.history.slice(1, 4);
    const usualOf = (cats: string[]) => closed.length ? Math.round(closed.reduce((t, c) => t + cats.reduce((u, k) => u + (c.full[k] ?? 0), 0), 0) / closed.length) : 0;
    const repeats = (data.next?.items ?? []).filter((i) => i.source === "repite");
    return data.groups.filter((g) => g.categories.length).map((g) => {
      const committed = Math.round(repeats.filter((i) => g.categories.includes(i.category)).reduce((t, i) => t + i.amount, 0));
      const usual = usualOf(g.categories);
      const fixed = committed > 0 && usual - committed <= Math.max(15, usual * 0.1);
      return { ...g, committed, usual, fixed };
    });
  }, [data]);
  const loose = useMemo(() => {
    if (!data) return 0;
    const inGroups = new Set(data.groups.flatMap((g) => g.categories));
    const closed = data.history.slice(1, 4);
    if (!closed.length) return 0;
    return Math.round(closed.reduce((t, c) => t + Object.entries(c.full).filter(([k]) => !inGroups.has(k)).reduce((u, [, v]) => u + v, 0), 0) / closed.length);
  }, [data]);

  // Valores de partida: lo que cobras y tu objetivo de ahorro guardados; el límite de cada grupo, su objetivo o lo
  // que sueles gastar.
  useEffect(() => {
    if (!data) return;
    setIncome((v) => v || (data.budget.income !== null ? String(Math.round(data.budget.income)) : ""));
    setGoal((v) => v || (data.budget.savingsGoal !== null ? String(Math.round(data.budget.savingsGoal)) : ""));
    setLimits((l) => Object.keys(l).length ? l : Object.fromEntries(groups.map((g) => [g.id, String(g.goal ?? g.usual)])));
  }, [data, groups]);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={6} />;

  const inc = num(income);
  const want = num(goal);
  const rows = groups.map((g) => {
    const typed = num(limits[g.id] ?? "");
    const amount = g.fixed ? g.committed : Math.max(g.committed, typed);
    return { g, amount, below: !g.fixed && typed < g.committed };
  });
  const spend = rows.reduce((t, r) => t + r.amount, 0) + loose;
  const left = inc - spend;
  const scale = Math.max(inc, spend, 1);

  return (
    <div className="pb-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-slate-500">Cobras al mes</span>
          <input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)}
            className="amount mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-lg font-semibold tabular-nums text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Quieres ahorrar</span>
          <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)}
            className="amount mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-lg font-semibold tabular-nums text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </label>
      </div>

      {/* La barra: un tramo por grupo, lo que sueles gastar fuera de grupos y lo libre; si te pasas, en rojo. */}
      <div className="mt-5 flex h-4 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={left >= 0 ? `Te quedarían ${eur(left, 0)}` : `Te faltarían ${eur(-left, 0)}`}>
        {rows.map(({ g, amount }) => amount > 0 && (
          <span key={g.id} className="h-full transition-[width] duration-300" style={{ width: `${(amount / scale) * 100}%`, background: left < 0 ? "#f43f5e" : categoryHex(g.categories[0]) }} />
        ))}
        {loose > 0 && <span className="h-full bg-slate-300 transition-[width] duration-300" style={{ width: `${(loose / scale) * 100}%` }} />}
      </div>
      <p className={`amount mt-3 text-[22px] font-semibold leading-tight tracking-tight ${left < 0 ? "text-rose-700" : "text-slate-900"}`}>
        {inc <= 0 ? "Pon lo que cobras al mes" : left >= 0 ? `Te quedarían ${eur(left, 0)} de ahorro al mes` : `Te faltarían ${eur(-left, 0)} al mes`}
      </p>
      {inc > 0 && want > 0 && (
        <p className={`amount mt-1 text-sm font-medium ${left >= want ? "text-emerald-700" : "text-amber-700"}`}>
          {left >= want ? `Cumples tu objetivo de ${eur(want, 0)}` : `Te faltan ${eur(want - Math.max(0, left), 0)} para tu objetivo de ${eur(want, 0)}`}
        </p>
      )}

      <ul className="mt-5 divide-y divide-slate-100">
        {rows.map(({ g, below }) => (
          <li key={g.id} className="flex items-center gap-3 py-3">
            <CategoryIcon category={g.categories[0]} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-slate-900">{g.name}</span>
              <span className={`block truncate text-xs ${below ? "text-amber-700" : "text-slate-500"}`}>
                {g.fixed ? "Según tus recibos"
                  : below ? `No puede bajar de ${eur(g.committed, 0)}: es lo que se repite`
                  : g.committed > 0 ? `Comprometido ${eur(g.committed, 0)} · sueles ~${eur(g.usual, 0)}`
                  : g.usual > 0 ? `Sueles gastar ~${eur(g.usual, 0)}` : "Sin gasto los últimos meses"}
              </span>
            </span>
            {g.fixed ? (
              <b className="amount shrink-0 text-[15px] font-semibold tabular-nums text-slate-900">{eur(g.committed, 0)}</b>
            ) : (
              <span className="flex shrink-0 items-center gap-1">
                <input inputMode="decimal" aria-label={`Límite de ${g.name}`} value={limits[g.id] ?? ""}
                  onChange={(e) => setLimits((l) => ({ ...l, [g.id]: e.target.value }))}
                  className={`amount w-20 rounded-lg border px-2 py-1.5 text-right text-[15px] font-semibold tabular-nums outline-none focus:ring-2 focus:ring-blue-100 ${below ? "border-amber-300 text-amber-800" : "border-slate-200 text-slate-900 focus:border-blue-400"}`} />
                <span className="text-sm text-slate-500">€</span>
              </span>
            )}
          </li>
        ))}
        {loose > 0 && (
          <li className="flex items-center gap-3 py-3">
            <span className="opacity-60 grayscale"><CategoryIcon category="otros_gastos" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-slate-500">Sin grupo y otros gastos</span>
              <span className="block truncate text-xs text-slate-400">Lo que sueles gastar fuera de tus grupos</span>
            </span>
            <b className="amount shrink-0 text-[15px] font-semibold tabular-nums text-slate-500">~{eur(loose, 0)}</b>
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-slate-400">Prueba: no se guarda nada. Los grupos que son todo recibos solo bajan si cancelas algo.</p>
    </div>
  );
}
