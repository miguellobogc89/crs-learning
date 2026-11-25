"use client";
// Inicio · «Te quedan» (25/11/2026, nació en el laboratorio). Medio aro con lo que cobras en el ciclo (de nómina a nómina) repartido en
// comprometido, gastado (con los extraordinarios), libre y ahorro; por fuera, un arco fino con lo que tenías al
// empezar, que se pinta de rojo si te pasas y tiras de él. En el centro, solo «Te quedan X €» (color según cómo vas)
// y una línea; debajo, una frase con tu situación y tres bloques desplegables: Comprometido, Gastado y Ahorro.
// «Comprometido» ya no se adivina: son los grupos y categorías que tú metes en él (lo que se paga cada mes); se
// guarda de verdad (la marca de los grupos y las categorías de ajustes). Se desliza entre ciclos con imán.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, Pencil } from "lucide-react";
import type { planView } from "@/lib/finance/service";
import { SELECTABLE_CATEGORIES, categoryLabel } from "@/lib/finance/categories";
import { eur } from "@/components/trading/format";
import { ErrorNote } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useRouter } from "next/navigation";
import { fapi, refreshFinance, useFinance } from "./api";
import { GroupsList, type ListProps } from "./home-plan";
import { SavingsGoalSheet } from "./savings-goal-sheet";
import { CategoryIcon } from "./category-icon";

type Plan = Awaited<ReturnType<typeof planView>>;
type Kind = "prev" | "cur" | "next";
type Cycle = { label: string; income: number; fixed: number; spent: number; carry: number | null; byCat: Record<string, number>; pending: Record<string, number> };

// Paleta armónica con el azul de la app (#3478f6).
const C = { fixed: "#9aaccb", spent: "#f59f8b", free: "#4cc38a", saving: "#3478f6", over: "#dc2626", track: "#b9d2fd" };
const cx = 160, cy = 168, R = 118, W = 26, RO = R + W / 2 + 9;
const pt = (r: number, f: number) => { const a = Math.PI * (1 - f); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
const arc = (r: number, f0: number, f1: number) => {
  const [x0, y0] = pt(r, f0), [x1, y1] = pt(r, f1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
const SPEND_CATS = SELECTABLE_CATEGORIES.filter((c) => c.kind === "gasto");
const sum = (o: Record<string, number>, keys: Iterable<string>) => { let t = 0; for (const k of keys) t += o[k] ?? 0; return t; };

function stateOf(m: Cycle, saving: number, kind: Kind, day: number, days: number) {
  const income = Math.max(0, m.income);
  const left = income - m.fixed - m.spent - saving;
  const over = Math.max(0, -left);
  const ateSaving = Math.min(saving, over);
  const fromCarry = Math.max(0, over - saving);
  const budget = Math.max(0, income - m.fixed - saving);
  const expected = kind === "cur" ? (budget * day) / days : budget;
  const pace = left < 0 ? "mal" : kind !== "cur" ? "bien" : m.spent <= expected ? "bien" : m.spent <= expected * 1.15 ? "atento" : "mal";
  return { income, left, over, ateSaving, fromCarry, budget, expected, pace };
}

type Ctx = { plan: Plan; committed: Set<string>; groupsOn: Set<string>; catsOn: Set<string>; toggleGroup: (id: string) => void; toggleCat: (c: string) => void; busy: boolean; list: Omit<ListProps, "plan">;
  blocks: Record<string, boolean>; toggleBlock: (key: string) => void };

function Block({ color, title, amount, children, danger = false, open, onToggle }: { color: string; title: string; amount: number; children: ReactNode; danger?: boolean; open: boolean; onToggle: () => void }) {
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color }} />
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-slate-900">{title}</span>
        <b className={`amount shrink-0 text-[15px] font-semibold tabular-nums ${danger ? "text-rose-700" : "text-slate-900"}`}>{eur(amount, 0)}</b>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-3 pl-6">{children}</div>}
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

function Gauge({ m, saving, kind, day, days, waiting, x }: { m: Cycle; saving: number; kind: Kind; day: number; days: number; waiting: boolean; x: Ctx }) {
  const [editing, setEditing] = useState(false);
  const s = stateOf(m, saving, kind, day, days);
  const isCur = kind === "cur";
  const total = Math.max(1, s.income);
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
  const carryFrac = carry > 0 && s.fromCarry > 0 ? Math.min(1, s.fromCarry / carry) : 0;
  const daysLeft = Math.max(1, days - day + 1);
  const big = kind === "next" ? Math.max(0, s.left) : Math.abs(s.left);
  const tone = s.pace === "mal" ? "#b91c1c" : s.pace === "atento" ? "#b45309" : "#15803d";
  const title = kind === "next" ? "Tendrías para gastar" : kind === "prev" ? (s.left >= 0 ? "Te sobró" : "Te pasaste") : s.left >= 0 ? "Te quedan" : "Te has pasado";
  const sub = isCur && s.left > 0 ? `unos ${eur(s.left / daysLeft, 0)} al día` : kind === "next" ? `ahorrando ${eur(saving, 0)}` : s.left < 0 ? (s.fromCarry > 0 ? "tirando de lo que tenías" : "sin ahorro este ciclo") : `y ahorraste ${eur(saving, 0)}`;
  const say = (() => {
    if (waiting) return `Tu nómina de este ciclo aún no ha entrado: cuento con lo que sueles cobrar (${eur(s.income, 0)}).`;
    if (kind === "next") return m.fixed > 0 ? `Ya tienes comprometidos ${eur(m.fixed, 0)} de lo que sueles cobrar.` : "Aún no hay nada comprometido.";
    if (kind === "prev") return s.left >= 0 ? `Cerraste el ciclo con ${eur(s.left, 0)} sin gastar, además de tu ahorro.` : s.fromCarry > 0 ? `Gastaste ${eur(s.over, 0)} más de lo que podías: tu ahorro y ${eur(s.fromCarry, 0)} de lo que tenías.` : `Te comiste ${eur(s.ateSaving, 0)} de tu ahorro.`;
    if (s.left < 0) return s.fromCarry > 0 ? `Has gastado todo lo que cobraste y ${eur(s.fromCarry, 0)} de lo que tenías.` : `Te estás comiendo tu ahorro: ${eur(s.ateSaving, 0)} de ${eur(saving, 0)}.`;
    const perDay = day > 0 ? m.spent / day : 0;
    const projected = Math.round(s.budget - perDay * days);
    if (s.pace === "bien") return `Vas ${eur(Math.max(0, Math.round(s.expected - m.spent)), 0)} por debajo de lo que te toca a estas alturas.`;
    return projected < 0 ? `Vas rápido: a este ritmo te pasarías unos ${eur(-projected, 0)} al final del ciclo.` : `Vas un poco rápido: a este ritmo te quedarían solo ${eur(projected, 0)}.`;
  })();

  // Desglose: comprometido por sus grupos y categorías; gastado por el resto de grupos y lo que va sin grupo.
  const groupsOn = x.plan.groups.filter((g) => x.groupsOn.has(g.id));
  const loneCats = [...x.catsOn].filter((c) => !groupsOn.some((g) => g.categories.includes(c)));
  const otherGroups = x.plan.groups.filter((g) => !x.groupsOn.has(g.id) && g.categories.length);
  const inOther = new Set(otherGroups.flatMap((g) => g.categories));
  const looseSpent = Math.max(0, m.spent - sum(m.byCat, [...inOther].filter((c) => !x.committed.has(c))));
  const pendingOf = (cats: string[]) => sum(m.pending, cats);

  return (
    <div className={`rounded-2xl p-3 ${isCur ? "border-2 border-[#3478f6] bg-white" : "bg-slate-50"}`}>
      {isCur
        ? <p className="flex justify-center"><span className="rounded-full bg-[#3478f6] px-3 py-1 text-xs font-semibold text-white">Este ciclo · {m.label}</span></p>
        : <p className="py-1 text-center text-xs text-slate-500">{kind === "prev" ? "Ciclo anterior" : "Próximo ciclo"} · {m.label}</p>}
      <svg viewBox="0 0 320 180" className="block h-auto w-full" role="img" aria-label={`${title} ${eur(big, 0)}`}>
        {paths}
        {kind !== "next" && carry > 0 && <path d={arc(RO, 0, 1)} fill="none" stroke={C.track} strokeWidth={6} strokeLinecap="round" />}
        {carryFrac > 0 && <path d={arc(RO, 1 - carryFrac, 1)} fill="none" stroke={C.over} strokeWidth={7} strokeLinecap="round" />}
        <text x={cx} y={cy - 46} textAnchor="middle" fontSize="13" fill="#64748b">{title}</text>
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize="32" fontWeight="600" fill={kind === "next" ? "#0f172a" : tone}>{eur(big, 0)}</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="13" fill="#64748b">{sub}</text>
      </svg>
      <p className="amount mt-2 text-center text-sm text-slate-600">{say}</p>

      <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
        <Block color={C.fixed} title="Comprometido" amount={m.fixed} open={x.blocks[`${kind}:c`] ?? false} onToggle={() => x.toggleBlock(`${kind}:c`)}>
          {!groupsOn.length && !loneCats.length && <p className="py-1 text-sm text-slate-500">Todavía no hay gastos asignados. Añade los que se pagan cada mes: hipoteca, recibos, préstamos, suscripciones…</p>}
          {kind === "prev" ? (
            <>
              {groupsOn.map((g) => <Line key={g.id} icon={g.categories[0]} label={g.name} amount={sum(m.byCat, g.categories)} />)}
              {loneCats.map((c) => <Line key={c} icon={c} label={categoryLabel(c)} amount={m.byCat[c] ?? 0} />)}
            </>
          ) : (groupsOn.length > 0 || loneCats.length > 0) && (
            <GroupsList plan={x.plan as never} mode={kind === "next" ? "next" : "now"} {...x.list} section={{ kind: "committed", groupIds: x.groupsOn, cats: x.catsOn }} />
          )}
          <button type="button" onClick={() => setEditing((e) => !e)} className="mt-1 inline-flex items-center gap-1.5 py-1 text-sm font-semibold text-blue-700">
            {x.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{editing ? "Listo" : groupsOn.length || loneCats.length ? "Añadir o quitar" : "Añadir"}
          </button>
          {editing && <CommittedPicker x={x} />}
        </Block>
        <Block color={C.spent} title={kind === "cur" ? "Gastado y previsto" : "Gastado"} amount={m.spent} open={x.blocks[`${kind}:g`] ?? kind !== "prev"} onToggle={() => x.toggleBlock(`${kind}:g`)}>
          {kind !== "prev" ? <GroupsList plan={x.plan as never} mode={kind === "next" ? "next" : "now"} {...x.list} section={{ kind: "spent", groupIds: x.groupsOn, cats: x.committed }} /> : <>
          {otherGroups.map((g) => ({ g, v: sum(m.byCat, g.categories.filter((c) => !x.committed.has(c))) })).filter(({ v }) => v > 0).sort((a, b) => b.v - a.v)
            .map(({ g, v }) => <Line key={g.id} icon={g.categories[0]} label={g.name} amount={v} />)}
          {looseSpent > 0 && <Line icon="otros_gastos" label="Sin grupo y extraordinarios" amount={looseSpent} />}
          {m.spent <= 0 && <p className="py-1 text-sm text-slate-500">Nada todavía.</p>}
          </>}
        </Block>
        <Block color={C.saving} title="Ahorro" amount={saving - s.ateSaving} danger={s.ateSaving > 0} open={x.blocks[`${kind}:a`] ?? false} onToggle={() => x.toggleBlock(`${kind}:a`)}>
          <p className="py-1 text-sm text-slate-600">
            Tu objetivo es {eur(saving, 0)} por ciclo. {s.ateSaving > 0 ? `Te has comido ${eur(s.ateSaving, 0)}.` : "Intacto."}
            {kind !== "next" && carry > 0 && ` Al empezar tenías ${eur(carry, 0)}${s.fromCarry > 0 ? `, y has tirado de ${eur(s.fromCarry, 0)} (${Math.round(carryFrac * 100)} %)` : ""}.`}
          </p>
        </Block>
      </ul>
    </div>
  );
}

// Lo que Inicio recuerda en esta sesión al ir a una hoja y volver: el ciclo que se miraba, lo desplegado y el scroll.
const KEY = { page: "crs-finance:quedan-page", open: "crs-finance:quedan-open", blocks: "crs-finance:quedan-blocks", scroll: "crs-finance:quedan-scroll" };
const store = {
  get: (k: string) => { try { return window.sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) window.sessionStorage.removeItem(k); else window.sessionStorage.setItem(k, v); } catch { /* ignorar */ } },
};
const scroller = () => document.querySelector<HTMLElement>("main");

export function LeftToSpend() {
  const { data, error } = useFinance<Plan>("plan");
  const pager = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Record<string, boolean>>({});
  const [restored, setRestored] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
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
    setPage(p);
    setOpenId(store.get(KEY.open));
    try { setBlocks(JSON.parse(store.get(KEY.blocks) ?? "{}")); } catch { /* ignorar */ }
    const el = pager.current;
    if (el) el.scrollLeft = p * el.clientWidth;
    setRestored(true);
    const y = Number(store.get(KEY.scroll));
    store.set(KEY.scroll, null);
    if (y > 0) requestAnimationFrame(() => requestAnimationFrame(() => { const m = scroller(); if (m) m.scrollTop = y; }));
  }, [data, restored]);
  useEffect(() => { if (restored) store.set(KEY.page, String(page)); }, [page, restored]);
  useEffect(() => { if (restored) store.set(KEY.open, openId); }, [openId, restored]);
  useEffect(() => { if (restored) store.set(KEY.blocks, JSON.stringify(blocks)); }, [blocks, restored]);
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
  const list: Omit<ListProps, "plan"> = {
    open: openId,
    toggle: (id) => setOpenId((o) => (o === id ? null : id)),
    toSheet: (id, t = {}) => {
      store.set(KEY.scroll, String(scroller()?.scrollTop ?? 0));
      const q = new URLSearchParams(nextQ);
      if (t.cat) q.set("categoria", t.cat);
      if (t.sub) q.set("sub", t.sub);
      router.push(`/finanzas/grupo/${id}${q.toString() ? `?${q}` : ""}`);
    },
    toCategory: (key) => (store.set(KEY.scroll, String(scroller()?.scrollTop ?? 0)), router.push(`/finanzas/categoria/${encodeURIComponent(key)}${nextQ ? `?${nextQ}` : ""}`)),
  };
  const x: Ctx = { plan: data, committed, groupsOn, catsOn, toggleGroup, toggleCat, busy, list, blocks,
    toggleBlock: (k) => setBlocks((b) => ({ ...b, [k]: !(b[k] ?? (k.endsWith(":g") && !k.startsWith("prev"))) })) };

  // Cada ciclo: lo comprometido son sus grupos y categorías (lo cobrado y, en el actual, lo que falta por cobrar);
  // lo gastado, todo lo demás (con los extraordinarios).
  const pendingCur: Record<string, number> = {};
  for (const p of data.pending ?? []) if (committed.has(p.category)) pendingCur[p.category] = (pendingCur[p.category] ?? 0) + p.amount;
  const nextByCat: Record<string, number> = {};
  for (const i of data.next?.items ?? []) nextByCat[i.category] = (nextByCat[i.category] ?? 0) + i.amount;
  const cycleOf = (k: Kind): Cycle => {
    if (k === "next") {
      const fixed = sum(nextByCat, committed);
      return { label: data.money.next.label, income: data.money.next.income, fixed, spent: 0, carry: null, byCat: nextByCat, pending: {} };
    }
    const mo = k === "prev" ? data.money.prev : data.money.cur;
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
    return { label: mo.label, income: mo.income, fixed: comp + sum(pending, Object.keys(pending)), spent: Math.max(0, totalSpent - comp) + planned, carry: mo.carry, byCat, pending };
  };
  const waiting = data.money.cur.income <= 0 && (data.budget.income ?? 0) > 0;
  const cur = cycleOf("cur");
  if (waiting) cur.income = data.budget.income ?? 0;
  const pages: [Kind, Cycle][] = [["prev", cycleOf("prev")], ["cur", cur], ["next", cycleOf("next")]];
  const saving = data.budget.savingsGoal ?? 0;
  const { day, totalDays } = data.cycle;

  return (
    <div className="pb-4">
      <button type="button" onClick={() => setEditSaving(true)} className="mb-3 flex w-full items-center justify-between gap-3 px-1 text-left" aria-label="Cambiar el objetivo de ahorro">
        <span className="text-sm text-slate-500">Tu objetivo de ahorro</span>
        <span className="flex items-center gap-2">
          <b className="amount text-[15px] font-semibold tabular-nums text-[#3478f6]">{eur(saving, 0)} por ciclo</b>
          <Pencil className="h-3.5 w-3.5 text-slate-400" />
        </span>
      </button>
      <SavingsGoalSheet open={editSaving} onClose={() => setEditSaving(false)} current={data.budget.savingsGoal} income={data.budget.income} />
      <div ref={pager} onScroll={(e) => { const el = e.currentTarget; setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
        className="flex snap-x snap-mandatory items-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pages.map(([k, m]) => (
          <div key={k} className="w-full shrink-0 snap-start snap-always px-1">
            <Gauge m={m} saving={saving} kind={k} day={k === "cur" ? day : totalDays} days={totalDays} waiting={k === "cur" && waiting} x={x} />
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

    </div>
  );
}
