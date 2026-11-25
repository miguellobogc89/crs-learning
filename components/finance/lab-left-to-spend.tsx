"use client";
// Laboratorio · «Te quedan» (25/11/2026). Medio aro con lo que cobras en el ciclo (de nómina a nómina) repartido en
// comprometido (lo que se repite), gastado (con los extraordinarios), libre y ahorro; por fuera, un arco fino con lo
// que traías del ciclo anterior, que se pinta de rojo si te pasas y tiras de él. En el centro, solo «Te quedan X €»
// (con color según cómo vas) y una línea; al tocar el aro, el reparto. Debajo, una frase con tu situación. Se desliza:
// el ciclo anterior a la izquierda, este en medio y el próximo a la derecha. Prueba: no guarda nada.
import { useEffect, useRef, useState } from "react";
import type { planView } from "@/lib/finance/service";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";

type Plan = Awaited<ReturnType<typeof planView>>;
type Money = Plan["money"]["cur"] | Plan["money"]["next"];
type Kind = "prev" | "cur" | "next";

// Paleta armónica con el azul de la app (#3478f6): comprometido gris azulado, gastado coral (siempre el mismo, también
// si te pasas), libre verde, ahorro azul; el arco fino (lo que tenías) azul claro y rojo lo que te comes de él.
const C = { fixed: "#9aaccb", spent: "#f59f8b", free: "#4cc38a", saving: "#3478f6", over: "#dc2626", track: "#b9d2fd" };
const cx = 160, cy = 168, R = 118, W = 26, RO = R + W / 2 + 9;
const pt = (r: number, f: number) => { const a = Math.PI * (1 - f); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
const arc = (r: number, f0: number, f1: number) => {
  const [x0, y0] = pt(r, f0), [x1, y1] = pt(r, f1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

/** Reparto y estado de un ciclo. `day`/`days`: por dónde va el ciclo (solo cuenta en el actual). */
function stateOf(m: Money, saving: number, kind: Kind, day: number, days: number) {
  const income = Math.max(0, m.income);
  const left = income - m.fixed - m.spent - saving;
  const over = Math.max(0, -left);
  const ateSaving = Math.min(saving, over);
  const fromCarry = Math.max(0, over - saving);
  // Ritmo: lo que podías llevar gastado a estas alturas de lo que es para gastar.
  const budget = Math.max(0, income - m.fixed - saving);
  const expected = kind === "cur" ? (budget * day) / days : budget;
  const pace = left < 0 ? "mal" : kind !== "cur" ? "bien" : m.spent <= expected ? "bien" : m.spent <= expected * 1.15 ? "atento" : "mal";
  return { income, left, over, ateSaving, fromCarry, budget, expected, pace };
}

function Gauge({ m, saving, kind, day, days, waiting = false }: { m: Money; saving: number; kind: Kind; day: number; days: number; waiting?: boolean }) {
  const isCur = kind === "cur";
  const [open, setOpen] = useState(false);
  const s = stateOf(m, saving, kind, day, days);
  const total = Math.max(1, s.income);
  // Si te pasas, lo gastado ocupa también la parte del ahorro que te has comido (en el mismo color).
  const segs: [number, string][] = s.left >= 0
    ? [[m.fixed, C.fixed], [m.spent, C.spent], [s.left, C.free], [saving, C.saving]]
    : [[Math.min(m.fixed, total), C.fixed], [Math.max(0, total - m.fixed - (saving - s.ateSaving)), C.spent], [saving - s.ateSaving, C.saving]];
  let f = 0;
  const paths = segs.filter(([v]) => v > 0).map(([v, c], i) => {
    const f1 = Math.min(1, f + v / total);
    const d = arc(R, f + 0.003, Math.max(f + 0.004, f1 - 0.003));
    f = f1;
    return <path key={i} d={d} fill="none" stroke={c} strokeWidth={W} />;
  });
  const carry = m.carry ?? 0;
  // Arco fino: media circunferencia = todo lo que tenías al empezar; en rojo, la parte que te has comido.
  const carryFrac = carry > 0 && s.fromCarry > 0 ? Math.min(1, s.fromCarry / carry) : 0;
  const daysLeft = Math.max(1, days - day + 1);
  const big = kind === "next" ? Math.max(0, s.left) : Math.abs(s.left);
  const tone = s.pace === "mal" ? "#b91c1c" : s.pace === "atento" ? "#b45309" : "#15803d";
  const title = kind === "next" ? "Tendrías para gastar" : kind === "prev" ? (s.left >= 0 ? "Te sobró" : "Te pasaste") : s.left >= 0 ? "Te quedan" : "Te has pasado";
  const sub = kind === "cur" && s.left > 0 ? `unos ${eur(s.left / daysLeft, 0)} al día` : kind === "next" ? `ahorrando ${eur(saving, 0)}` : s.left < 0 ? (s.fromCarry > 0 ? "tirando de lo que traías" : "sin ahorro este mes") : `y ahorraste ${eur(saving, 0)}`;

  // Frase con la situación, con sus números.
  const say = (() => {
    if (kind === "next") return m.fixed > 0 ? `Ya tienes comprometidos ${eur(m.fixed, 0)} de lo que sueles cobrar (${eur(s.income, 0)}).` : "Aún no hay nada comprometido.";
    if (kind === "prev") return s.left >= 0 ? `Cerraste el ciclo con ${eur(s.left, 0)} sin gastar, además de tu ahorro.` : s.fromCarry > 0 ? `Gastaste ${eur(s.over, 0)} más de lo que podías: tu ahorro y ${eur(s.fromCarry, 0)} de lo que traías.` : `Te comiste ${eur(s.ateSaving, 0)} de tu ahorro.`;
    if (s.left < 0) return s.fromCarry > 0 ? `Has gastado todo lo que cobraste y ${eur(s.fromCarry, 0)} de lo que tenías de antes.` : `Te estás comiendo tu ahorro: ${eur(s.ateSaving, 0)} de ${eur(saving, 0)}.`;
    const diff = Math.round(s.expected - m.spent);
    const perDay = day > 0 ? m.spent / day : 0;
    const projected = Math.round(s.budget - perDay * days);
    if (s.pace === "bien") return `Vas ${eur(Math.max(0, diff), 0)} por debajo de lo que te toca a estas alturas.`;
    return projected < 0 ? `Vas rápido: a este ritmo te pasarías unos ${eur(-projected, 0)} al final del ciclo.` : `Vas un poco rápido: a este ritmo te quedarían solo ${eur(projected, 0)}.`;
  })();

  const rows: [string, number, string][] = [
    ["Cobrado", s.income, "transparent"],
    ["Comprometido", m.fixed, C.fixed],
    [kind === "next" ? "Gastado (aún nada)" : "Gastado", m.spent, C.spent],
    ...(s.left >= 0 ? [["Libre", s.left, C.free] as [string, number, string]] : []),
    ["Ahorro", saving - s.ateSaving, C.saving],
    ...(s.fromCarry > 0 ? [["De lo que traías", -s.fromCarry, C.over] as [string, number, string]] : []),
  ];

  return (
    <div className={`rounded-2xl p-3 ${isCur ? "border-2 border-[#3478f6] bg-white" : "bg-slate-50 opacity-90"}`}>
      {/* El ciclo actual se distingue: etiqueta azul y borde; los demás, la fecha en gris. */}
      {isCur
        ? <p className="flex justify-center"><span className="rounded-full bg-[#3478f6] px-3 py-1 text-xs font-semibold text-white">Este ciclo · {m.label}</span></p>
        : <p className="py-1 text-center text-xs text-slate-500">{kind === "prev" ? "Ciclo anterior" : "Próximo ciclo"} · {m.label}</p>}
      <button type="button" onClick={() => setOpen((o) => !o)} className="block w-full" aria-expanded={open} aria-label="Ver el reparto">
        <svg viewBox="0 0 320 180" className="block h-auto w-full">
          {paths}
          {kind !== "next" && carry > 0 && <path d={arc(RO, 0, 1)} fill="none" stroke={C.track} strokeWidth={6} strokeLinecap="round" />}
          {carryFrac > 0 && <path d={arc(RO, 1 - carryFrac, 1)} fill="none" stroke={C.over} strokeWidth={7} strokeLinecap="round" />}
          <text x={cx} y={cy - 46} textAnchor="middle" fontSize="13" fill="#64748b">{title}</text>
          <text x={cx} y={cy - 14} textAnchor="middle" fontSize="32" fontWeight="600" fill={kind === "next" ? "#0f172a" : tone}>{eur(big, 0)}</text>
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize="13" fill="#64748b">{sub}</text>
        </svg>
      </button>
      <p className="amount mt-2 text-center text-sm text-slate-600">{waiting ? `Tu nómina de este ciclo aún no ha entrado: cuento con lo que sueles cobrar (${eur(s.income, 0)}).` : say}</p>
      {open && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-slate-50 px-3 text-sm">
          {kind !== "next" && carry > 0 && s.fromCarry > 0 && <li className="flex items-center justify-between py-2"><span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C.over }} />De lo que tenías</span><b className="amount font-semibold tabular-nums text-rose-700">{eur(-s.fromCarry, 0)} ({Math.round(carryFrac * 100)} %)</b></li>}
          {rows.filter(([t]) => t !== "De lo que traías").map(([t, v, c]) => (
            <li key={t} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{t}</span>
              <b className={`amount font-semibold tabular-nums ${v < 0 ? "text-rose-700" : "text-slate-900"}`}>{eur(v, 0)}</b>
            </li>
          ))}
          {kind !== "next" && <li className="flex items-center justify-between py-2 text-xs text-slate-400"><span>Traías al empezar</span><span className="amount tabular-nums">{eur(carry, 0)}</span></li>}
        </ul>
      )}
      {!open && <p className="mt-1 text-center text-[11px] text-slate-400">Toca el aro para ver el reparto</p>}
    </div>
  );
}

export function LabLeftToSpend() {
  const { data, error } = useFinance<Plan>("plan");
  const pager = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { const el = pager.current; if (el && data) el.scrollLeft = el.clientWidth; }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={5} />;
  const saving = data.budget.savingsGoal ?? 0;
  const { day, totalDays } = data.cycle;
  // Si la nómina del ciclo aún no ha entrado (el día de cobro, antes de sincronizar), se cuenta con la habitual.
  const waiting = data.money.cur.income <= 0 && (data.budget.income ?? 0) > 0;
  const cur = waiting ? { ...data.money.cur, income: data.budget.income ?? 0 } : data.money.cur;
  const pages: [Kind, Money][] = [["prev", data.money.prev], ["cur", cur], ["next", data.money.next]];
  return (
    <div className="pb-4">
      <div ref={pager} onScroll={(e) => { const el = e.currentTarget; setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pages.map(([k, m]) => (
          // «Imantado»: cada deslizamiento se para en el ciclo siguiente, sin pasar de largo.
          <div key={k} className="w-full shrink-0 snap-start snap-always px-1">
            <Gauge m={m} saving={saving} kind={k} day={k === "cur" ? day : totalDays} days={totalDays} waiting={k === "cur" && waiting} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        {pages.map(([k], i) => (
          <button key={k} type="button" aria-label={k === "prev" ? "Ciclo anterior" : k === "cur" ? "Este ciclo" : "Próximo ciclo"}
            onClick={() => { const el = pager.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); }}
            className={`h-2 rounded-full transition-all ${page === i ? "w-5 bg-slate-700" : "w-2 bg-slate-300"}`} />
        ))}
      </div>
      <p className="mt-6 text-[11px] text-slate-400">Prueba: no guarda nada. Ahorro: tu objetivo de ajustes ({eur(saving, 0)}). Lo que traías sale del saldo de tus cuentas incluidas.</p>
    </div>
  );
}
