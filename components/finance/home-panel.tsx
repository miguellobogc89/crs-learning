"use client";
// Inicio: cómo va el ciclo, cómo acabará, en qué se va el dinero, la evolución y lo que conviene mirar.
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowRight, BarChart3, BellRing, Info, Landmark, Sparkles, TrendingUp, Wallet, X } from "lucide-react";
import type { overview } from "@/lib/finance/service";
import { card, eur, flat, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, SectionTitle } from "@/components/trading/ui";
import { SkeletonStats, SkeletonList } from "@/components/trading/skeletons";
import { fapi, refreshFinance, shortDay, useFinance } from "./api";
import { CategoryBars, CycleBars } from "./charts";
import { AccountChips, PeriodPicker } from "./period";
import { requestSync } from "./shell";

type Overview = Awaited<ReturnType<typeof overview>>;

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

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Etiqueta corta de un tramo: el mes (de un ciclo, el mes en que acaba, que es el que paga la nómina). */
function bucketShort(p: { start: string; end: string }, unit: string) {
  const d = unit === "mes" ? p.start : p.end;
  const m = Number(d.slice(5, 7)) - 1;
  return m === 0 ? `${MONTHS[m]} ${d.slice(2, 4)}` : MONTHS[m];
}

/** «+12 % frente al periodo anterior» (o nada si no hay con qué comparar). */
function vsPrevious(now: number, prev: number | null | undefined, invert = false) {
  if (prev === null || prev === undefined || Math.abs(prev) < 1) return undefined;
  const d = ((now - prev) / Math.abs(prev)) * 100;
  if (Math.abs(d) < 1) return { text: "igual que el anterior", tone: "text-slate-500" };
  const good = invert ? d < 0 : d > 0;
  return { text: `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(0)} % vs anterior (${eur(prev, 0)})`, tone: good ? "text-emerald-700" : "text-red-700" };
}

function Kpi({ label, value, tone, delta, sub }: { label: string; value: string; tone?: string; delta?: { text: string; tone: string }; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 whitespace-nowrap text-lg font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</p>
      {delta ? <p className={`mt-0.5 truncate text-xs ${delta.tone}`}>{delta.text}</p> : sub ? <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function HomePanel() {
  const { data, error } = useFinance<Overview>("overview");
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return (
    <div className="space-y-4"><SkeletonStats /><SkeletonList rows={6} /></div>
  );
  if (!data.hasData) return <Empty />;
  const { projection: p, period: pd } = data;
  const goal = data.settings.savingsGoal;
  const t = pd.totals;
  const income = t.income + t.gifts;
  const many = pd.buckets > 1;
  const unitWord = pd.unit === "mes" ? "mes" : "ciclo";
  const trend = pd.trend.map((x) => ({ label: bucketShort(x, pd.unit), title: x.label, income: x.income, expenses: x.expenses, net: x.net, current: x.current }));
  const shownAccounts = pd.accounts.filter((a) => !a.hidden);
  return (
    <div className="space-y-4 pb-4">
      {/* Periodo y cuentas: lo que se elige aquí vale también para Movimientos y se recuerda */}
      <section className={`${card} ${flat} p-3 sm:p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PeriodPicker view={pd.view} label={pd.label} className="-ml-2" />
          {data.pendingReview > 0 && (
            <Link href="/finanzas/movimientos?revisar=1" className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
              <Sparkles className="h-3.5 w-3.5" /> {data.pendingReview} por revisar
            </Link>
          )}
        </div>
        <div className="mt-2"><AccountChips accounts={pd.accounts} view={pd.view} /></div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Ingresos" value={eur(income, 2)} delta={vsPrevious(income, pd.previous?.income)} sub={t.gifts ? `incluye ${eur(t.gifts, 2)} de regalos` : undefined} />
          <Kpi label="Gastos" value={eur(t.expenses, 2)} delta={vsPrevious(t.expenses, pd.previous?.expenses, true)} sub={many ? `${eur(t.perBucketExpenses, 0)} de media por ${unitWord}` : undefined} />
          <Kpi
            label="Ahorro"
            value={eur(t.net, 2)}
            tone={t.net >= 0 ? "text-emerald-700" : "text-red-700"}
            sub={t.savingsRate !== null && Math.abs(t.savingsRate) <= 100 ? `${t.savingsRate.toFixed(0)} % de lo ingresado` : undefined}
          />
          <Kpi label="Saldo hoy" value={eur(pd.balance, 2)} sub={`${shownAccounts.length} ${shownAccounts.length === 1 ? "cuenta" : "cuentas"}`} />
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>Fijos <b className="tabular-nums text-slate-700">{eur(t.fixed, 0)}</b></span>
          <span>Variables <b className="tabular-nums text-slate-700">{eur(t.variable, 0)}</b></span>
          {t.extraordinary ? <span>Extraordinarios <b className="tabular-nums text-slate-700">{eur(t.extraordinary, 0)}</b></span> : null}
          {t.saved ? <span>A ahorro/inversión <b className="tabular-nums text-slate-700">{eur(t.saved, 0)}</b></span> : null}
          <span className="text-slate-400">{t.count} movimientos</span>
        </p>
      </section>

      {trend.length > 1 && (
        <section className={`${card} ${flat} p-4 sm:p-6`}>
          <SectionTitle icon={BarChart3} tint="blue" size="base">{many ? `Por ${unitWord}` : `Últimos ${unitWord === "mes" ? "meses" : "ciclos"}`}</SectionTitle>
          <div className="mt-3"><CycleBars data={trend} /></div>
        </section>
      )}

      <Alerts alerts={data.alerts} />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Categorías del periodo */}
        <section className={`${card} ${flat} p-4 sm:p-6 lg:col-span-3`}>
          <SectionTitle icon={Wallet} tint="indigo" size="base">En qué se va el dinero</SectionTitle>
          <div className="mt-4">
            <CategoryBars
              items={pd.categories}
              previous={pd.categories.filter((c) => c.previous !== null).map((c) => ({ category: c.category, amount: c.previous as number }))}
              limit={10}
              onSelect={(c) => { window.location.href = `/finanzas/movimientos?categoria=${c}`; }}
            />
          </div>
          {pd.previous && <p className="mt-3 text-xs text-slate-400">▲▼ frente al periodo anterior del mismo tamaño.</p>}
        </section>

        <div className="space-y-4 lg:col-span-2">
          {/* Previsión: siempre del ciclo en curso */}
          <section className={`${card} ${flat} p-4 sm:p-6`}>
            <SectionTitle icon={TrendingUp} tint="blue" size="base">Cómo acabarás el ciclo</SectionTitle>
            <p className="mt-1 text-xs text-slate-400">Ciclo {p.cycle.label} · quedan {p.daysLeft} días</p>
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

          {/* Saldo de cada cuenta */}
          <section className={`${card} ${flat} p-4 sm:p-6`}>
            <SectionTitle icon={Landmark} tint="slate" size="base">Cuentas</SectionTitle>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {pd.accounts.map((a) => (
                <li key={a.id} className={`flex items-center justify-between gap-3 py-2 ${a.hidden ? "opacity-40" : ""}`}>
                  <span className="min-w-0 truncate text-slate-700">{a.name}{a.last4 ? <span className="ml-1.5 text-xs text-slate-400">·{a.last4}</span> : null}</span>
                  <b className="shrink-0 tabular-nums text-slate-900">{eur(a.balance, 2)}</b>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {data.syncDue && (
        <p className="text-center text-xs text-slate-400">
          <button type="button" className="hover:underline" onClick={() => { requestSync(); refreshFinance(); }}>Actualizar con los bancos</button>
        </p>
      )}
    </div>
  );
}
