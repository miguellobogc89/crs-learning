// lib/finance/plan.ts
// Planificación (la hucha): cuadre del plan del ciclo, límite semanal de cada partida, transferencias del día de
// cobro y lista de deseos. Funciones puras sobre los datos de logic.ts (sin base de datos): las usa service.ts y
// los tests. Nada está pensado para un usuario concreto: partidas, importes y cuentas los decide cada persona.
import { addDays, daysBetween, median, round2, toDate, type Budget, type BudgetStatus, type Cycle, type CycleSummary, type Recurring, type Tx } from "./logic";

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
