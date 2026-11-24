"use client";
// Inicio: «Este mes» enseña el gasto acumulado del mes frente al mes pasado y tu objetivo, y cómo vas en cada grupo
// de Mi plan (components/finance/home-plan.tsx); además lo pendiente de revisar y tus cuentas. «Previsión» muestra
// los próximos ciclos estimados.
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowRight, BellRing, Info, Landmark, Wallet, X } from "lucide-react";
import type { overview } from "@/lib/finance/service";
import { card, eur, flat, primary } from "@/components/trading/format";
import { CardHeader, ErrorNote, SectionTitle } from "@/components/trading/ui";
import { SkeletonStats, SkeletonList } from "@/components/trading/skeletons";
import { fapi, refreshFinance, useFinance } from "./api";
import { requestSync } from "./shell";
import { HomePlan } from "./home-plan";

type Overview = Awaited<ReturnType<typeof overview>>;

export function Empty() {
  return (
    <div className={`${card} p-8 text-center`}>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Wallet className="h-6 w-6" /></span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Conecta tus bancos para empezar</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Con acceso de solo lectura a Santander, BBVA y Revolut, CRS Finance guarda tus movimientos, entiende cada uno y te dice cómo vas. También puedes importar extractos en CSV, Excel o PDF.
      </p>
      <Link href="/finanzas/cuentas" className={`${primary} mt-5`}>Conectar un banco <ArrowRight className="h-4 w-4" /></Link>
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
  const v = data.cycleView;
  const review = data.pendingReview;

  return (
    <div className="space-y-4 pb-6">
      <>
      {/* Lo pendiente, arriba y con acción directa */}
      {review > 0 && (
        <Link href="/finanzas/movimientos?revisar=1" className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 hover:bg-blue-50">
          <Info className="h-4 w-4 shrink-0 text-blue-600" />
          <span className="flex-1"><b>{review}</b> {review === 1 ? "movimiento" : "movimientos"} sin entender del todo: revísalos y la app aprende.</span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      {/* El gasto del mes y cómo vas en cada grupo */}
      <HomePlan />

      <Alerts alerts={data.alerts} />

      <Link href="/finanzas/cuentas" className={`${card} ${flat} flex items-center gap-3 p-4`}>
        <Landmark className="h-5 w-5 shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">Tus cuentas <span className="font-normal text-slate-500">({v.accounts.length})</span></span>
        <span className="amount text-sm font-semibold tabular-nums text-slate-900">{v.balance === null ? "—" : eur(v.balance, 2)}</span>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
      </Link>

      {data.syncDue && (
        <p className="text-center text-xs text-slate-400">
          <button type="button" className="hover:underline" onClick={() => { requestSync(); refreshFinance(); }}>Actualizar con los bancos</button>
        </p>
      )}
      </>
    </div>
  );
}
