// lib/finance/plan.ts
// Planificación (la hucha): cuadre del plan del ciclo, límite semanal de cada partida, transferencias del día de
// cobro y lista de deseos. Funciones puras sobre los datos de logic.ts (sin base de datos): las usa service.ts y
// los tests. Nada está pensado para un usuario concreto: partidas, importes y cuentas los decide cada persona.
import { addDays, daysBetween, median, merchantKey, round2, toDate, type Budget, type BudgetStatus, type Cycle, type CycleSummary, type Recurring, type Tx } from "./logic";

// ---------------------------------------------------------------------------------------------------------
// Cuadre del plan: ingreso − fijos − variables − ahorro = sin asignar
// ---------------------------------------------------------------------------------------------------------

/** Ingreso habitual: mediana de los últimos ciclos con ingresos (sin regalos). */
export function detectIncome(history: CycleSummary[], cycles = 3): number | null {
  const values = history.map((h) => h.income).filter((v) => v > 0).slice(0, cycles);
  return values.length ? round2(median(values)) : null;
}

/** Gasto fijo detectado al mes (recurrentes activos y no cancelados), para cuando no hay partidas fijas. */
export function detectedFixedMonthly(recurring: (Recurring & { cancelled?: boolean })[]) {
  return round2(recurring.filter((r) => r.amount < 0 && r.active && !r.cancelled)
    .reduce((s, r) => s + Math.abs(r.amount) * (30 / r.intervalDays), 0));
}

export type PlanBalance = {
  income: number | null;
  incomeSource: "manual" | "detectado" | null;
  fixed: number;
  fixedSource: "partidas" | "detectado";
  variable: number;
  savings: number;
  /** Lo que queda sin repartir (negativo: el plan no cuadra). */
  unassigned: number | null;
};

export function planBalance(opts: {
  expectedIncome: number | null;
  detectedIncome: number | null;
  savingsGoal: number | null;
  budgets: Budget[];
  detectedFixed: number;
}): PlanBalance {
  const income = opts.expectedIncome ?? opts.detectedIncome;
  const fixedBudgets = opts.budgets.filter((b) => b.kind === "fijo");
  const fixed = fixedBudgets.length ? round2(fixedBudgets.reduce((s, b) => s + b.amount, 0)) : opts.detectedFixed;
  const variable = round2(opts.budgets.filter((b) => b.kind !== "fijo").reduce((s, b) => s + b.amount, 0));
  const savings = round2(opts.savingsGoal ?? 0);
  return {
    income,
    incomeSource: opts.expectedIncome !== null ? "manual" : opts.detectedIncome !== null ? "detectado" : null,
    fixed,
    fixedSource: fixedBudgets.length ? "partidas" : "detectado",
    variable,
    savings,
    unassigned: income === null ? null : round2(income - fixed - variable - savings),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Semanas del ciclo y límite semanal de cada partida
// ---------------------------------------------------------------------------------------------------------

export type CycleWeek = { start: string; end: string; days: number };

/** Semanas de lunes a domingo dentro del ciclo (la primera y la última pueden ser más cortas). */
export function cycleWeeks(cycle: Cycle): CycleWeek[] {
  const weeks: CycleWeek[] = [];
  let start = cycle.start;
  while (start <= cycle.end) {
    const dow = (toDate(start).getUTCDay() + 6) % 7; // lunes = 0
    const sunday = addDays(start, 6 - dow);
    const end = sunday < cycle.end ? sunday : cycle.end;
    weeks.push({ start, end, days: daysBetween(start, end) + 1 });
    start = addDays(end, 1);
  }
  return weeks;
}

/** Si un movimiento es de una partida: gasto o devolución de sus categorías (sin categorías = todo el gasto). */
export const inBudget = (b: Pick<Budget, "categories">, t: Tx) =>
  (t.kind === "gasto" || t.kind === "devolucion") && (!b.categories.length || b.categories.includes(t.category));

/** Lo que cuenta para una partida: gasto real (menos devoluciones), sin los extraordinarios (IBI, una avería…). */
export function budgetSpend(b: Pick<Budget, "categories">, t: Tx) {
  return inBudget(b, t) && !t.extraordinary ? -t.amount : 0;
}

/** Cómo va cada partida en el ciclo (mismo formato que budgetStatus de logic.ts, pero sin extraordinarios). */
export function planBudgetStatus(budgets: Budget[], txs: Tx[], cycle: Cycle, today: string): BudgetStatus[] {
  const total = daysBetween(cycle.start, cycle.end) + 1;
  const elapsed = Math.min(total, Math.max(1, daysBetween(cycle.start, today) + 1));
  const expectedPct = round2((elapsed / total) * 100);
  const inCycle = txs.filter((t) => t.date >= cycle.start && t.date <= cycle.end);
  return budgets.map((b) => {
    const spent = round2(inCycle.reduce((s, t) => s + budgetSpend(b, t), 0));
    const pct = b.amount > 0 ? round2((spent / b.amount) * 100) : 0;
    const status = pct >= 100 ? "superado" : pct > expectedPct + 10 && pct >= 50 ? "atencion" : "ok";
    return { ...b, spent, remaining: round2(b.amount - spent), pct, expectedPct, status };
  });
}

/** Movimientos de una partida en el ciclo (también los extraordinarios, para poder excluirlos o volver a contarlos). */
export function budgetMovements(b: Pick<Budget, "categories">, txs: Tx[], cycle: Cycle, limit = 80) {
  return txs.filter((t) => t.date >= cycle.start && t.date <= cycle.end && inBudget(b, t))
    .sort((a, z) => z.date.localeCompare(a.date)).slice(0, limit)
    .map((t) => ({ id: t.id, date: t.date, amount: t.amount, description: t.alias || t.counterparty || t.description, category: t.category, kind: t.kind, extraordinary: t.extraordinary }));
}

export type WeekStatus = "ok" | "cerca" | "superado" | "previsto";
export type BudgetWeek = CycleWeek & { limit: number; spent: number; remaining: number; status: WeekStatus; current: boolean };

/**
 * Límite de cada semana: lo que queda de la partida al empezar la semana, repartido por los días que faltan del
 * ciclo. Así lo que sobra una semana se reparte entre las siguientes y lo que te pasas se descuenta, sin
 * arrastres manuales. Las semanas futuras salen con el ritmo actual (previsto).
 */
export function budgetWeeks(b: Pick<Budget, "categories" | "amount">, txs: Tx[], cycle: Cycle, today: string): BudgetWeek[] {
  const weeks = cycleWeeks(cycle);
  const spentByWeek = weeks.map(() => 0);
  for (const t of txs) {
    if (t.date < cycle.start || t.date > cycle.end) continue;
    const s = budgetSpend(b, t);
    if (!s) continue;
    const i = weeks.findIndex((w) => t.date >= w.start && t.date <= w.end);
    if (i >= 0) spentByWeek[i] += s;
  }
  let before = 0;
  return weeks.map((w, i) => {
    const daysLeft = daysBetween(w.start, cycle.end) + 1;
    const limit = round2(Math.max(0, b.amount - before) * (w.days / daysLeft));
    const spent = round2(spentByWeek[i]);
    before += spentByWeek[i];
    const future = w.start > today;
    const status: WeekStatus = future ? "previsto" : spent > limit + 0.005 ? "superado" : limit > 0 && spent >= limit * 0.8 ? "cerca" : "ok";
    return { ...w, limit, spent, remaining: round2(limit - spent), status, current: today >= w.start && today <= w.end };
  });
}

/** Movimientos de gasto sin clasificar de una cuenta en el ciclo: la cuenta ayuda a saber a qué partida van. */
export function unclassifiedFor(accountId: string, txs: Tx[], cycle: Cycle) {
  const rows = txs.filter((t) => t.accountId === accountId && t.date >= cycle.start && t.date <= cycle.end
    && t.kind === "gasto" && (t.category === "sin_clasificar" || t.source === "pendiente"));
  return { count: rows.length, amount: round2(rows.reduce((s, t) => s - t.amount, 0)) };
}

// ---------------------------------------------------------------------------------------------------------
// Transferencias del día de cobro
// ---------------------------------------------------------------------------------------------------------

export type PlannedTransfer = { accountId: string; amount: number; done: number; pending: number; items: string[] };

/**
 * Cuánto mover a cada cuenta al cobrar: la suma de las partidas que paga (y el ahorro a su cuenta), menos lo que
 * ya ha entrado este ciclo desde tus otras cuentas. La cuenta donde cobras no necesita transferencia.
 */
export function transferPlan(opts: {
  budgets: Budget[];
  savingsGoal: number | null;
  savingsAccountId: string | null;
  incomeAccountId: string | null;
  txs: Tx[];
  cycle: Cycle;
}): PlannedTransfer[] {
  const targets = new Map<string, { amount: number; items: string[] }>();
  const add = (accountId: string | null | undefined, amount: number, label: string) => {
    if (!accountId || accountId === opts.incomeAccountId || amount <= 0) return;
    const t = targets.get(accountId) ?? { amount: 0, items: [] };
    t.amount += amount;
    t.items.push(label);
    targets.set(accountId, t);
  };
  for (const b of opts.budgets) add(b.accountId, b.amount, b.name);
  if (opts.savingsGoal) add(opts.savingsAccountId, opts.savingsGoal, "Ahorro");
  return [...targets.entries()].map(([accountId, t]) => {
    const done = round2(opts.txs.filter((x) => x.accountId === accountId && x.amount > 0 && (x.kind === "interna" || x.kind === "ahorro")
      && x.date >= opts.cycle.start && x.date <= opts.cycle.end).reduce((s, x) => s + x.amount, 0));
    const amount = round2(t.amount);
    return { accountId, amount, done, pending: round2(Math.max(0, amount - done)), items: t.items };
  }).sort((a, b) => b.amount - a.amount);
}

/** Cuenta donde entra el ingreso: la que más ingresos ordinarios recibió en los últimos ciclos. */
export function detectIncomeAccount(txs: Tx[], since: string): string | null {
  const totals = new Map<string, number>();
  for (const t of txs) if (t.date >= since && t.kind === "ingreso" && t.amount > 0) totals.set(t.accountId, (totals.get(t.accountId) ?? 0) + t.amount);
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// ---------------------------------------------------------------------------------------------------------
// Lista de deseos
// ---------------------------------------------------------------------------------------------------------

export type WishItem = { id: string; title: string; price: number; saved: number; url: string | null; priority: number; purchasedAt: string | null; createdAt: string };

/** Lo que falta para cada deseo y si cabe ya en lo que puedes gastar este ciclo sin tocar el ahorro. */
export function wishStatus(item: WishItem, safeToSpend: number | null) {
  const missing = round2(Math.max(0, item.price - item.saved));
  return {
    ...item,
    missing,
    progress: item.price > 0 ? round2(Math.min(100, (item.saved / item.price) * 100)) : 0,
    affordableNow: item.purchasedAt === null && (missing === 0 || (safeToSpend !== null && missing <= safeToSpend)),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Asistente: partidas fijas a partir de los recibos detectados
// ---------------------------------------------------------------------------------------------------------

export type FixedSource = { key: string; label: string; category: string; monthly: number; accountId: string | null };
export type FixedDraft = { name: string; amount: number; categories: string[]; accountId: string | null; recurringKeys: string[] };

/** Una partida fija por cuenta que paga los recibos elegidos: importe = suma mensual, categorías = las de esos recibos. */
export function fixedPartidas(selected: FixedSource[], accountName: (id: string | null) => string): FixedDraft[] {
  const groups = new Map<string, FixedDraft>();
  for (const r of selected) {
    const k = r.accountId ?? "";
    const g = groups.get(k) ?? { name: `Fijos · ${accountName(r.accountId)}`, amount: 0, categories: [], accountId: r.accountId, recurringKeys: [] };
    g.amount += r.monthly;
    if (!g.categories.includes(r.category)) g.categories.push(r.category);
    g.recurringKeys.push(r.key);
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => ({ ...g, amount: round2(g.amount) })).sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------------------------------------
// Mi plan · paquetes: concepto estandarizado de un cargo
// ---------------------------------------------------------------------------------------------------------

/**
 * Concepto de un cargo para agrupar en los paquetes: la clave de comercio sin las referencias que cambian en cada
 * pago con tarjeta («Glovo 04oct Sqsm1a1d», «Freenow*ebbf70-2», «Cabify Es 2646sdctza87») y sin palabras repetidas.
 * Así «todo lo de Glovo» es un solo concepto aunque cambien la referencia, la fecha o el importe.
 */
export function conceptKey(description: string, counterparty?: string | null) {
  const base = merchantKey(description, counterparty);
  const words = base.split(" ").filter((w) => w && !/\d/.test(w));
  const unique = words.filter((w, i) => w !== words[i - 1]);
  return unique.join(" ") || base;
}

/**
 * Qué puede entrar en un paquete: solo consumo (tipo «gasto», comisiones incluidas). Los traspasos entre cuentas
 * propias («interna») y las aportaciones a ahorro o inversión («ahorro») son movimientos patrimoniales: nunca
 * cuentan como consumo, y así el ahorro no se descuenta dos veces (ya está en el objetivo de ahorro). Se aplica al
 * calcular, de modo que si un movimiento se reclasifica después, deja de contar solo.
 */
export const isPackageCharge = (t: { kind: string; amount: number }) => t.kind === "gasto" && t.amount < 0;

/** Si un cargo entra en un paquete: por su concepto (pasados y futuros) o marcado a mano. */
export const inPackage = (p: { conceptKeys: string[]; txIds: string[] }, c: { id: string; concept: string }) =>
  p.conceptKeys.includes(c.concept) || p.txIds.includes(c.id);

/** Paquete al que pertenece cada cargo: un cargo solo cuenta en un paquete (el primero que lo reclama). */
export function packageOwners<P extends { id: string; conceptKeys: string[]; txIds: string[] }, C extends { id: string; concept: string }>(packages: P[], charges: C[]) {
  const owner = new Map<string, string>();
  for (const c of charges) {
    const p = packages.find((x) => inPackage(x, c));
    if (p) owner.set(c.id, p.id);
  }
  return owner;
}

/** Gasto de un paquete en un ciclo (cargos menos devoluciones no se cuentan aún: solo cargos). */
export function packageSpend(packageId: string, owner: Map<string, string>, charges: { id: string; date: string; amount: number }[], cycle: Cycle) {
  return round2(charges.reduce((s, c) => s + (owner.get(c.id) === packageId && c.date >= cycle.start && c.date <= cycle.end ? -c.amount : 0), 0));
}

/** Cómo va un paquete frente a su objetivo, teniendo en cuenta el día del ciclo (mismo criterio que los límites). */
export function goalStatus(spent: number, goal: number | null, day: number, totalDays: number) {
  if (goal === null || goal <= 0) return null;
  const pct = round2((spent / goal) * 100);
  const expectedPct = round2((Math.min(day, totalDays) / totalDays) * 100);
  const status = pct >= 100 ? "superado" as const : pct > expectedPct + 10 && pct >= 50 ? "atencion" as const : "ok" as const;
  return { pct, expectedPct, remaining: round2(goal - spent), status };
}

export type PlanInsight = { tone: "danger" | "warning" | "success"; text: string };

/**
 * «Qué te está desviando»: frases deterministas a partir de los paquetes, el gasto sin paquete y el ahorro.
 * Primero lo que se pasa, luego lo que va rápido o sin repartir, y al final dónde hay margen. Como mucho `max`.
 */
export function planInsights(opts: {
  packages: { name: string; goal: number | null; current: number; progress: ReturnType<typeof goalStatus> }[];
  unpackaged: { total: number; count: number };
  saving: { saved: number; goal: number | null };
  daysLeft: number;
  max?: number;
}): PlanInsight[] {
  const eur = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;
  const out: PlanInsight[] = [];
  for (const p of opts.packages) {
    if (p.progress?.status === "superado") out.push({ tone: "danger", text: `${p.name}: te has pasado ${eur(-p.progress.remaining)} del objetivo${opts.daysLeft > 0 ? ` y quedan ${opts.daysLeft} días de ciclo` : ""}` });
  }
  for (const p of opts.packages) {
    if (p.progress?.status === "atencion") out.push({ tone: "warning", text: `${p.name} va rápido: llevas el ${Math.round(p.progress.pct)} % con el ${Math.round(p.progress.expectedPct)} % del ciclo` });
  }
  if (opts.unpackaged.total > 0) out.push({ tone: "warning", text: `${eur(opts.unpackaged.total)} gastados que no están en ningún paquete (${opts.unpackaged.count} ${opts.unpackaged.count === 1 ? "cargo" : "cargos"})` });
  if (opts.saving.goal !== null && opts.saving.goal > 0 && opts.saving.saved < opts.saving.goal) out.push({ tone: "warning", text: opts.saving.saved < 0
    ? `Ahorro: este ciclo has gastado ${eur(-opts.saving.saved)} más de lo que has ingresado (objetivo ${eur(opts.saving.goal)})`
    : `Ahorro: llevas ${eur(opts.saving.saved)} de ${eur(opts.saving.goal)}` });
  for (const p of opts.packages) {
    if (p.progress?.status === "ok" && p.progress.remaining > 0 && p.progress.pct < p.progress.expectedPct - 15) out.push({ tone: "success", text: `${p.name} va ${eur(p.progress.remaining)} por debajo del objetivo: tienes margen` });
  }
  return out.slice(0, opts.max ?? 3);
}

// ── Inicio: resumen de cada grupo ────────────────────────────────────────────────────────────────

/** Gasto por categoría de un ciclo: entero (`full`) y hasta el mismo día del ciclo que hoy (`atDay`). */
export type GroupCycleTotals = {
  full: Record<string, number>;
  atDay: Record<string, number>;
  /** Gasto hasta el mismo día del ciclo por categoría y subcategoría (clave `categoria/subcategoria`, vacía si no tiene). */
  subAtDay?: Record<string, number>;
};
export type GroupStatus = "bien" | "atento" | "superado";

/**
 * Resumen determinista de un grupo para Inicio. `cycles[0]` es el ciclo actual (parcial) y los siguientes, los
 * cerrados del más reciente al más antiguo (solo los que tienen datos completos).
 * - Comparación con «tu media a estas alturas»: media de los 3 ciclos cerrados anteriores hasta el mismo día.
 * - Ritmo esperado hoy: el objetivo repartido según cómo sueles gastar en el grupo a lo largo del ciclo (si los
 *   recibos caen al principio, a principio de ciclo ya se espera casi todo); sin historial, reparto lineal.
 * - Ahorro de los últimos 3 ciclos frente a los 3 anteriores, cuando hay 6 cerrados.
 */
export function groupSummary(opts: { categories: string[]; cycles: GroupCycleTotals[]; goal: number | null; day: number; totalDays: number }) {
  const { categories, cycles, goal, day, totalDays } = opts;
  const sum = (r: Record<string, number> | undefined) => round2(categories.reduce((s, c) => s + (r?.[c] ?? 0), 0));
  const now = sum(cycles[0]?.full);
  const closed = cycles.slice(1);
  const ref = closed.slice(0, 3);
  const avg = (xs: number[]) => (xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const avgAtDay = avg(ref.map((c) => sum(c.atDay)));
  const avgFull = avg(ref.map((c) => sum(c.full)));
  const share = avgFull && avgFull > 0 && avgAtDay !== null
    ? Math.min(1, Math.max(0, avgAtDay / avgFull))
    : Math.min(1, Math.max(0, day / Math.max(1, totalDays)));
  const expected = goal === null ? null : round2(goal * share);
  const status: GroupStatus | null = goal === null ? null : now > goal ? "superado" : expected !== null && now > expected * 1.1 && now > 0 ? "atento" : "bien";
  const last3 = closed.slice(0, 3);
  const prev3 = closed.slice(3, 6);
  const saved3 = last3.length === 3 && prev3.length === 3
    ? round2(prev3.reduce((s, c) => s + sum(c.full), 0) - last3.reduce((s, c) => s + sum(c.full), 0))
    : null;
  return {
    now,
    goal,
    left: goal === null ? null : round2(goal - now),
    expected,
    status,
    avgAtDay,
    vsAvg: avgAtDay === null ? null : round2(now - avgAtDay),
    /** Del ciclo más antiguo al actual (máx. 7). */
    trend: cycles.slice(0, 7).map((c) => sum(c.full)).reverse(),
    saved3,
  };
}

// ── Inicio: ¿cumples tu plan? ────────────────────────────────────────────────────────────────────

export type Deviation = "peor" | "algo_peor" | "estable" | "mejor";
export const subKey = (category: string, sub: string | null | undefined) => `${category}/${(sub ?? "").trim()}`;

/** Estable si la diferencia es menor de 10 € o del 10 % de la referencia; peor desde el 25 % (o +50 € si no hay base). */
export function deviationOf(now: number, ref: number): { diff: number; pct: number | null; state: Deviation } {
  const diff = round2(now - ref);
  const pct = ref > 0 ? round2((diff / ref) * 100) : null;
  const state: Deviation = Math.abs(diff) < Math.max(10, Math.abs(ref) * 0.1) ? "estable"
    : diff < 0 ? "mejor"
    : (pct !== null ? pct >= 25 : diff >= 50) ? "peor" : "algo_peor";
  return { diff, pct, state };
}

export type PlanItem = { key: string; label: string; category: string; sub: string | null; now: number; ref: number; diff: number; pct: number | null; state: Deviation };
export type PlanGroupDeviation = {
  id: string; name: string; categories: string[];
  now: number; ref: number; basis: "objetivo" | "media"; diff: number; pct: number | null; state: Deviation;
  /** Qué explica la desviación: categorías o, si el grupo tiene una sola, sus subcategorías. */
  level: "categoria" | "subcategoria";
  moved: PlanItem[];
  unchanged: PlanItem[];
};

/**
 * ¿Cumples tu plan? Por grupo: lo gastado hasta hoy frente a lo esperable hoy (el objetivo repartido según tu
 * ritmo habitual si tiene objetivo; si no, tu media de los 3 ciclos anteriores hasta el mismo día). Dentro, solo lo
 * que se ha movido frente a su media (categorías, o subcategorías si el grupo es de una sola categoría).
 * Grupos sin objetivo ni historial no se pueden juzgar y no salen. Orden: de peor a mejor.
 */
export function planDeviations(opts: { groups: { id: string; name: string; categories: string[]; goal: number | null }[]; cycles: GroupCycleTotals[]; day: number; totalDays: number; labels?: (category: string) => string }) {
  const { groups, cycles, day, totalDays, labels = (c: string) => c } = opts;
  const cur = cycles[0];
  const ref3 = cycles.slice(1, 4);
  const avg = (get: (c: GroupCycleTotals) => number) => (ref3.length ? round2(ref3.reduce((s, c) => s + get(c), 0) / ref3.length) : null);
  const out: PlanGroupDeviation[] = [];
  for (const g of groups) {
    if (!g.categories.length || !cur) continue;
    const s = groupSummary({ categories: g.categories, cycles, goal: g.goal, day, totalDays });
    const basis = s.expected !== null ? "objetivo" : "media";
    const ref = s.expected ?? s.avgAtDay;
    if (ref === null) continue;
    let items: PlanItem[] = [];
    let level: PlanGroupDeviation["level"] = "categoria";
    if (g.categories.length === 1) {
      level = "subcategoria";
      const cat = g.categories[0];
      const keys = new Set<string>();
      for (const c of [cur, ...ref3]) for (const k of Object.keys(c.subAtDay ?? {})) if (k.startsWith(`${cat}/`)) keys.add(k);
      items = [...keys].flatMap((k) => {
        const a = avg((c) => c.subAtDay?.[k] ?? 0);
        if (a === null) return [];
        const sub = k.slice(cat.length + 1) || null;
        const now = round2(cur.subAtDay?.[k] ?? 0);
        return [{ key: k, label: sub ?? "Sin subcategoría", category: cat, sub, now, ref: a, ...deviationOf(now, a) }];
      });
    } else {
      items = g.categories.flatMap((cat) => {
        const a = avg((c) => c.atDay[cat] ?? 0);
        if (a === null) return [];
        const now = round2(cur.atDay[cat] ?? 0);
        return [{ key: cat, label: labels(cat), category: cat, sub: null, now, ref: a, ...deviationOf(now, a) }];
      });
    }
    items = items.filter((i) => i.now > 0 || i.ref > 0);
    const rank = (i: { diff: number }) => -i.diff;
    out.push({
      id: g.id, name: g.name, categories: g.categories, now: s.now, ref, basis, ...deviationOf(s.now, ref), level,
      moved: items.filter((i) => i.state !== "estable").sort((a, b) => rank(a) - rank(b)),
      unchanged: items.filter((i) => i.state === "estable").sort((a, b) => b.now - a.now),
    });
  }
  return out.sort((a, b) => b.diff - a.diff);
}

// ── Inicio: gráfico de gasto acumulado ───────────────────────────────────────────────────────────

/** Acumulado de un gasto diario por categorías (suma de las categorías dadas; `null` = todas). */
export function cumulative(daily: Record<string, number[]>, categories: string[] | null, days: number) {
  const out = Array(days).fill(0) as number[];
  for (const [cat, row] of Object.entries(daily)) {
    if (categories && !categories.includes(cat)) continue;
    for (let i = 0; i < Math.min(days, row.length); i++) out[i] += row[i];
  }
  for (let i = 1; i < days; i++) out[i] += out[i - 1];
  return out.map(round2);
}

/**
 * ¿Es un grupo de gasto gradual (se va gastando a lo largo del mes) o «estanco» (recibos fijos que entran de golpe)?
 * Estanco si en los ciclos cerrados gasta casi lo mismo cada mes (variación < 15 %) y el mes pasado lo hizo en
 * pocos días (≤ 6). Sin al menos dos ciclos cerrados, se trata como gradual.
 */
export function isGradual(categories: string[], cycles: GroupCycleTotals[], prevDaily: Record<string, number[]>) {
  const totals = cycles.slice(1, 4).map((c) => categories.reduce((s, cat) => s + (c.full[cat] ?? 0), 0));
  if (totals.length < 2) return true;
  const mean = totals.reduce((s, x) => s + x, 0) / totals.length;
  if (mean <= 0) return true;
  const sd = Math.sqrt(totals.reduce((s, x) => s + (x - mean) ** 2, 0) / totals.length);
  const days = new Set<number>();
  for (const cat of categories) (prevDaily[cat] ?? []).forEach((v, i) => { if (v > 0) days.add(i); });
  return !(sd / mean < 0.15 && days.size <= 6);
}
