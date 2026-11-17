"use client";
// Previsión: cómo acabará el ciclo (con el cálculo a la vista), «¿me lo puedo permitir?» y el ahorro
// hasta una fecha si sigues como hasta ahora.
import { useState } from "react";
import { CalendarClock, Calculator, LineChart, TrendingUp } from "lucide-react";
import type { forecast } from "@/lib/finance/service";
import { categoryLabel } from "@/lib/finance/categories";
import { card, eur, field, flat, ghost, th } from "@/components/trading/format";
import { CardHeader, ErrorNote, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { longDay, shortDay, useFinance } from "./api";

type View = Awaited<ReturnType<typeof forecast>>;

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 ${strong ? "border-t border-slate-200 pt-2.5 font-semibold" : ""}`}>
      <dt className={strong ? "text-slate-900" : "text-slate-600"}>{label}</dt>
      <dd className={`whitespace-nowrap tabular-nums ${tone ?? "text-slate-900"}`}>{value}</dd>
    </div>
  );
}

export function ForecastPanel() {
  const [amount, setAmount] = useState("");
  const [until, setUntil] = useState("");
  const [query, setQuery] = useState({ amount: "", until: "" });
  const path = `forecast?${new URLSearchParams({ ...(query.amount ? { amount: query.amount } : {}), ...(query.until ? { until: query.until } : {}) })}`;
  const { data, error, loading } = useFinance<View>(path);
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={8} />;
  const p = data.projection;
  const s = data.savings;
  const a = data.afford;
  return (
    <div className={`space-y-4 pb-4 ${loading ? "opacity-80" : ""}`}>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} ${flat} p-4 sm:p-6`}>
          <SectionTitle icon={TrendingUp} tint="blue" size="base">Fin del ciclo {p.cycle.label}</SectionTitle>
          <dl className="mt-4 text-sm">
            <Row label="Liquidez hoy" value={eur(p.liquidity, 2)} />
            <Row label="+ Cobros previstos" value={eur(p.pendingIncome, 2)} tone="text-emerald-700" />
            <Row label="− Recibos y fijos previstos" value={eur(-p.pendingFixed, 2)} />
            <Row label={`− Gasto variable esperado (${p.daysLeft} días)`} value={eur(-p.expectedVariable, 2)} />
            <Row label={`Saldo previsto el ${shortDay(p.cycle.end)}`} value={eur(p.projectedEndBalance, 2)} strong />
          </dl>
          <dl className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <Row label="Ahorro llevado este ciclo" value={eur(data.current.net, 2)} />
            <Row label="Ahorro previsto al cerrar" value={eur(p.projectedNet, 2)} tone={p.projectedNet >= (p.savingsGoal ?? 0) ? "text-emerald-700" : "text-red-700"} />
            {p.savingsGoal !== null && <Row label="Objetivo" value={eur(p.savingsGoal, 2)} />}
            <Row label="Margen para gastar sin romper el objetivo" value={eur(p.safeToSpend === null ? null : Math.max(0, p.safeToSpend), 2)} strong />
          </dl>
          <p className="mt-3 text-xs text-slate-400">{p.basis}. Los gastos marcados como extraordinarios no se proyectan.</p>
        </section>

        <section className={`${card} ${flat} p-4 sm:p-6`}>
          <SectionTitle icon={Calculator} tint="amber" size="base">¿Me lo puedo permitir?</SectionTitle>
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery((q) => ({ ...q, amount: amount.replace(",", ".") })); }}>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Importe de la compra" className={`${field} min-w-0 flex-1`} />
            <button type="submit" className={ghost}>Calcular</button>
          </form>
          {a && (
            <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${a.verdict === "si" ? "bg-emerald-50 text-emerald-900" : a.verdict === "con_ajustes" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}>
              <p className="font-semibold">
                {a.verdict === "si" ? `Sí: puedes gastar ${eur(a.amount, 2)} y seguir cumpliendo tu objetivo.` : a.verdict === "con_ajustes" ? `Puedes pagarlo, pero romperías el objetivo de ahorro de este ciclo.` : `No: acabarías el ciclo en negativo.`}
              </p>
              <dl className="mt-2">
                <Row label="Ahorro del ciclo después" value={eur(a.projectedNetAfter, 2)} />
                {a.projectedEndBalanceAfter !== null && <Row label="Saldo al acabar el ciclo" value={eur(a.projectedEndBalanceAfter, 2)} />}
                {a.shortfallVsGoal ? <Row label="Te faltaría para el objetivo" value={eur(a.shortfallVsGoal, 2)} /> : null}
              </dl>
            </div>
          )}
          <div className="mt-6 border-t border-slate-100 pt-4">
            <SectionTitle icon={LineChart} tint="emerald" size="base">¿Cuánto ahorraré si sigo así?</SectionTitle>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery((q) => ({ ...q, until })); }}>
              <input type="date" value={until || s.until} onChange={(e) => setUntil(e.target.value)} className={`${field} min-w-0 flex-1`} />
              <button type="submit" className={ghost}>Calcular</button>
            </form>
            <p className="mt-3 text-sm text-slate-700">
              Hasta el <b>{longDay(s.until)}</b>: unos <b className="tabular-nums text-emerald-700">{eur(s.total, 2)}</b> ahorrados ({eur(s.thisCycleProjected, 2)} de este ciclo + {s.fullCycles} {s.fullCycles === 1 ? "ciclo" : "ciclos"} × {eur(s.monthlyAverage, 2)}).
              {s.liquidityAtEnd !== null && <> Tendrías unos <b className="tabular-nums">{eur(s.liquidityAtEnd, 2)}</b> de liquidez.</>}
            </p>
            <p className="mt-1 text-xs text-slate-400">{s.basis}.</p>
          </div>
        </section>
      </div>

      <section className={`${card} ${flat}`}>
        <CardHeader divider><SectionTitle icon={CalendarClock} tint="violet" size="base">Recibos y cobros que faltan este ciclo</SectionTitle></CardHeader>
        {p.pending.length === 0 ? <p className="px-6 py-5 text-sm text-slate-500">Nada recurrente pendiente hasta el {shortDay(p.cycle.end)}.</p> : (
          <ul className="divide-y divide-slate-100">
            {p.pending.map((x, i) => (
              <li key={`${x.label}-${x.date}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6">
                <span className="min-w-0"><span className="block truncate font-medium text-slate-800">{x.label}</span><span className="text-xs text-slate-500">{shortDay(x.date)} · {categoryLabel(x.category)}</span></span>
                <span className={`shrink-0 font-semibold tabular-nums ${x.amount > 0 ? "text-emerald-700" : "text-slate-900"}`}>{eur(x.amount, 2)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} ${flat} overflow-hidden`}>
        <CardHeader divider><SectionTitle icon={LineChart} tint="blue" size="base">Próximos ciclos si sigues así</SectionTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Ciclo</th><th className={`${th} text-right`}>Ahorro</th><th className={`${th} text-right`}>Liquidez al cerrar</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.months.map((m) => (
                <tr key={m.cycle.start}>
                  <td className="px-3 py-2.5 text-slate-700">{m.cycle.label}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${m.saving >= 0 ? "text-emerald-700" : "text-red-700"}`}>{eur(m.saving, 2)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{eur(m.balance, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
