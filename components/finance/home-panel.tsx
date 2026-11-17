"use client";
// Inicio: «¿cómo voy ahora?». Siempre abre en el ciclo actual (flechas para ver los anteriores): saldo,
// disponible hasta fin de ciclo, gasto comparado con el ciclo anterior a la misma altura, evolución del saldo,
// en qué se va el dinero, cuentas y lo pendiente. El análisis por periodos vive en Movimientos.
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, BarChart3, BellRing, ChevronLeft, ChevronRight, Eye, EyeOff, Info, Landmark, PiggyBank, Sparkles, TrendingUp, Wallet, X } from "lucide-react";
import type { overview } from "@/lib/finance/service";
import { card, eur, flat, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, SectionTitle } from "@/components/trading/ui";
import { SkeletonStats, SkeletonList } from "@/components/trading/skeletons";
import { fapi, refreshFinance, shortDay, useFinance } from "./api";
import { BalanceLine, CategoryBars } from "./charts";
import { useHideAmounts } from "./privacy";
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

/** Cambio frente al ciclo anterior: «▼ 8 % que a estas alturas del anterior». */
function delta(now: number, prev: number | null | undefined, partial: boolean, lowerIsBetter: boolean) {
  if (prev === null || prev === undefined || Math.abs(prev) < 1) return null;
  const d = ((now - prev) / Math.abs(prev)) * 100;
  const when = partial ? "que a estas alturas del ciclo anterior" : "que el ciclo anterior";
  if (Math.abs(d) < 1) return { text: `Igual ${when}`, tone: "text-slate-500" };
  const good = lowerIsBetter ? d < 0 : d > 0;
  return { text: `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(0)} % ${when}`, tone: good ? "text-emerald-700" : "text-red-700" };
}

const TINT = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
} as const;

function KpiCard({ icon: Icon, tint, label, value, valueTone, sub, subTone, className = "" }: {
  icon: typeof Wallet; tint: keyof typeof TINT; label: string; value: string; valueTone?: string; sub?: string | null; subTone?: string; className?: string;
}) {
  return (
    <div className={`${card} flex items-start gap-3 p-4 sm:gap-4 sm:p-5 ${className}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${TINT[tint]}`}><Icon className="h-5 w-5 sm:h-6 sm:w-6" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-600">{label}</p>
        <p className={`amount mt-0.5 whitespace-nowrap text-xl font-bold tabular-nums tracking-tight sm:text-[28px] ${valueTone ?? "text-slate-950"}`}>{value}</p>
        {sub && <p className={`mt-0.5 text-xs leading-snug sm:text-sm ${subTone ?? "text-slate-500"}`}>{sub}</p>}
      </div>
    </div>
  );
}

export function HomePanel() {
  const params = useSearchParams();
  const [offset, setOffset] = useState(() => Math.min(0, Number(params.get("ciclo")) || 0));
  const { data, error, loading } = useFinance<Overview>(offset ? `overview?cycle=${offset}` : "overview");
  const { hidden, toggle } = useHideAmounts();
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return (
    <div className="space-y-4"><SkeletonStats /><SkeletonList rows={6} /></div>
  );
  if (!data.hasData) return <Empty />;
  const v = data.cycleView;
  const t = v.totals;
  const expDelta = delta(t.expenses, v.previous?.expenses, !!v.previous?.partial, true);
  const goal = data.settings.savingsGoal;
  const review = data.pendingReview;

  return (
    <div className={`space-y-4 pb-6 ${loading ? "opacity-80" : ""}`}>
      {/* Ciclo: flechas para mirar atrás; «Ocultar importes» */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 items-center rounded-xl border border-slate-200 bg-white">
          <button type="button" onClick={() => setOffset((o) => o - 1)} disabled={!v.canGoBack} aria-label="Ciclo anterior" className="rounded-l-xl p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-0 px-1 text-center text-sm">
            <span className="block truncate font-semibold text-slate-900">{v.isCurrent ? "Este ciclo" : `Ciclo ${v.cycle.label}`}</span>
            <span className="block truncate text-xs text-slate-500">{v.isCurrent ? `${v.cycle.label} · quedan ${v.daysLeft} ${v.daysLeft === 1 ? "día" : "días"}` : "cerrado"}</span>
          </span>
          <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={v.isCurrent} aria-label="Ciclo siguiente" className="rounded-r-xl p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
        {!v.isCurrent && <button type="button" onClick={() => setOffset(0)} className="text-sm font-medium text-blue-700 hover:underline">Volver al actual</button>}
        <button type="button" onClick={toggle} aria-pressed={hidden} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          <span className="hidden sm:inline">{hidden ? "Mostrar importes" : "Ocultar importes"}</span>
        </button>
      </div>

      {/* Lo pendiente, arriba y con acción directa */}
      {v.isCurrent && review > 0 && (
        <Link href="/finanzas/movimientos?revisar=1" className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 hover:bg-blue-50">
          <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
          <span className="flex-1"><b>{review}</b> {review === 1 ? "movimiento" : "movimientos"} sin entender del todo: revísalos y la app aprende.</span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      {/* Tres cifras */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        <KpiCard
          className="col-span-2 lg:col-span-1"
          icon={Landmark}
          tint="blue"
          label={v.isCurrent ? "Saldo en bancos" : `Saldo al cerrar (${shortDay(v.cycle.end)})`}
          value={eur(v.balance, 2)}
          sub={v.banks.join(" · ") || null}
        />
        {v.isCurrent ? (
          <KpiCard
            icon={Wallet}
            tint="emerald"
            label="Disponible"
            value={eur(v.available, 0)}
            valueTone={v.available !== null && v.available < 0 ? "text-red-700" : "text-emerald-700"}
            sub={v.pendingFixed > 0 ? `tras ${eur(v.pendingFixed, 0)} en recibos hasta el ${shortDay(v.cycle.end)}` : `hasta el ${shortDay(v.cycle.end)}`}
          />
        ) : (
          <KpiCard
            icon={PiggyBank}
            tint="emerald"
            label="Ahorro del ciclo"
            value={eur(t.net, 0)}
            valueTone={t.net >= 0 ? "text-emerald-700" : "text-red-700"}
            sub={`ingresos ${eur(t.income, 0)}`}
          />
        )}
        <KpiCard
          icon={BarChart3}
          tint="amber"
          label={v.isCurrent ? "Gastos del ciclo" : "Gastos"}
          value={eur(t.expenses, 0)}
          sub={expDelta?.text ?? null}
          subTone={expDelta?.tone}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Evolución del saldo */}
        <section className={`${card} ${flat} p-4 sm:p-5 lg:col-span-2`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <SectionTitle icon={TrendingUp} tint="blue" size="base">Evolución de tu dinero</SectionTitle>
            <p className="flex gap-3 text-xs text-slate-500">
              <span>Ingresos <b className="amount tabular-nums text-emerald-700">{eur(t.income, 0)}</b></span>
              <span>Gastos <b className="amount tabular-nums text-slate-800">{eur(t.expenses, 0)}</b></span>
            </p>
          </div>
          <div className="mt-3">
            <BalanceLine data={v.series} start={v.cycle.start} end={v.cycle.end} projected={v.projectedEnd} />
          </div>
        </section>

        {/* Cuentas */}
        <section className={`${card} ${flat} p-4 sm:p-5`}>
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={Landmark} tint="slate" size="base">Tus cuentas</SectionTitle>
            <Link href="/finanzas/conexiones" className="text-sm font-medium text-blue-700 hover:underline">Gestionar</Link>
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {v.accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-bold uppercase text-slate-600">{(a.bank ?? "imp").slice(0, 3)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{a.name}</span>
                  {a.last4 && <span className="block text-xs text-slate-400">···· {a.last4}</span>}
                </span>
                <b className="amount shrink-0 text-sm tabular-nums text-slate-900">{a.balance === null ? "—" : a.currency === "EUR" ? eur(a.balance, 2) : `${a.balance.toFixed(2)} ${a.currency}`}</b>
              </li>
            ))}
          </ul>
        </section>

        {/* En qué se va el dinero */}
        <section className={`${card} ${flat} p-4 sm:p-5 lg:col-span-2`}>
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={Wallet} tint="indigo" size="base">En qué se va el dinero</SectionTitle>
            <Link href="/finanzas/movimientos" className="text-sm font-medium text-blue-700 hover:underline">Movimientos</Link>
          </div>
          <div className="amount-block mt-4">
            <CategoryBars items={v.categories} previous={v.previousCategories} limit={8} onSelect={(c) => { window.location.href = `/finanzas/movimientos?categoria=${c}`; }} />
          </div>
          {v.previous && <p className="mt-3 text-xs text-slate-400">{v.previous.partial ? "▲▼ frente al ciclo anterior a estas alturas." : "▲▼ frente al ciclo anterior."}</p>}
        </section>

        <div className="space-y-4">
          {v.isCurrent && (
            <section className={`${card} ${flat} p-4 sm:p-5`}>
              <SectionTitle icon={PiggyBank} tint="emerald" size="base">Cómo acabarás el ciclo</SectionTitle>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Saldo previsto el {shortDay(v.cycle.end)}</dt><dd className="amount font-bold tabular-nums text-slate-900">{eur(data.projection.projectedEndBalance, 0)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Ahorro previsto</dt><dd className={`amount font-semibold tabular-nums ${data.projection.projectedNet >= (goal ?? 0) ? "text-emerald-700" : "text-red-700"}`}>{eur(data.projection.projectedNet, 0)}</dd></div>
                {goal !== null && <div className="flex justify-between gap-3"><dt className="text-slate-500">Objetivo</dt><dd className="amount tabular-nums text-slate-700">{eur(goal, 0)}</dd></div>}
              </dl>
              <Link href="/finanzas/plan" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">¿Me lo puedo permitir? <ArrowRight className="h-3.5 w-3.5" /></Link>
            </section>
          )}
          {v.isCurrent && <Alerts alerts={data.alerts} />}
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
