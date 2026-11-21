"use client";
// Plan (seguimiento): ¿voy dentro del plan este ciclo? Gastado en paquetes frente a lo presupuestado, ahorro del
// ciclo, gastos sin paquete, una barra por paquete con el día del ciclo y qué te está desviando. Se configura en
// «Configurar mi plan» (plan-config-panel.tsx); aquí no se edita nada.
import Link from "next/link";
import { useState } from "react";
import { AlertCircle, Check, ChevronRight, Package, SlidersHorizontal, TrendingUp } from "lucide-react";
import type { packagesView } from "@/lib/finance/service";
import { card, eur, flat, ghost, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { shortDay, useFinance } from "./api";

type View = Awaited<ReturnType<typeof packagesView>>;
type Pack = View["packages"][number];

const CONFIG = "/finanzas/configurar";
const BAR: Record<"ok" | "atencion" | "superado", string> = { ok: "bg-emerald-500", atencion: "bg-amber-500", superado: "bg-red-500" };

function Stat({ label, value, hint, tone = "slate" }: { label: string; value: string; hint: string; tone?: "slate" | "emerald" | "amber" | "red" }) {
  const box = tone === "amber" ? "bg-amber-50" : tone === "red" ? "bg-red-50" : "bg-slate-50";
  const text = tone === "amber" ? "text-amber-800" : tone === "red" ? "text-red-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className={`rounded-xl p-3 ${box}`}>
      <p className={`text-xs ${tone === "amber" ? "text-amber-800" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${text}`}>{value}</p>
      <p className={`text-xs ${tone === "amber" ? "text-amber-700" : "text-slate-500"}`}>{hint}</p>
    </div>
  );
}

function ChargeList({ items }: { items: { id: string; date: string; amount: number; description: string; detail: string }[] }) {
  if (!items.length) return <p className="text-xs text-slate-500">Sin cargos este ciclo.</p>;
  return (
    <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
      {items.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-1.5 text-sm">
          <span className="w-12 shrink-0 text-xs text-slate-400">{shortDay(c.date)}</span>
          <span className="min-w-0 flex-1 break-words text-slate-700" title={c.detail}>{c.description}</span>
          <span className="shrink-0 tabular-nums text-slate-900">{eur(-c.amount, 2)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Una barra por paquete: lo gastado frente al objetivo, con la raya del día del ciclo. */
function PackageBar({ p, expectedPct }: { p: Pack; expectedPct: number }) {
  const [open, setOpen] = useState(false);
  const pr = p.progress;
  // Sin objetivo, la barra compara con la media de los últimos ciclos (en gris): nunca queda vacía.
  const vsAverage = !pr && p.average !== null && p.average > 0 ? Math.round((p.current / p.average) * 1000) / 10 : null;
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="grid w-full grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_9rem]">
        <span className="flex min-w-0 items-center gap-1 text-sm font-medium text-slate-900">
          <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="break-words">{p.name}</span>
        </span>
        <span className="relative h-3.5 rounded-full bg-slate-100">
          {pr ? (
            <span className={`absolute inset-y-0 left-0 rounded-full ${BAR[pr.status]}`} style={{ width: `${Math.min(100, Math.max(2, pr.pct))}%` }} />
          ) : vsAverage !== null ? (
            <span className="absolute inset-y-0 left-0 rounded-full bg-slate-400" style={{ width: `${Math.min(100, Math.max(2, vsAverage))}%` }} />
          ) : (
            <span className="absolute inset-0 flex items-center pl-2 text-[11px] text-slate-400">sin objetivo ni historial</span>
          )}
          <span className="absolute -inset-y-1 w-0.5 bg-slate-700" style={{ left: `${Math.min(100, expectedPct)}%` }} aria-hidden="true" />
        </span>
        <span className={`text-right text-sm tabular-nums ${pr?.status === "superado" ? "font-semibold text-red-700" : "text-slate-700"}`}>
          {eur(p.current, 2)}
          {p.goal !== null ? <span className="text-slate-400"> / {eur(p.goal, 2)}</span> : p.average !== null && <span className="block text-[11px] text-slate-400">media {eur(p.average, 2)}</span>}
        </span>
      </button>
      {open && (
        <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2">
          {pr ? <p className="mb-1 text-xs text-slate-500">{pr.remaining >= 0 ? `Te quedan ${eur(pr.remaining, 2)} del objetivo` : `Te has pasado ${eur(-pr.remaining, 2)} del objetivo`} · media {eur(p.average, 2)}</p>
            : vsAverage !== null && <p className="mb-1 text-xs text-slate-500">Sin objetivo: llevas el {Math.round(vsAverage)} % de tu media ({eur(p.average, 2)}) con el {Math.round(expectedPct)} % del ciclo. Ponle objetivo en Configurar mi plan.</p>}
          <ChargeList items={p.currentCharges} />
        </div>
      )}
    </li>
  );
}

const INSIGHT = {
  danger: { icon: TrendingUp, color: "text-red-600" },
  warning: { icon: AlertCircle, color: "text-amber-600" },
  success: { icon: Check, color: "text-emerald-600" },
} as const;

export function PlanPanel() {
  const { data, error } = useFinance<View>("packages");
  const [showUnpackaged, setShowUnpackaged] = useState(false);
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={6} />;

  const { cycle, packages, unpackaged, cycleSaving, savings } = data;
  if (packages.length === 0) {
    return (
      <section className={`${card} ${flat} flex flex-col items-center px-6 py-12 text-center`}>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Package className="h-6 w-6" /></span>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Configura tu plan</h2>
        <p className="mt-2 max-w-md text-sm text-slate-500">Crea tus paquetes (fijos, tabaco, gasolina…) con sus objetivos y aquí verás cada ciclo si vas dentro del plan.</p>
        <Link href={CONFIG} className={`${primary} mt-6`}><SlidersHorizontal className="h-4 w-4" /> Configurar mi plan</Link>
      </section>
    );
  }

  const expectedPct = Math.min(100, Math.round((cycle.day / cycle.totalDays) * 1000) / 10);
  const spent = Math.round(packages.reduce((s, p) => s + p.current, 0) * 100) / 100;
  const budgeted = Math.round(packages.reduce((s, p) => s + (p.goal ?? 0), 0) * 100) / 100;
  const noGoal = packages.filter((p) => p.goal === null).length;
  const goal = savings.perCycle;
  const saved = cycleSaving.saved;
  const ordered = [...packages].sort((a, b) => (b.progress?.pct ?? -1) - (a.progress?.pct ?? -1));

  return (
    <div className="space-y-4 pb-4">
      <section className={`${card} ${flat}`}>
        <CardHeader actions={<Link href={CONFIG} className={ghost}><SlidersHorizontal className="h-4 w-4" /> Configurar mi plan</Link>}>
          <SectionTitle icon={Package} tint="blue" size="base">
            Este ciclo <span className="ml-1 text-sm font-normal text-slate-500">{shortDay(cycle.start)} – {shortDay(cycle.end)} · día {cycle.day} de {cycle.totalDays}</span>
          </SectionTitle>
        </CardHeader>
        <div className="grid gap-2 px-4 pb-5 sm:grid-cols-3 sm:px-6">
          <Stat
            label="Gastado en paquetes"
            value={eur(spent, 2)}
            hint={budgeted > 0 ? `de ${eur(budgeted, 2)} presupuestados${noGoal ? ` · ${noGoal} sin objetivo` : ""}` : "Ningún paquete tiene objetivo"}
            tone={budgeted > 0 && spent > budgeted ? "red" : "slate"}
          />
          <Stat
            label="Ahorro del ciclo"
            value={eur(saved, 2)}
            hint={`Ingresado ${eur(cycleSaving.income, 2)} − gastado ${eur(cycleSaving.expenses, 2)}${goal !== null ? (saved >= goal ? ` · objetivo de ${eur(goal, 2)} cumplido` : ` · objetivo ${eur(goal, 2)}`) : ""}`}
            tone={goal !== null && saved >= goal ? "emerald" : saved < 0 ? "red" : "slate"}
          />
          <div role="button" tabIndex={0} onClick={() => setShowUnpackaged(!showUnpackaged)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowUnpackaged(!showUnpackaged); } }} className="cursor-pointer rounded-xl text-left focus-visible:outline-2 focus-visible:outline-blue-600" aria-expanded={showUnpackaged}>
            <Stat
              label="Gastos sin paquete"
              value={eur(unpackaged.total, 2)}
              hint={unpackaged.count ? `${unpackaged.count} ${unpackaged.count === 1 ? "cargo" : "cargos"} · ${showUnpackaged ? "ocultar" : "ver"}` : "Todo tu gasto está en paquetes"}
              tone={unpackaged.total > 0 ? "amber" : "slate"}
            />
          </div>
        </div>
        {showUnpackaged && unpackaged.count > 0 && (
          <div className="mx-4 mb-5 rounded-xl bg-amber-50/60 px-3 py-2 sm:mx-6">
            <p className="mb-1 text-xs text-amber-800">Gasto real de este ciclo que no está en ningún paquete. Asígnalo en <Link href={CONFIG} className="font-medium underline">Configurar mi plan</Link>.</p>
            <ChargeList items={unpackaged.items} />
          </div>
        )}
      </section>

      <section className={`${card} ${flat}`}>
        <CardHeader>
          <SectionTitle icon={TrendingUp} tint="emerald" size="base">¿Voy dentro del plan?</SectionTitle>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 bg-slate-700" aria-hidden="true" /> día del ciclo ({Math.round(expectedPct)} %)</span>
            {packages.some((p) => p.goal === null) && <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-full bg-slate-400" aria-hidden="true" /> sin objetivo: frente a tu media</span>}
          </span>
        </CardHeader>
        <ul className="px-4 pb-3 sm:px-6">
          {ordered.map((p) => <PackageBar key={p.id} p={p} expectedPct={expectedPct} />)}
        </ul>
      </section>

      {data.insights.length > 0 && (
        <section className={`${card} ${flat} p-4 sm:p-6`}>
          <SectionTitle icon={AlertCircle} tint="amber" size="base">Qué te está desviando</SectionTitle>
          <ul className="mt-3 space-y-2">
            {data.insights.map((i) => {
              const { icon: Icon, color } = INSIGHT[i.tone];
              return (
                <li key={i.text} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} aria-hidden="true" />
                  <span>{i.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
