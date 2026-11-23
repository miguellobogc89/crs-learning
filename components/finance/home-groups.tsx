"use client";
// Inicio · «Tus grupos»: cómo va cada grupo de Mi plan en el ciclo. Por grupo: lo gastado frente al objetivo, una
// marca con lo que sueles llevar gastado a estas alturas, la comparación con tu media y los últimos 7 ciclos.
// Todo sale de `groupSummary` (cálculo determinista). Al tocar un grupo se abre desplegado en Mi plan.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { categoryHex } from "@/lib/finance/categories";
import { groupSummary, type GroupCycleTotals, type GroupStatus } from "@/lib/finance/plan";
import { card, eur, flat } from "@/components/trading/format";
import { useFinance } from "./api";
import { CategoryIcon } from "./category-icon";

type Plan = {
  hasData: boolean;
  cycle: { start: string; end: string; label: string; day: number; totalDays: number };
  groups: { id: string; name: string; categories: string[]; goal: number | null }[];
  history?: GroupCycleTotals[];
};
type Summary = ReturnType<typeof groupSummary>;

const STATUS: Record<GroupStatus, { text: string; tone: string; fill?: string }> = {
  bien: { text: "Vas bien", tone: "text-emerald-700" },
  atento: { text: "Por encima de tu ritmo", tone: "text-amber-700", fill: "#d97706" },
  superado: { text: "Objetivo superado", tone: "text-rose-700", fill: "#e11d48" },
};

const money = (v: number) => eur(v, Math.abs(v) >= 100 ? 0 : 2);

/** Los últimos ciclos en barras finas; la del ciclo actual, en el color del grupo. La línea discontinua es el objetivo. */
function Trend({ values, goal, color }: { values: number[]; goal: number | null; color: string }) {
  const W = 88, H = 40, gap = 3;
  const n = Math.max(values.length, 1);
  const bw = (W - gap * (n - 1)) / n;
  const top = Math.max(...values, goal ?? 0, 1);
  const y = (v: number) => H - (v / top) * (H - 2);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 overflow-visible" aria-hidden="true">
      {values.map((v, i) => {
        const current = i === values.length - 1;
        const h = Math.max(v > 0 ? 2 : 1, H - y(v));
        return <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={1.5} fill={current ? color : "#e2e8f0"} />;
      })}
      {goal !== null && goal > 0 && <line x1={-2} x2={W + 2} y1={y(goal)} y2={y(goal)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />}
    </svg>
  );
}

function Icons({ categories }: { categories: string[] }) {
  const shown = categories.slice(0, 3);
  return (
    <span className="flex shrink-0 -space-x-2.5" aria-hidden="true">
      {shown.map((c) => <span key={c} className="rounded-full bg-white ring-2 ring-white"><CategoryIcon category={c} /></span>)}
    </span>
  );
}

function comparison(s: Summary) {
  if (s.vsAvg === null) return null;
  const d = Math.round(s.vsAvg);
  if (Math.abs(d) < 1) return { text: "Igual que tu media a estas alturas", tone: "text-slate-500" };
  return d < 0
    ? { text: `${money(-d)} menos que tu media a estas alturas`, tone: "text-emerald-700" }
    : { text: `${money(d)} más que tu media a estas alturas`, tone: "text-amber-700" };
}

function GroupRow({ group, s }: { group: Plan["groups"][number]; s: Summary }) {
  const color = categoryHex(group.categories[0] ?? "otros_gastos");
  const st = s.status ? STATUS[s.status] : null;
  const pct = s.goal ? Math.min(100, (s.now / s.goal) * 100) : 0;
  const tick = s.goal && s.expected !== null ? Math.min(100, (s.expected / s.goal) * 100) : null;
  const cmp = comparison(s);
  const open = () => { try { window.sessionStorage.setItem("crs-finance:plan-open", group.id); } catch { /* sin almacenamiento */ } };
  return (
    <li>
      <Link href="/finanzas/plan" onClick={open} className="group flex gap-3 py-4 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500">
        <Icons categories={group.categories} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-semibold text-slate-900">{group.name}</span>
            <span className="shrink-0 text-right">
              <b className="amount text-[17px] font-semibold tabular-nums tracking-tight text-slate-900">{money(s.now)}</b>
              {s.goal !== null && <span className="amount text-xs tabular-nums text-slate-400"> de {money(s.goal)}</span>}
            </span>
          </span>

          {s.goal !== null ? (
            <span className="relative mt-2.5 block h-1.5 rounded-full bg-slate-100">
              <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${pct}%`, backgroundColor: st?.fill ?? color }} />
              {tick !== null && tick > 0 && tick < 100 && (
                <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-slate-900/70" style={{ left: `${tick}%` }}
                  title={`Lo que sueles llevar a estas alturas: ${money(s.expected ?? 0)}`} />
              )}
            </span>
          ) : (
            <span className="mt-1 block text-xs text-slate-400">Sin objetivo. Ponle uno en Mi plan.</span>
          )}

          <span className="mt-2.5 flex items-end justify-between gap-3">
            <span className="min-w-0 space-y-0.5 text-xs leading-snug">
              {st && (
                <span className={`block font-medium ${st.tone}`}>
                  {st.text}
                  {s.left !== null && s.left > 0 && <span className="amount font-normal text-slate-500">, te quedan {money(s.left)}</span>}
                  {s.left !== null && s.left < 0 && <span className="amount font-normal text-slate-500"> por {money(-s.left)}</span>}
                </span>
              )}
              {cmp && <span className={`amount block ${cmp.tone}`}>{cmp.text}</span>}
              {s.saved3 !== null && Math.abs(s.saved3) >= 1 && (
                <span className="amount block text-slate-500">
                  {s.saved3 > 0 ? `En los últimos 3 ciclos, ${money(s.saved3)} menos que en los 3 anteriores` : `En los últimos 3 ciclos, ${money(-s.saved3)} más que en los 3 anteriores`}
                </span>
              )}
            </span>
            {s.trend.length > 1 && <Trend values={s.trend} goal={s.goal} color={st?.fill ?? color} />}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function HomeGroups() {
  const { data } = useFinance<Plan>("plan");
  if (!data) return (
    <section className={`${card} ${flat} p-4 sm:p-5`} aria-busy="true">
      <div className="h-5 w-32 animate-pulse rounded bg-slate-100" />
      {[0, 1, 2].map((i) => <div key={i} className="mt-5 h-14 animate-pulse rounded-xl bg-slate-50" />)}
    </section>
  );
  const groups = data.groups.filter((g) => g.categories.length);
  if (!data.hasData || !groups.length || !data.history?.length) return null;
  const { day, totalDays } = data.cycle;
  const left = totalDays - day;
  return (
    <section className={`${card} ${flat} px-4 pt-4 sm:px-5 sm:pt-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Tus grupos</h2>
          <p className="mt-0.5 text-xs text-slate-500">Día {day} de {totalDays} del ciclo{left > 0 ? `, quedan ${left} ${left === 1 ? "día" : "días"}` : ""}</p>
        </div>
        <Link href="/finanzas/plan" className="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-1 py-1 text-sm font-medium text-blue-700 hover:underline">
          Mi plan<ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <ul className="mt-1 divide-y divide-slate-100 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:divide-y-0 lg:[&>li]:border-t lg:[&>li]:border-slate-100">
        {groups.map((g) => (
          <GroupRow key={g.id} group={g} s={groupSummary({ categories: g.categories, cycles: data.history ?? [], goal: g.goal, day, totalDays })} />
        ))}
      </ul>
    </section>
  );
}
