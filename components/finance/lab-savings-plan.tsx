"use client";
// Laboratorio · «Crear mi plan de ahorro» (24/11/2026). La historia: Mi plan vacío → (si hay mucho sin entender,
// primero revisarlo) → «Analizando tus últimos 3 meses…» → «He analizado tus gastos» con 2-3 observaciones → el plan
// propuesto (lo que pagas cada mes aparte; un grupo con límite por fila) → «Aplicar plan».
// Los números los calcula la app; aquí los textos y los límites salen de reglas. Más adelante la IA agrupará,
// propondrá límites y escribirá las observaciones, siempre dentro de estas reglas (nunca por debajo de lo que se
// repite, nada sobre vivienda o préstamos, comparaciones solo con tus propios datos). Prueba: no guarda nada.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import type { planView } from "@/lib/finance/service";
import { categoryLabel, familyOf } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";
import { CategoryIcon } from "./category-icon";

type Plan = Awaited<ReturnType<typeof planView>>;
type Step = "inicio" | "analizando" | "resultado" | "aplicado";

/** Lo que no sabemos qué es: si pesa más de esto, primero conviene revisarlo (la propuesta saldría peor). */
const UNKNOWN_CATS = ["otros_gastos", "sin_clasificar"];
const UNKNOWN_LIMIT = 0.15;
/** Familias donde sí tiene sentido proponer recortar (lo demás se respeta: casa, préstamos, salud…). */
const CUTTABLE: Record<string, number> = { ocio: 0.15, compras: 0.15, servicios: 0.1, alimentacion: 0.05, transporte: 0.05 };
const round5 = (n: number) => Math.round(n / 5) * 5;

function analyze(data: Plan) {
  const closed = data.history.slice(1, 4);
  const n = Math.max(1, closed.length);
  const avg: Record<string, number> = {};
  for (const c of closed) for (const [k, v] of Object.entries(c.full)) avg[k] = (avg[k] ?? 0) + v / n;
  const total = Object.values(avg).reduce((t, v) => t + v, 0);
  const unknown = UNKNOWN_CATS.reduce((t, k) => t + (avg[k] ?? 0), 0);

  // Lo que se repite cada mes, por categoría (va aparte: no se le pone límite).
  const repeats = (data.next?.items ?? []).filter((i) => i.source === "repite");
  const committed: Record<string, number> = {};
  for (const i of repeats) committed[i.category] = (committed[i.category] ?? 0) + i.amount;
  const fixedTotal = Object.values(committed).reduce((t, v) => t + v, 0);

  // Lo variable, por familia: lo que sueles gastar menos lo que ya se repite.
  const fam = new Map<string, { key: string; label: string; cats: string[]; usual: number; fixed: number }>();
  for (const [k, v] of Object.entries(avg)) {
    if (UNKNOWN_CATS.includes(k) || v <= 0) continue;
    const f = familyOf(k);
    const x = fam.get(f.key) ?? { key: f.key, label: f.key === "ocio" ? "Ocio y caprichos" : f.label, cats: [], usual: 0, fixed: 0 };
    x.cats.push(k); x.usual += v; x.fixed += Math.min(v, committed[k] ?? 0);
    fam.set(f.key, x);
  }
  const groups = [...fam.values()]
    .map((g) => {
      const variable = Math.max(0, g.usual - g.fixed);
      const cut = CUTTABLE[g.key] ?? 0;
      const limit = Math.max(round5(g.fixed + variable * (1 - cut)), Math.ceil(g.fixed));
      return { ...g, variable, limit, saving: Math.max(0, Math.round(g.usual - limit)) };
    })
    .filter((g) => g.variable >= 15) // lo que es casi todo recibos no lleva límite: ya está en «lo que pagas cada mes»
    .sort((a, b) => b.usual - a.usual);
  const saving = groups.reduce((t, g) => t + g.saving, 0);

  // Observaciones, siempre con sus propios datos.
  const income = data.budget.income;
  const notes: string[] = [];
  const top = groups.filter((g) => CUTTABLE[g.key] && CUTTABLE[g.key] >= 0.1)[0];
  if (top) notes.push(income ? `En ${top.label.toLowerCase()} se te van ~${eur(top.usual, 0)} al mes, el ${Math.round((top.usual / income) * 100)} % de lo que cobras.` : `En ${top.label.toLowerCase()} se te van ~${eur(top.usual, 0)} al mes.`);
  if (closed.length >= 3) {
    const rising = Object.keys(avg)
      .filter((k) => !UNKNOWN_CATS.includes(k) && !committed[k])
      .map((k) => ({ k, last: closed[0].full[k] ?? 0, before: ((closed[1].full[k] ?? 0) + (closed[2].full[k] ?? 0)) / 2 }))
      .filter((x) => x.last - x.before > 30 && x.last > x.before * 1.3)
      .sort((a, b) => b.last - b.before - (a.last - a.before))[0];
    if (rising) notes.push(`${categoryLabel(rising.k)} ha subido: ${eur(rising.last, 0)} el mes pasado, frente a ~${eur(rising.before, 0)} antes.`);
  }
  const subs = repeats.filter((i) => i.category === "suscripciones");
  if (subs.length >= 2) notes.push(`Pagas ${eur(subs.reduce((t, i) => t + i.amount, 0), 0)} al mes en ${subs.length} suscripciones. ¿Las sigues usando todas?`);

  return { total, unknown, unknownShare: total > 0 ? unknown / total : 0, fixedTotal, repeats, groups, saving, notes, months: closed.length };
}

export function LabSavingsPlan() {
  const { data, error } = useFinance<Plan>("plan");
  const [step, setStep] = useState<Step>("inicio");
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [ignoreUnknown, setIgnoreUnknown] = useState(false);
  const a = useMemo(() => (data ? analyze(data) : null), [data]);
  useEffect(() => {
    if (step !== "analizando") return;
    const t = window.setTimeout(() => setStep("resultado"), 1800);
    return () => window.clearTimeout(t);
  }, [step]);
  useEffect(() => { if (a) setLimits(Object.fromEntries(a.groups.map((g) => [g.key, String(g.limit)]))); }, [a]);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data || !a) return <SkeletonList rows={5} />;

  const blocked = a.unknownShare > UNKNOWN_LIMIT && !ignoreUnknown;

  if (step === "inicio") return (
    <div className="py-6 text-center">
      <p className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900">Ahorra mes a mes</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">Analizamos tus últimos meses y te proponemos un plan: cuánto gastar en cada cosa y cuánto ahorrarías.</p>
      {blocked ? (
        <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-amber-50 px-4 py-4 text-left">
          <p className="text-sm font-semibold text-amber-900">Antes, ayúdanos a entender tus gastos</p>
          <p className="amount mt-1 text-sm text-amber-800">
            Unos {eur(a.unknown, 0)} al mes ({Math.round(a.unknownShare * 100)} % de lo que gastas) están en «Otros gastos» y no sabemos qué son. Si los clasificas, el plan saldrá mucho mejor.
          </p>
          <Link href="/finanzas/categoria/otros_gastos" className="mt-3 inline-flex items-center gap-0.5 text-sm font-semibold text-blue-700">Revisarlos<ChevronRight className="h-4 w-4" /></Link>
          <button type="button" onClick={() => setIgnoreUnknown(true)} className="mt-1 block text-xs text-amber-700 underline">Crear el plan igualmente</button>
        </div>
      ) : (
        <>
          {a.unknownShare > UNKNOWN_LIMIT ? null : a.unknown > 0 && <p className="mx-auto mt-4 max-w-xs text-sm font-medium text-emerald-700">Tus gastos están listos para crear tu plan.</p>}
          <button type="button" onClick={() => setStep("analizando")} className="mt-6 inline-flex h-11 items-center rounded-full bg-blue-600 px-6 text-[15px] font-semibold text-white active:bg-blue-700">
            Crear mi plan de ahorro
          </button>
        </>
      )}
      <p className="mt-6 text-[11px] text-slate-400">Prueba: «Otros gastos» pesa ahora un {Math.round(a.unknownShare * 100)} % (aviso a partir del {UNKNOWN_LIMIT * 100} %).</p>
    </div>
  );

  if (step === "analizando") return (
    <div className="flex flex-col items-center py-16 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <p className="mt-4 text-[15px] font-medium text-slate-800">Analizando tus últimos {a.months} meses…</p>
      <p className="mt-1 text-sm text-slate-500">Lo que se repite, en qué se te va más y qué ha cambiado.</p>
    </div>
  );

  const rows = a.groups.map((g) => {
    const v = Math.max(Math.ceil(g.fixed), Number((limits[g.key] ?? "").replace(",", ".")) || 0);
    return { g, v, saving: Math.max(0, Math.round(g.usual - v)) };
  });
  const saving = rows.reduce((t, r) => t + r.saving, 0);

  return (
    <div className="pb-4">
      <p className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900">He analizado tus gastos</p>
      <ul className="mt-3 space-y-2">
        {a.notes.map((t) => <li key={t} className="amount rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{t}</li>)}
        {!a.notes.length && <li className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">Tus gastos son bastante estables: no hay nada que destaque.</li>}
      </ul>

      <p className="amount mt-6 text-[26px] font-semibold leading-none tracking-tight text-emerald-700">~{eur(saving, 0)} al mes</p>
      <p className="mt-1 text-sm text-slate-500">es lo que ahorrarías con este plan frente a lo que sueles gastar</p>

      <h3 className="mt-6 text-sm font-medium text-slate-500">Tu plan</h3>
      <ul className="mt-1 divide-y divide-slate-100">
        {rows.map(({ g, saving: s }) => (
          <li key={g.key} className="flex items-center gap-3 py-3">
            <CategoryIcon category={g.cats[0]} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-slate-900">{g.label}</span>
              <span className="amount block truncate text-xs text-slate-500">Sueles ~{eur(g.usual, 0)}{s > 0 ? <span className="text-emerald-700"> · ahorras {eur(s, 0)}</span> : ""}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <input inputMode="decimal" aria-label={`Límite de ${g.label}`} value={limits[g.key] ?? ""} onChange={(e) => setLimits((l) => ({ ...l, [g.key]: e.target.value }))}
                className="amount w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-[15px] font-semibold tabular-nums text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              <span className="text-sm text-slate-500">€</span>
            </span>
          </li>
        ))}
      </ul>

      {/* Lo que se repite: sin límite (no tiene sentido ponérselo a la hipoteca); solo baja si cancelas algo. */}
      <div className="mt-4 flex items-center gap-3 border-t border-slate-100 py-3">
        <span className="opacity-60 grayscale"><CategoryIcon category="suscripciones" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-slate-700">Lo que pagas cada mes</span>
          <span className="block truncate text-xs text-slate-500">{a.repeats.length} recibos y suscripciones · solo baja si cancelas algo</span>
        </span>
        <b className="amount shrink-0 text-[15px] font-semibold tabular-nums text-slate-700">{eur(a.fixedTotal, 0)}</b>
      </div>

      {step === "aplicado" ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-800">Plan aplicado (en la prueba no se guarda). Tus límites aparecerían en Inicio.</p>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => setStep("aplicado")} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-blue-600 text-[15px] font-semibold text-white active:bg-blue-700">Aplicar plan</button>
          <button type="button" onClick={() => setStep("inicio")} className="h-11 px-3 text-sm font-medium text-slate-500">Volver</button>
        </div>
      )}
    </div>
  );
}
