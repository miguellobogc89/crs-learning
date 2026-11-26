"use client";
// Inicio · «Te quedan» (25/11/2026, nació en el laboratorio). Medio aro con lo que cobras en el ciclo (de nómina a nómina) repartido en
// comprometido, gastado (con los extraordinarios), libre y ahorro; por fuera, un arco fino con lo que tenías al
// empezar, que se pinta de rojo si te pasas y tiras de él. En el centro, solo «Te quedan X €» (color según cómo vas)
// y una línea; debajo, una frase con tu situación y tres bloques desplegables: Comprometido, Gastado y Ahorro.
// «Comprometido» ya no se adivina: son los grupos y categorías que tú metes en él (lo que se paga cada mes); se
// guarda de verdad (la marca de los grupos y las categorías de ajustes). Se desliza entre ciclos con imán.
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, CreditCard, Euro, Loader2, Pencil, PiggyBank } from "lucide-react";
import { createPortal } from "react-dom";
import type { planView } from "@/lib/finance/service";
import { SELECTABLE_CATEGORIES, categoryHex, categoryLabel } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useRouter } from "next/navigation";
import { fapi, refreshFinance, useFinance } from "./api";
import { GroupsList, type ListProps } from "./home-plan";
import { SavingsGoalSheet, type MonthSaving } from "./savings-goal-sheet";
import Link from "next/link";
import { CategoryIcon } from "./category-icon";
import { useMonthSwipe } from "./use-month-swipe";
import { MerchantLogo, useResolveLogos } from "./merchant-logo";

type Plan = Awaited<ReturnType<typeof planView>>;
type Kind = "prev" | "cur" | "next";
type Debt = { id: string; title: string; amount: number; category: string; paidOn: string; consumedOn: string; paidCycle: string; consumedCycle: string };
type Tab = "i" | "g" | "a";
type Cycle = { incomeByCat?: Record<string, number>; label: string; start?: string; planned?: Record<string, number>; debts?: Debt[]; consumed?: Debt[]; income: number; fixed: number; spent: number; carry: number | null; byCat: Record<string, number>; pending: Record<string, number> };

// Paleta armónica con el azul de la app (#3478f6).
const C = { fixed: "#9aaccb", spent: "#f59f8b", free: "#4cc38a", saving: "#3478f6", over: "#dc2626", track: "#b9d2fd" };
const cx = 160, cy = 168, R = 118, W = 26, RO = R + W / 2 + 9;
const pt = (r: number, f: number) => { const a = Math.PI * (1 - f); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
const arc = (r: number, f0: number, f1: number) => {
  const [x0, y0] = pt(r, f0), [x1, y1] = pt(r, f1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
const OTHER_CATS = ["otros_gastos", "sin_clasificar"];
const REST_COLOR = "#e8c3b9";
/** Nombre del mes (de nómina) que empieza en «start»: el mes en que se vive, el de su final (del 25 de noviembre
 * al 24 de diciembre es «diciembre»). Si el ciclo empieza a principios de mes, es ese mismo mes. */
const monthOf = (start?: string) => {
  if (!start) return "";
  const d = new Date(`${start.slice(0, 7)}-15T12:00:00Z`);
  if (Number(start.slice(8, 10)) > 15) d.setUTCMonth(d.getUTCMonth() + 1);
  const t = d.toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
type Seg = [number, string];
/** Dibuja tramos seguidos sobre el arco grande, cada uno en proporción a «total». */
const drawArc = (segs: Seg[], total: number) => {
  let f = 0;
  return segs.filter(([v]) => v > 0).map(([v, c], i) => {
    const f1 = Math.min(1, f + v / total);
    const d = arc(R, f + 0.003, Math.max(f + 0.004, f1 - 0.003));
    f = f1;
    return <path key={i} d={d} fill="none" stroke={c} strokeWidth={W} />;
  });
};
const SPEND_CATS = SELECTABLE_CATEGORIES.filter((c) => c.kind === "gasto");
const sum = (o: Record<string, number>, keys: Iterable<string>) => { let t = 0; for (const k of keys) t += o[k] ?? 0; return t; };

/**
 * El color de «Te quedan» no mide el ritmo, sino la holgura: lo que queda (con todo lo previsto ya restado) por día
 * que falta, frente a lo que sueles gastar al día. Por encima, mes de holgura (verde); por debajo, mes de ajustarse
 * (ámbar); en negativo, te has pasado (rojo). Así un mes puede empezar en ámbar, y 60 € el último día es verde.
 */
function stateOf(m: Cycle, saving: number, kind: Kind, day: number, days: number, usualPerDay: number) {
  const income = Math.max(0, m.income);
  const left = income - m.fixed - m.spent - saving;
  const over = Math.max(0, -left);
  const ateSaving = Math.min(saving, over);
  const fromCarry = Math.max(0, over - saving);
  const budget = Math.max(0, income - m.fixed - saving);
  const expected = kind === "cur" ? (budget * day) / days : budget;
  const daysLeft = kind === "cur" ? Math.max(1, days - day + 1) : days;
  const perDay = left / daysLeft;
  const pace = left < 0 ? "mal" : kind === "prev" ? "bien" : usualPerDay > 0 && perDay < usualPerDay ? "atento" : "bien";
  return { income, left, over, ateSaving, fromCarry, budget, expected, pace };
}

type Ctx = { plan: Plan; committed: Set<string>; groupsOn: Set<string>; catsOn: Set<string>; toggleGroup: (id: string) => void; toggleCat: (c: string) => void; busy: boolean; list: Omit<ListProps, "plan">;
  blocks: Record<string, boolean>; toggleBlock: (key: string, el?: HTMLElement) => void; colorOf: (groupId: string) => string | undefined; editSaving: (m: MonthSaving) => void; fixedSaving: number | null; savingsByMonth: Record<string, number>; goTo: (i: number) => void; usualPerDay: number; tab: Tab; setTab: (t: Tab) => void };

function Block({ color, title, amount, children, danger = false, open, onToggle }: { color: string; title: string; amount: number; children: ReactNode; danger?: boolean; open: boolean; onToggle: (el: HTMLElement) => void }) {
  return (
    <li>
      <button type="button" onClick={(e) => onToggle(e.currentTarget)} aria-expanded={open} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color }} />
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-slate-900">{title}</span>
        <b className={`amount shrink-0 text-[15px] font-semibold tabular-nums ${danger ? "text-rose-700" : "text-slate-900"}`}>{eur(amount, 0)}</b>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden" inert={!open}><div className="pb-3">{children}</div></div>
      </div>
    </li>
  );
}

/** Una deuda: en Comprometido del mes en que se pagó, o en gris (sin sumar) en el mes en que se consumió. */
function DebtRow({ d, sub, muted = false }: { d: Debt; sub: string; muted?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className={muted ? "opacity-50 grayscale" : ""}><CategoryIcon category={d.category} /></span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] font-semibold ${muted ? "text-slate-500" : "text-slate-900"}`}>{d.title}</span>
        <span className="block truncate text-xs text-slate-500">{sub}</span>
      </span>
      <b className={`amount shrink-0 text-[15px] font-semibold tabular-nums ${muted ? "text-slate-400" : "text-slate-900"}`}>{eur(d.amount, 0)}</b>
    </li>
  );
}

function Line({ icon, label, amount, sub }: { icon?: string; label: string; amount: number; sub?: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      {icon && <span className="scale-75"><CategoryIcon category={icon} /></span>}
      <span className="min-w-0 flex-1"><span className="block truncate text-sm text-slate-700">{label}</span>{sub && <span className="block text-xs text-blue-700">{sub}</span>}</span>
      <span className="amount shrink-0 text-sm tabular-nums text-slate-900">{eur(amount, 0)}</span>
    </div>
  );
}

/** Elegir qué es comprometido: primero tus grupos, debajo las categorías (las de un grupo marcado ya cuentan). */
function CommittedPicker({ x }: { x: Ctx }) {
  const inGroup = new Map<string, string>();
  for (const g of x.plan.groups) if (x.groupsOn.has(g.id)) for (const c of g.categories) inGroup.set(c, g.name);
  return (
    <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2">
      <p className="pt-1 text-xs font-medium text-slate-500">Grupos</p>
      {x.plan.groups.filter((g) => g.categories.length).map((g) => (
        <label key={g.id} className="flex items-center gap-3 py-1.5">
          <input type="checkbox" checked={x.groupsOn.has(g.id)} disabled={x.busy} onChange={() => x.toggleGroup(g.id)} className="h-4 w-4 accent-blue-600" />
          <span className="text-sm text-slate-800">{g.name}</span>
        </label>
      ))}
      <p className="pt-3 text-xs font-medium text-slate-500">Categorías</p>
      {SPEND_CATS.map((c) => {
        const g = inGroup.get(c.key);
        return (
          <label key={c.key} className={`flex items-center gap-3 py-1.5 ${g ? "opacity-60" : ""}`}>
            <input type="checkbox" checked={!!g || x.catsOn.has(c.key)} disabled={!!g || x.busy} onChange={() => x.toggleCat(c.key)} className="h-4 w-4 accent-blue-600" />
            <span className="text-sm text-slate-800">{c.label}</span>
            {g && <span className="text-xs text-slate-400">en {g}</span>}
          </label>
        );
      })}
    </div>
  );
}

/** Un mes: «arc» es el aro (lo que se desliza); «detail», el desglose de debajo (cambia con un fundido). */
function Gauge({ m, saving, kind, day, days, waiting, x, part }: { m: Cycle; saving: number; kind: Kind; day: number; days: number; waiting: boolean; x: Ctx; part: "arc" | "detail" }) {
  const [editing, setEditing] = useState(false);
  const s = stateOf(m, saving, kind, day, days, x.usualPerDay);
  const isCur = kind === "cur";
  const total = Math.max(1, s.income);
  // Bloque abierto (uno a la vez): el aro pasa a mostrar solo ese bloque, repartido por sus grupos.
  // Con la pestaña Gastado, el bloque abierto (uno a la vez) muestra solo lo suyo en el aro; las otras no lo tocan.
  const focus = x.tab !== "g" ? null : (["c", "g"] as const).find((b) => x.blocks[`${kind}:${b}`]) ?? null;
  const groupsOn = x.plan.groups.filter((g) => x.groupsOn.has(g.id));
  const loneCats = [...x.catsOn].filter((c) => !groupsOn.some((g) => g.categories.includes(c)));
  const pendingOf = (cats: string[]) => sum(m.pending, cats);
  const spendGroups = x.plan.groups.filter((g) => !x.groupsOn.has(g.id) && g.categories.length);
  const grouped = new Set(x.plan.groups.flatMap((g) => g.categories));
  // Lo gastado de cada categoría, con lo previsto de este ciclo.
  const spentByCat: Record<string, number> = { ...m.byCat };
  for (const [c, v] of Object.entries(m.planned ?? {})) spentByCat[c] = (spentByCat[c] ?? 0) + v;
  const spentSegs: Seg[] = [
    ...spendGroups.map((g) => [sum(spentByCat, g.categories.filter((c) => !x.committed.has(c))), x.colorOf(g.id) ?? C.spent] as Seg),
    ...Object.keys(spentByCat).filter((c) => !grouped.has(c) && !x.committed.has(c) && !OTHER_CATS.includes(c)).map((c) => [spentByCat[c] ?? 0, x.colorOf(`cat:${c}`) ?? C.spent] as Seg),
  ].filter(([v]) => v > 0);
  spentSegs.push([Math.max(0, m.spent - spentSegs.reduce((t, [v]) => t + v, 0)), REST_COLOR]);
  const fixedSegs: Seg[] = [
    ...groupsOn.map((g) => [sum(m.byCat, g.categories) + pendingOf(g.categories), x.colorOf(g.id) ?? C.fixed] as Seg),
    ...loneCats.map((c) => [(m.byCat[c] ?? 0) + (m.pending[c] ?? 0), x.colorOf(`cat:${c}`) ?? C.fixed] as Seg),
    ...(m.debts ?? []).map((d) => [d.amount, x.colorOf(`cat:${d.category}`) ?? C.fixed] as Seg),
  ].filter(([v]) => v > 0);
  fixedSegs.push([Math.max(0, m.fixed - fixedSegs.reduce((t, [v]) => t + v, 0)), C.fixed]);
  const savedLeft = saving - s.ateSaving - s.fromCarry;
  const savingSegs: Seg[] = [[saving - s.ateSaving, C.saving], [s.ateSaving, C.over], [s.fromCarry, "#991b1b"]];

  const room = s.left >= 0 ? m.spent : Math.max(0, total - m.fixed - (saving - s.ateSaving));
  const segs: Seg[] = s.left >= 0
    ? [[m.fixed, C.fixed], [m.spent, C.spent], [s.left, C.free], [saving, C.saving]]
    : [[Math.min(m.fixed, total), C.fixed], [room, C.spent], [saving - s.ateSaving, C.saving]];
  const paths = drawArc(segs, total);
  const focusArc = focus === "c" ? drawArc(fixedSegs, Math.max(1, m.fixed)) : focus === "g" ? drawArc(spentSegs, Math.max(1, m.spent))
    : null;
  const pct = (v: number) => (s.income > 0 ? `${Math.round((v / s.income) * 100)} % de lo que cobras` : "");
  const focusText = focus === "c" ? { t: "Comprometido", v: m.fixed, sub: pct(m.fixed), col: "#0f172a" }
    : focus === "g" ? { t: kind === "cur" ? "Gastado y previsto" : "Gastado", v: m.spent, sub: pct(m.spent), col: "#0f172a" }
    : null;
  const carry = m.carry ?? 0;
  const carryFrac = carry > 0 && s.fromCarry > 0 ? Math.min(1, s.fromCarry / carry) : 0;
  const daysLeft = Math.max(1, days - day + 1);
  const big = kind === "next" ? Math.max(0, s.left) : Math.abs(s.left);
  const tone = s.pace === "mal" ? "#b91c1c" : s.pace === "atento" ? "#b45309" : "#15803d";
  const title = kind === "next" ? "Tendrías para gastar" : kind === "prev" ? (s.left >= 0 ? "Te sobró" : "Te pasaste") : s.left >= 0 ? "Te quedan" : "Te has pasado";
  const sub = isCur && s.left > 0 ? `unos ${eur(s.left / daysLeft, 0)} al día` : kind === "next" ? `ahorrando ${eur(saving, 0)}` : s.left < 0 ? (s.fromCarry > 0 ? "tirando de lo que tenías" : "sin ahorro este mes") : `y ahorraste ${eur(saving, 0)}`;

  // Desglose: comprometido por sus grupos y categorías; gastado por el resto de grupos y lo que va sin grupo.
  const otherGroups = x.plan.groups.filter((g) => !x.groupsOn.has(g.id) && g.categories.length);
  const inOther = new Set(otherGroups.flatMap((g) => g.categories));
  const looseSpent = Math.max(0, m.spent - sum(m.byCat, [...inOther].filter((c) => !x.committed.has(c))));

  const custom = !!m.start && x.savingsByMonth[m.start] !== undefined;
  const fade = (on: boolean) => ({ opacity: on ? 1 : 0, transition: "opacity 250ms ease-out" });
  const name = monthOf(m.start);
  // Lo que queda del mes tras todo lo gastado (con tu ahorro dentro); si es negativo, lo sacaste de lo que tenías.
  const net = Math.round(s.income - m.fixed - m.spent);
  // Ahorro del resumen: en un mes cerrado, el resultado real; en este y el próximo, el ahorro previsto (tu objetivo,
  // menos lo que te hayas comido), igual que en la pestaña Ahorro.
  const shownSaving = kind === "prev" ? net : Math.round(saving - s.ateSaving - s.fromCarry);
  const monthLow = (name || m.label).toLowerCase();
  return (
    part === "arc" ? (
    <div>
      <svg viewBox="0 0 320 180" className="block h-auto w-full" role="img" aria-label={focusText ? `${focusText.t} ${eur(focusText.v, 0)}` : `${title} ${eur(big, 0)}`}>
        <g style={fade(!focus)}>
          {paths}
          {kind !== "next" && carry > 0 && <path d={arc(RO, 0, 1)} fill="none" stroke={C.track} strokeWidth={6} />}
          {carryFrac > 0 && <path d={arc(RO, 1 - carryFrac, 1)} fill="none" stroke={C.over} strokeWidth={6} />}
          <text x={cx} y={cy - 46} textAnchor="middle" fontSize="13" fill="#64748b">{title}</text>
          <text x={cx} y={cy - 14} textAnchor="middle" fontSize="32" fontWeight="600" fill={tone}>{eur(big, 0)}</text>
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize="13" fill="#64748b">{sub}</text>
        </g>
        <g style={fade(!!focus)}>
          {focusArc}
          {focusText && <>
            <text x={cx} y={cy - 46} textAnchor="middle" fontSize="13" fill="#64748b">{focusText.t}</text>
            <text x={cx} y={cy - 14} textAnchor="middle" fontSize="32" fontWeight="600" fill={focusText.col}>{eur(focusText.v, 0)}</text>
            <text x={cx} y={cy + 8} textAnchor="middle" fontSize="13" fill="#64748b">{focusText.sub}</text>
          </>}
        </g>
      </svg>
      {/* Resumen del mes: lo que entra, lo que sale y lo que queda (+) o lo que has sacado de lo que tenías (−). */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {([
          { tab: "i", icon: Euro, label: kind === "next" ? "Ingreso estimado" : "Ingreso", v: eur(s.income, 0), bg: "#e7f6ee", fg: "#15803d", col: "text-slate-900" },
          { tab: "g", icon: CreditCard, label: kind === "next" ? "Comprometido" : "Gastado", v: eur(m.fixed + m.spent, 0), bg: "#fdece8", fg: "#c2410c", col: "text-slate-900" },
          { tab: "a", icon: PiggyBank, label: shownSaving >= 0 ? "Ahorro" : "De reservas", v: `${shownSaving >= 0 ? "+" : "−"}${eur(Math.abs(shownSaving), 0)}`, bg: shownSaving >= 0 ? "#e8f0fe" : "#fde8e8", fg: shownSaving >= 0 ? "#3478f6" : "#b91c1c", col: shownSaving >= 0 ? "text-[#3478f6]" : "text-rose-700" },
        ] as const).map(({ tab, icon: Icon, label, v, bg, fg, col }) => {
          const on = x.tab === tab;
          return (
            <button key={tab} type="button" onClick={() => x.setTab(tab)} aria-pressed={on}
              className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${on ? "bg-slate-100" : "active:bg-slate-50"}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-shadow ${on ? "ring-2 ring-offset-1" : ""}`} style={{ background: bg, ["--tw-ring-color" as string]: fg }} aria-hidden="true"><Icon className="h-4 w-4" style={{ color: fg }} /></span>
              <span className={`text-xs ${on ? "font-semibold text-slate-700" : "text-slate-500"}`}>{label}</span>
              <b className={`amount text-[15px] font-semibold tabular-nums ${col}`}>{v}</b>
            </button>
          );
        })}
      </div>
    </div>
    ) : (
    <div>
      {waiting && <p className="amount mb-2 text-center text-sm text-slate-600">Tu nómina de este mes aún no ha entrado: cuento con lo que sueles cobrar ({eur(s.income, 0)}).</p>}

      {x.tab === "i" && (
        <div className="border-t border-slate-100 pt-1">
          {kind === "next" ? (
            <p className="py-3 text-sm text-slate-600">Cuento con lo que sueles cobrar: {eur(s.income, 0)}. Cuando entre, verás aquí de dónde viene.</p>
          ) : Object.keys(m.incomeByCat ?? {}).length ? (
            <ul className="divide-y divide-slate-100">
              {Object.entries(m.incomeByCat ?? {}).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
                <li key={c} className="flex items-center gap-3 py-3">
                  <CategoryIcon category={c} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900">{categoryLabel(c)}</span>
                  <b className="amount shrink-0 text-[15px] font-semibold tabular-nums text-slate-900">{eur(v, 0)}</b>
                </li>
              ))}
            </ul>
          ) : <p className="py-3 text-sm text-slate-500">Aún no ha entrado nada este mes.</p>}
        </div>
      )}
      {x.tab === "a" && (
        <div className="border-t border-slate-100 pt-2">
          <p className="py-1 text-sm text-slate-600">
            {x.fixedSaving === null && !custom ? "Aún no tienes un ahorro fijo al mes." : <>
              {kind === "prev" ? "Querías" : "Quieres"} ahorrar {eur(saving, 0)} en {monthLow}.
              {custom && x.fixedSaving !== null && saving !== x.fixedSaving && ` Son ${eur(Math.abs(saving - x.fixedSaving), 0)} ${saving > x.fixedSaving ? "más" : "menos"} que tu ahorro fijo (${eur(x.fixedSaving, 0)}).`}
              {" "}{s.ateSaving > 0 ? `Te has comido ${eur(s.ateSaving, 0)}.` : kind === "next" ? "" : "Intacto."}
            </>}
            {s.fromCarry > 0 && ` Y te has comido ${eur(s.fromCarry, 0)} de lo que tenías ahorrado de antes${carry > 0 ? ` (${Math.round(carryFrac * 100)} % de ${eur(carry, 0)})` : ""}.`}
            {kind !== "next" && carry > 0 && s.fromCarry <= 0 && ` Al empezar tenías ${eur(carry, 0)}.`}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-5">
            {x.fixedSaving === null && <Link href="/finanzas/plan" className="py-1 text-sm font-semibold text-blue-700">Fija un ahorro mensual</Link>}
            {m.start && (
              <button type="button" onClick={() => x.editSaving({ start: m.start!, name: name || m.label, fixed: x.fixedSaving, custom })} className="inline-flex items-center gap-1.5 py-1 text-sm font-semibold text-blue-700">
                <Pencil className="h-3.5 w-3.5" />Cambiar solo {kind === "cur" ? "este mes" : monthLow}
              </button>
            )}
          </div>
        </div>
      )}
      {x.tab === "g" && <ul className="divide-y divide-slate-100 border-t border-slate-100">
        <Block color={C.fixed} title="Comprometido" amount={m.fixed} open={focus === "c"} onToggle={(el) => x.toggleBlock(`${kind}:c`, el)}>
          {!groupsOn.length && !loneCats.length && !m.debts?.length && <p className="py-1 text-sm text-slate-500">Todavía no hay gastos asignados. Añade los que se pagan cada mes: hipoteca, recibos, préstamos, suscripciones…</p>}
          {(groupsOn.length > 0 || loneCats.length > 0) && (
            <GroupsList plan={x.plan as never} mode={kind === "next" ? "next" : kind === "prev" ? "prev" : "now"} {...x.list} section={{ kind: "committed", groupIds: x.groupsOn, cats: x.catsOn }} />
          )}
          {!!m.debts?.length && (
            <>
              <h3 className="mt-3 text-sm font-medium text-slate-500">Deudas</h3>
              <ul className="divide-y divide-slate-100">
                {m.debts.map((d) => <DebtRow key={d.id} d={d} sub={`${categoryLabel(d.category)} de ${monthOf(d.consumedCycle).toLowerCase()}`} />)}
              </ul>
            </>
          )}
          <button type="button" onClick={() => setEditing((e) => !e)} className="mt-1 inline-flex items-center gap-1.5 py-1 text-sm font-semibold text-blue-700">
            {x.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{editing ? "Listo" : groupsOn.length || loneCats.length ? "Añadir o quitar" : "Añadir"}
          </button>
          {editing && <CommittedPicker x={x} />}
        </Block>
        <Block color={C.spent} title={kind === "cur" ? "Gastado y previsto" : "Gastado"} amount={m.spent} open={focus === "g"} onToggle={(el) => x.toggleBlock(`${kind}:g`, el)}>
          <GroupsList plan={x.plan as never} mode={kind === "next" ? "next" : kind === "prev" ? "prev" : "now"} {...x.list} section={{ kind: "spent", groupIds: x.groupsOn, cats: x.committed }} />
          {m.spent <= 0 && kind !== "next" && <p className="py-1 text-sm text-slate-500">Nada todavía.</p>}
          {!!m.consumed?.length && (
            <>
              <h3 className="mt-3 text-sm font-medium text-slate-500">Pagado en otro mes</h3>
              <ul className="divide-y divide-slate-100">
                {m.consumed.map((d) => <DebtRow key={d.id} d={d} muted sub={`${categoryLabel(d.category)} · pagado en ${monthOf(d.paidCycle).toLowerCase()}, no suma aquí`} />)}
              </ul>
            </>
          )}
        </Block>
      </ul>}
      {kind !== "prev" && <Upcoming kind={kind} plan={x.plan} />}
    </div>
    )
  );
}

/**
 * Próximos cobros, debajo de todo. Este mes: los 3 siguientes que faltan por cobrar (lo que se repite y tus
 * previstos), aunque queden semanas. El que viene: solo lo que no es de cada mes (el agua cada dos, un seguro anual).
 */
function Upcoming({ kind, plan }: { kind: Kind; plan: Plan }) {
  type U = { id: string; title: string; amount: number; date: string; category: string; logo?: string | null };
  const today = new Date().toISOString().slice(0, 10);
  const list: U[] = kind === "cur"
    ? [...(plan.pending ?? []), ...(plan.planned ?? []).filter((p) => p.date >= today && p.date <= plan.cycle.end)]
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3)
    : (plan.next?.items ?? []).filter((i) => i.source === "previsto" || ("frequency" in i && i.frequency && i.frequency !== "mensual"))
      .sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return null;
  const when = (d: string) => {
    if (d <= today) return "Hoy";
    const days = Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
    if (days === 1) return "Mañana";
    const dt = new Date(`${d}T12:00:00Z`);
    const txt = days < 7 ? dt.toLocaleDateString("es-ES", { weekday: "long", timeZone: "UTC" }) : dt.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  };
  return (
    <section className="mt-5 border-t border-slate-100 pt-3">
      <h3 className="text-sm font-medium text-slate-500">{kind === "cur" ? "Próximos cobros" : "Cobros que no son de cada mes"}</h3>
      <ul className="mt-1 divide-y divide-slate-100">
        {list.map((u) => (
          <li key={u.id} className="flex items-center gap-3 py-3">
            <MerchantLogo domain={u.logo} category={u.category} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-slate-900">{u.title}</span>
              <span className="block truncate text-xs text-slate-500">{when(u.date)}</span>
            </span>
            <b className="amount shrink-0 text-[15px] font-semibold tabular-nums text-slate-900">{eur(u.amount, 2)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Lo que Inicio recuerda en esta sesión al ir a una hoja y volver: el ciclo que se miraba, lo desplegado y el scroll.
const KEY = { tab: "crs-finance:quedan-tab", page: "crs-finance:quedan-page", open: "crs-finance:quedan-open", blocks: "crs-finance:quedan-blocks", scroll: "crs-finance:quedan-scroll" };
const store = {
  get: (k: string) => { try { return window.sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) window.sessionStorage.removeItem(k); else window.sessionStorage.setItem(k, v); } catch { /* ignorar */ } },
};
const scroller = () => document.querySelector<HTMLElement>("main");
/** Mientras algo se abre o se cierra, deja quieto lo que has tocado: solo se mueve lo de debajo. */
function keepInPlace(el: HTMLElement | null | undefined) {
  const m = scroller();
  if (!el || !m) return;
  const top = el.getBoundingClientRect().top;
  const end = performance.now() + 380;
  const step = () => {
    const d = el.getBoundingClientRect().top - top;
    if (Math.abs(d) > 0.5) m.scrollTop += d;
    if (performance.now() < end) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function LeftToSpend() {
  const { data, error } = useFinance<Plan>("plan");
  const router = useRouter();
  useResolveLogos();
  const [page, setPage] = useState(1);
  // Pestaña de debajo del aro (Ingreso, Gastado o Ahorro): cambia el contenido con un fundido; el aro no cambia.
  const [tab, setTab] = useState<Tab>("g");
  const [tabShown, setTabShown] = useState<Tab>("g");
  useEffect(() => { if (tab === tabShown) return; const t = window.setTimeout(() => setTabShown(tab), 140); return () => window.clearTimeout(t); }, [tab, tabShown]);
  // El nombre del mes que miras va en la cabecera de la app, en lugar de «Inicio».
  const [headerMonth, setHeaderMonth] = useState<HTMLElement | null>(null);
  useEffect(() => { setHeaderMonth(document.getElementById("finance-header-month")); }, []);
  const swipe = useMonthSwipe(page, setPage, 3, !!data);
  const shown = swipe.shown;
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Record<string, boolean>>({});
  const [restored, setRestored] = useState(false);
  const [editSaving, setEditSaving] = useState<MonthSaving | null>(null);
  const [groupsOn, setGroupsOn] = useState<Set<string>>(new Set());
  const [catsOn, setCatsOn] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    setGroupsOn(new Set(data.groups.filter((g) => g.fixed).map((g) => g.id)));
    setCatsOn(new Set(data.committedCategories ?? []));
  }, [data]);
  // Al volver de una hoja, en este orden: el ciclo que se miraba, lo desplegado y, con todo pintado, el scroll.
  useEffect(() => {
    if (!data || restored) return;
    const p = Math.min(2, Math.max(0, Number(store.get(KEY.page) ?? 1)));
    swipe.jumpTo(p);
    const tb = store.get(KEY.tab);
    if (tb === "i" || tb === "g" || tb === "a") { setTab(tb); setTabShown(tb); }
    setOpenId(store.get(KEY.open));
    try { setBlocks(JSON.parse(store.get(KEY.blocks) ?? "{}")); } catch { /* ignorar */ }
    setRestored(true);
    const y = Number(store.get(KEY.scroll));
    store.set(KEY.scroll, null);
    if (y > 0) requestAnimationFrame(() => requestAnimationFrame(() => { const m = scroller(); if (m) m.scrollTop = y; }));
  }, [data, restored]);
  useEffect(() => { if (restored) store.set(KEY.page, String(page)); }, [page, restored]);
  useEffect(() => { if (restored) store.set(KEY.open, openId); }, [openId, restored]);
  useEffect(() => { if (restored) store.set(KEY.blocks, JSON.stringify(blocks)); }, [blocks, restored]);
  useEffect(() => { if (restored) store.set(KEY.tab, tab); }, [tab, restored]);
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={5} />;

  const save = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); refreshFinance(); } finally { setBusy(false); } };
  const toggleGroup = (id: string) => {
    const on = !groupsOn.has(id);
    setGroupsOn((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
    void save(() => fapi("plan/group/fixed", { id, fixed: on }));
  };
  const toggleCat = (c: string) => {
    const n = new Set(catsOn); if (n.has(c)) n.delete(c); else n.add(c);
    setCatsOn(n);
    void save(() => fapi("settings", { committedCategories: [...n] }));
  };
  const committed = new Set<string>([...data.groups.filter((g) => groupsOn.has(g.id)).flatMap((g) => g.categories), ...catsOn]);
  const nextQ = page === 2 ? "mes=siguiente" : "";
  // Lo que sueles gastar al día (sin lo comprometido), con los meses cerrados disponibles (hasta 3).
  const closedMonths = (data.history ?? []).slice(1, 4);
  const usualPerDay = closedMonths.length
    ? closedMonths.reduce((t, h) => t + Object.entries(h.full ?? {}).filter(([c]) => !committed.has(c)).reduce((u, [, v]) => u + v, 0), 0) / closedMonths.length / Math.max(1, data.cycle.totalDays)
    : 0;
  const list: Omit<ListProps, "plan"> = {
    open: openId,
    toggle: (id, header) => (keepInPlace(header), setOpenId((o) => (o === id ? null : id))),
    toSheet: (id, t = {}) => {
      store.set(KEY.scroll, String(scroller()?.scrollTop ?? 0));
      const q = new URLSearchParams(nextQ);
      if (t.cat) q.set("categoria", t.cat);
      if (t.sub) q.set("sub", t.sub);
      router.push(`/finanzas/grupo/${id}${q.toString() ? `?${q}` : ""}`);
    },
    toCategory: (key) => (store.set(KEY.scroll, String(scroller()?.scrollTop ?? 0)), router.push(`/finanzas/categoria/${encodeURIComponent(key)}${nextQ ? `?${nextQ}` : ""}`)),
  };
  const spendGroups = data.groups.filter((g) => !groupsOn.has(g.id) && g.categories.length);
  // El color de cada grupo o categoría en el aro es el de su icono.
  const colorOf = (id: string) => {
    if (id.startsWith("cat:")) return categoryHex(id.slice(4));
    const g = data.groups.find((x) => x.id === id); return g?.categories[0] ? categoryHex(g.categories[0]) : undefined;
  };
  const x: Ctx = { plan: data, committed, groupsOn, catsOn, toggleGroup, toggleCat, busy, list, blocks, colorOf, editSaving: (ms: MonthSaving) => setEditSaving(ms), fixedSaving: data.budget.savingsGoal, savingsByMonth: data.savingsByMonth ?? {},
    goTo: swipe.goTo, tab, setTab, usualPerDay,
    // Un bloque abierto a la vez por ciclo: es el que muestra el aro.
    toggleBlock: (k, el) => (keepInPlace(el), setBlocks((b) => { const kd = k.split(":")[0]; const was = !!b[k]; return { ...b, [`${kd}:c`]: false, [`${kd}:g`]: false, [`${kd}:a`]: false, [k]: !was }; })) };

  // Cada ciclo: lo comprometido son sus grupos y categorías (lo cobrado y, en el actual, lo que falta por cobrar);
  // lo gastado, todo lo demás (con los extraordinarios).
  const pendingCur: Record<string, number> = {};
  for (const p of data.pending ?? []) if (committed.has(p.category)) pendingCur[p.category] = (pendingCur[p.category] ?? 0) + p.amount;
  const nextByCat: Record<string, number> = {};
  for (const i of data.next?.items ?? []) nextByCat[i.category] = (nextByCat[i.category] ?? 0) + i.amount;
  const cycleOf = (k: Kind): Cycle => {
    if (k === "next") {
      const fixed = sum(nextByCat, committed);
      return { label: data.money.next.label, start: data.money.next.start, income: data.money.next.income, fixed, spent: 0, carry: null, byCat: nextByCat, pending: {} };
    }
    const mo = k === "prev" ? data.money.prev : data.money.cur;
    // Deudas: las pagadas en este mes van a Comprometido; las consumidas en este mes (pagadas en otro) se ven sin sumar.
    const debts = (data.debts ?? []).filter((d) => d.paidCycle === mo.start);
    const consumed = (data.debts ?? []).filter((d) => d.consumedCycle === mo.start && d.paidCycle !== mo.start);
    const debtSum = debts.reduce((t, d) => t + d.amount, 0);
    const byCat = (k === "prev" ? data.history[1]?.full : data.history[0]?.full) ?? {};
    const comp = sum(byCat, committed);
    const pending = k === "cur" ? pendingCur : {};
    // En el ciclo actual, el «comprometido» del servidor incluye lo que falta por cobrar: se descuenta para quedarse
    // con lo gastado de verdad.
    const pendTotal = k === "cur" ? (data.pending ?? []).reduce((t, p) => t + p.amount, 0) : 0;
    const totalSpent = mo.fixed + mo.spent - pendTotal;
    // Este ciclo, en «gastado» entra también lo previsto: tus previstos y lo que se repite y no es comprometido.
    const planned = k === "cur" ? (data.planned ?? []).filter((p) => p.date >= data.cycle.start && p.date <= data.cycle.end).reduce((t, p) => t + p.amount, 0)
      + (data.pending ?? []).filter((p) => !committed.has(p.category)).reduce((t, p) => t + p.amount, 0) : 0;
    const plannedByCat: Record<string, number> = {};
    if (k === "cur") {
      for (const p of (data.planned ?? []).filter((p) => p.date >= data.cycle.start && p.date <= data.cycle.end)) plannedByCat[p.category] = (plannedByCat[p.category] ?? 0) + p.amount;
      for (const p of (data.pending ?? []).filter((p) => !committed.has(p.category))) plannedByCat[p.category] = (plannedByCat[p.category] ?? 0) + p.amount;
    }
    return { incomeByCat: mo.incomeByCat, planned: plannedByCat, debts, consumed, label: mo.label, start: mo.start, income: mo.income, fixed: comp + sum(pending, Object.keys(pending)) + debtSum, spent: Math.max(0, totalSpent - comp - debtSum) + planned, carry: mo.carry, byCat, pending };
  };
  const waiting = data.money.cur.income <= 0 && (data.budget.income ?? 0) > 0;
  const cur = cycleOf("cur");
  if (waiting) cur.income = data.budget.income ?? 0;
  const pages: [Kind, Cycle][] = [["prev", cycleOf("prev")], ["cur", cur], ["next", cycleOf("next")]];
  const savingOf = (m: Cycle) => (m.start ? data.savingsByMonth?.[m.start] : undefined) ?? data.budget.savingsGoal ?? 0;
  const { day, totalDays } = data.cycle;

  return (
    <div ref={swipe.root} className="pb-4 [overflow-anchor:none]">
      <SavingsGoalSheet open={!!editSaving} onClose={() => setEditSaving(null)} month={editSaving}
        current={editSaving ? data.savingsByMonth?.[editSaving.start] ?? data.budget.savingsGoal : data.budget.savingsGoal} income={data.budget.income} />
      {headerMonth && createPortal(<>{monthOf(pages[page][1].start) || pages[page][1].label}</>, headerMonth)}
      <div data-swipe="arc" className="touch-pan-y overflow-hidden">
        <div ref={swipe.arcFade}>
          <div ref={swipe.arcTrack} className="flex items-start will-change-transform">
            {pages.map(([k, m]) => (
              <div key={k} className="w-full shrink-0 px-1">
                <Gauge part="arc" m={m} saving={savingOf(m)} kind={k} day={k === "cur" ? day : totalDays} days={totalDays} waiting={k === "cur" && waiting} x={x} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="my-4 flex items-center justify-center gap-2">
        {pages.map(([k], i) => (
          <button key={k} type="button" aria-label={k === "prev" ? "Mes anterior" : k === "cur" ? "Este mes" : "Próximo mes"} aria-current={page === i}
            onClick={() => x.goTo(i)} className={`h-2 rounded-full transition-all duration-300 ${page === i ? "w-5 bg-slate-700" : "w-2 bg-slate-300"}`} />
        ))}
      </div>
      {(() => {
        const [k, m] = pages[shown];
        return (
          <div data-swipe="list" className="touch-pan-y overflow-x-clip">
            <div className="transition-opacity duration-150 ease-out motion-reduce:transition-none" style={{ opacity: shown === page && tab === tabShown ? 1 : 0 }}>
              <div ref={swipe.list} className="px-1">
                <Gauge part="detail" m={m} saving={savingOf(m)} kind={k} day={k === "cur" ? day : totalDays} days={totalDays} waiting={k === "cur" && waiting} x={{ ...x, tab: tabShown }} />
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
