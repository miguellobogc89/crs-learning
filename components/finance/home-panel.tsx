"use client";
// Inicio: cómo va el ciclo, cómo acabará, en qué se va el dinero, la evolución y lo que conviene mirar.
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowRight, BellRing, Info, Sparkles, TrendingUp, Wallet, X } from "lucide-react";
import type { overview } from "@/lib/finance/service";
import { card, eur, flat, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, SectionTitle } from "@/components/trading/ui";
import { SkeletonStats, SkeletonList } from "@/components/trading/skeletons";
import { fapi, refreshFinance, shortDay, useFinance } from "./api";
import { CategoryBars } from "./charts";
import { requestSync } from "./shell";

type Overview = Awaited<ReturnType<typeof overview>>;

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 whitespace-nowrap text-lg font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function Empty() {
  return (
    <div className={`${card} p-8 text-center`}>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Wallet className="h-6 w-6" /></span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Conecta tus bancos para empezar</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Con acceso de solo lectura a Santander, BBVA y Revolut, CRS Finance guarda tus movimientos, entiende cada uno y te dice cómo vas. También puedes importar extractos en CSV, Excel o PDF.
      </p>
      <Link href="/finanzas/conexiones" className={`${primary} mt-5`}>Ir a Cuentas <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}

function Alerts({ alerts }: { alerts: Overview["alerts"] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const pending = alerts.filter((a) => !hidden.has(a.key));
  const list = all ? pending : pending.slice(0, 3);
  if (!list.length) return null;
  const dismiss = async (key: string) => {
    setHidden((h) => new Set(h).add(key));
    await fapi("dismiss", { key }).catch(() => undefined);
  };
  return (
    <section className={`${card} ${flat}`}>
      <CardHeader><SectionTitle icon={BellRing} tint="amber" size="base">Para revisar</SectionTitle></CardHeader>
      <ul className="divide-y divide-slate-100 px-2 pb-2">
        {list.map((a) => {
          const Icon = a.level === "importante" ? AlertTriangle : a.level === "aviso" ? BellRing : Info;
          const tone = a.level === "importante" ? "text-red-600" : a.level === "aviso" ? "text-amber-600" : "text-blue-600";
          return (
            <li key={a.key} className="flex items-start gap-3 px-4 py-3">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-label={a.level} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{a.body}</p>
              </div>
              <button type="button" onClick={() => void dismiss(a.key)} aria-label="Descartar" className="-mr-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </li>
          );
        })}
      </ul>
      {pending.length > 3 && !all && (
        <button type="button" onClick={() => setAll(true)} className="w-full border-t border-slate-100 py-2.5 text-sm font-medium text-blue-700 hover:bg-slate-50">Ver {pending.length - 3} más</button>
      )}
    </section>
  );
}

export function HomePanel() {
  const { data, error } = useFinance<Overview>("overview");
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return (
    <div className="space-y-4"><SkeletonStats /><SkeletonList rows={6} /></div>
  );
  if (!data.hasData) return <Empty />;
  const { current, projection: p, previous } = data;
  const goal = data.settings.savingsGoal;
  const daysTotal = Math.round((new Date(`${current.cycle.end}T00:00:00Z`).getTime() - new Date(`${current.cycle.start}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const elapsed = daysTotal - p.daysLeft;
  return (
    <div className="space-y-4 pb-4">
      {/* El ciclo de un vistazo */}
      <section className={`${card} ${flat} p-4 sm:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ciclo {current.cycle.label}</p>
            <p className="mt-1 text-sm text-slate-600">Día {elapsed} de {daysTotal} · quedan {p.daysLeft} días</p>
          </div>
          {data.pendingReview > 0 && (
            <Link href="/finanzas/movimientos?revisar=1" className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
              <Sparkles className="h-3.5 w-3.5" /> {data.pendingReview} movimientos por revisar
            </Link>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Ingresos" value={eur(current.income + current.gifts, 2)} sub={current.gifts ? `incluye ${eur(current.gifts, 2)} de regalos` : previous ? `anterior: ${eur(previous.income, 2)}` : undefined} />
          <Stat label="Gastos" value={eur(current.expenses, 2)} sub={previous ? `anterior: ${eur(previous.expenses, 2)}` : undefined} />
          <Stat label="Ahorro" value={eur(current.net, 2)} tone={current.net >= 0 ? "text-emerald-700" : "text-red-700"} sub={goal !== null ? `objetivo: ${eur(goal, 2)}` : current.savingsRate !== null ? `${current.savingsRate.toFixed(0)} % de lo ingresado` : undefined} />
          <Stat label="Liquidez" value={eur(data.liquidity, 2)} sub={`${data.accounts.filter((a) => a.included).length} cuentas`} />
        </div>
      </section>

      <Alerts alerts={data.alerts} />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Previsión */}
        <section className={`${card} ${flat} p-4 sm:p-6 lg:col-span-2`}>
          <SectionTitle icon={TrendingUp} tint="blue" size="base">Cómo acabarás el ciclo</SectionTitle>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Saldo previsto el {shortDay(p.cycle.end)}</dt><dd className="font-bold tabular-nums text-slate-900">{eur(p.projectedEndBalance, 2)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Ahorro previsto del ciclo</dt><dd className={`font-semibold tabular-nums ${p.projectedNet >= (goal ?? 0) ? "text-emerald-700" : "text-red-700"}`}>{eur(p.projectedNet, 2)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Puedes gastar sin romper el objetivo</dt><dd className="font-semibold tabular-nums text-slate-900">{eur(p.safeToSpend === null ? null : Math.max(0, p.safeToSpend), 2)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-400">
            Incluye {eur(p.pendingFixed, 2)} en recibos pendientes, {eur(p.pendingIncome, 2)} en cobros previstos y {eur(p.expectedVariable, 2)} de gasto variable esperado.
          </p>
          <Link href="/finanzas/plan" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">¿Me lo puedo permitir? <ArrowRight className="h-3.5 w-3.5" /></Link>
        </section>

        {/* Categorías */}
        <section className={`${card} ${flat} p-4 sm:p-6 lg:col-span-3`}>
          <SectionTitle icon={Wallet} tint="indigo" size="base">En qué se va el dinero</SectionTitle>
          <div className="mt-4">
            <CategoryBars items={current.byCategory} previous={previous?.byCategory} onSelect={(c) => { window.location.href = `/finanzas/movimientos?categoria=${c}`; }} />
          </div>
          {previous && <p className="mt-3 text-xs text-slate-400">▲▼ frente al ciclo {previous.cycle.label}.</p>}
        </section>
      </div>

      

      {data.syncDue && (
        <p className="text-center text-xs text-slate-400">
          <button type="button" className="hover:underline" onClick={() => { requestSync(); refreshFinance(); }}>Actualizar con los bancos</button>
        </p>
      )}
    </div>
  );
}
