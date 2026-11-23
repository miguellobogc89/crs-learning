"use client";
// Plan · «¿Me lo puedo permitir?» y «¿Cuánto ahorraré si sigo así?», con el cálculo a la vista.
import { useState } from "react";
import { Calculator, LineChart } from "lucide-react";
import type { forecast } from "@/lib/finance/service";
import { card, eur, field, flat, ghost } from "@/components/trading/format";
import { SectionTitle } from "@/components/trading/ui";
import { longDay, useFinance } from "./api";

type View = Awaited<ReturnType<typeof forecast>>;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt>{label}</dt>
      <dd className="whitespace-nowrap font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function WhatIfCard() {
  const [amount, setAmount] = useState("");
  const [until, setUntil] = useState("");
  const [query, setQuery] = useState({ amount: "", until: "" });
  const path = `forecast?${new URLSearchParams({ ...(query.amount ? { amount: query.amount } : {}), ...(query.until ? { until: query.until } : {}) })}`;
  const { data, loading } = useFinance<View>(path);
  const a = data?.afford ?? null;
  const s = data?.savings ?? null;
  return (
    <section className={`${card} ${flat} grid gap-6 p-4 sm:p-6 lg:grid-cols-2 ${loading ? "opacity-80" : ""}`}>
      <div>
        <SectionTitle icon={Calculator} tint="amber" size="base">¿Me lo puedo permitir?</SectionTitle>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery((q) => ({ ...q, amount: amount.replace(",", ".") })); }}>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Importe de la compra" className={`${field} min-w-0 flex-1`} />
          <button type="submit" className={ghost}>Calcular</button>
        </form>
        {a && (
          <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${a.verdict === "si" ? "bg-emerald-50 text-emerald-900" : a.verdict === "con_ajustes" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}>
            <p className="font-semibold">
              {a.verdict === "si" ? `Sí: puedes gastar ${eur(a.amount, 2)} y seguir cumpliendo tu objetivo.` : a.verdict === "con_ajustes" ? "Puedes pagarlo, pero romperías el objetivo de ahorro de este ciclo." : "No: acabarías el ciclo en negativo."}
            </p>
            <dl className="mt-2">
              <Row label="Ahorro del ciclo después" value={eur(a.projectedNetAfter, 2)} />
              {a.projectedEndBalanceAfter !== null && <Row label="Saldo al acabar el ciclo" value={eur(a.projectedEndBalanceAfter, 2)} />}
              {a.shortfallVsGoal ? <Row label="Te faltaría para el objetivo" value={eur(a.shortfallVsGoal, 2)} /> : null}
            </dl>
          </div>
        )}
        {!a && data && data.projection.safeToSpend !== null && (
          <p className="mt-3 text-sm text-slate-500">Hoy tienes un margen de <b className="tabular-nums text-slate-900">{eur(Math.max(0, data.projection.safeToSpend), 2)}</b> sin romper tu objetivo.</p>
        )}
      </div>
      <div>
        <SectionTitle icon={LineChart} tint="emerald" size="base">¿Cuánto ahorraré si sigo así?</SectionTitle>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery((q) => ({ ...q, until })); }}>
          <input type="date" value={until || s?.until || ""} onChange={(e) => setUntil(e.target.value)} className={`${field} min-w-0 flex-1`} />
          <button type="submit" className={ghost}>Calcular</button>
        </form>
        {s && (
          <>
            <p className="mt-3 text-sm text-slate-700">
              Hasta el <b>{longDay(s.until)}</b>: unos <b className="tabular-nums text-emerald-700">{eur(s.total, 2)}</b> ahorrados ({eur(s.thisCycleProjected, 2)} de este ciclo + {s.fullCycles} {s.fullCycles === 1 ? "ciclo" : "ciclos"} × {eur(s.monthlyAverage, 2)}).
              {s.liquidityAtEnd !== null && <> Tendrías unos <b className="tabular-nums">{eur(s.liquidityAtEnd, 2)}</b> de liquidez.</>}
            </p>
            <p className="mt-1 text-xs text-slate-400">{s.basis}.</p>
          </>
        )}
      </div>
    </section>
  );
}
